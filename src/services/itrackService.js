/**
 * iTrack GPS API Service — Cozy Car
 *
 * Uses the Web Portal API (LoginService & LocationService) via Vite Proxy (/itrack-proxy).
 * Works directly with normal web account credentials (no open API restrictions).
 */

import CryptoJS from "crypto-js";

const API_BASE = import.meta.env.DEV ? "/itrack-proxy" : (import.meta.env.VITE_ITRACK_API_BASE || "https://www.itrack.top");
const ACCOUNT  = import.meta.env.VITE_ITRACK_ACCOUNT;
const PASSWORD = import.meta.env.VITE_ITRACK_PASSWORD;

// Token cache: { token: string, expiresAt: number (ms) }
let _tokenCache = null;

/**
 * Fetch a fresh web token from iTrack LoginService.
 * Password is MD5-hashed once.
 */
async function fetchAccessToken() {
    if (!ACCOUNT || !PASSWORD) {
        throw new Error("iTrack account credentials missing in .env");
    }

    const md5Pass = CryptoJS.MD5(PASSWORD).toString();
    const url = `${API_BASE}/LoginService?method=login&username=${encodeURIComponent(ACCOUNT)}&passwd=${md5Pass}&logintype=webcustomer&tzOffset=0`;

    const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        throw new Error(`iTrack login failed: HTTP ${response.status}`);
    }

    // 1. Attempt to extract token from our custom header added by the Vite proxy
    let token = response.headers.get("x-itrack-token") || "";

    // 2. Attempt to extract token from Set-Cookie header if exposed
    if (!token) {
        const setCookie = response.headers.get("set-cookie") || "";
        const tokenMatch = setCookie.match(/token=([^;]+)/);
        if (tokenMatch) {
            token = tokenMatch[1];
        }
    }

    const data = await response.json();
    if (data.errorcode !== 0) {
        throw new Error(`iTrack login error (code ${data.errorcode}): ${data.errormsg || 'Unknown error'}`);
    }

    // 3. Fallback to document.cookie if available
    if (!token && typeof document !== "undefined") {
        const match = document.cookie.match(/token=([^;]+)/);
        if (match) token = match[1];
    }

    return {
        token: token || "session_active",
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    };
}

/**
 * Returns a valid access token, refreshing if expired.
 */
export async function getToken() {
    if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
        return _tokenCache.token;
    }
    _tokenCache = await fetchAccessToken();
    return _tokenCache.token;
}

/**
 * Invalidate cached token.
 */
export function invalidateToken() {
    _tokenCache = null;
}

/**
 * Fetch the full device list from the mobile home dashboard.
 * Returns array of device objects: { id: string, devicename: string, platenumber: string, devicetype: string, imei: string }
 */
export async function fetchDeviceList() {
    const token = await getToken();
    const tokenParam = token && token !== "session_active" ? `&token=${encodeURIComponent(token)}` : "";
    const url = `${API_BASE}/mobile/?_p=home${tokenParam}&_t=${Date.now()}`;

    const response = await fetch(url, {
        credentials: "include",
    });
    if (!response.ok) {
        throw new Error(`iTrack device list failed: HTTP ${response.status}`);
    }

    const html = await response.text();
    const dls = html.match(/<dl>[\s\S]*?<\/dl>/g) || [];
    const devices = [];

    for (const dl of dls) {
        const idMatch = dl.match(/_p=devices&id=(\d+)/);
        const nameMatch = dl.match(/<h2><a[^>]*>(.*?)<\/a><\/h2>/);
        const modelMatch = dl.match(/Model:([^<]+)/);
        const plateMatch = dl.match(/Vehicle Plate Number:([^<]*)/);

        if (idMatch) {
            const deviceId = idMatch[1];
            const name = nameMatch ? nameMatch[1].trim() : "";
            const model = modelMatch ? modelMatch[1].trim() : "";
            const plate = plateMatch ? plateMatch[1].trim() : "";

            devices.push({
                id: deviceId,
                devicename: name,
                platenumber: plate || name,
                devicetype: model,
                imei: deviceId, // Use deviceId as tracking key
            });
        }
    }

    return devices;
}

/**
 * Fetch real-time GPS data for a single device ID.
 */
export async function fetchDeviceLocation(deviceId) {
    const token = await getToken();
    const tokenParam = token && token !== "session_active" ? `&token=${encodeURIComponent(token)}` : "";
    const url = `${API_BASE}/LocationService?method=deviceAndGpsone&deviceid=${deviceId}${tokenParam}&_t=${Date.now()}`;

    const response = await fetch(url, {
        credentials: "include",
    });
    if (!response.ok) {
        throw new Error(`GPS fetch failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.errorcode === 10003) {
        // Session expired, retry once with fresh token
        invalidateToken();
        const freshToken = await getToken();
        const retryParam = freshToken && freshToken !== "session_active" ? `&token=${encodeURIComponent(freshToken)}` : "";
        const retryUrl = `${API_BASE}/LocationService?method=deviceAndGpsone&deviceid=${deviceId}${retryParam}&_t=${Date.now()}`;
        const retryRes = await fetch(retryUrl, { credentials: "include" });
        return retryRes.json();
    }

    return data;
}

/**
 * Fetch real-time GPS data for a list of device IDs (in batches to ensure stability).
 */
export async function fetchLivePositions(deviceIds) {
    if (!deviceIds || deviceIds.length === 0) return [];

    const BATCH_SIZE = 6;
    const allResults = [];

    for (let i = 0; i < deviceIds.length; i += BATCH_SIZE) {
        const batch = deviceIds.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (id) => {
            try {
                const data = await fetchDeviceLocation(id);
                if (data.errorcode === 0 && Array.isArray(data.records) && data.records.length > 0) {
                    const rec = data.records[0];
                    const key = data.key || {};
                    return {
                        imei: String(id),
                        deviceid: id,
                        latitude: Number(rec[key.lat]),
                        longitude: Number(rec[key.lng]),
                        speed: Number(rec[key.speed] || 0),
                        course: Number(rec[key.course] || 0),
                        accstatus: Number(rec[key.accstatus] || 0),
                        gpstime: rec[key.gpstime] ? Math.floor(rec[key.gpstime] / 1000) : null,
                        servertime: rec[key.systime] ? Math.floor(rec[key.systime] / 1000) : null,
                        hearttime: rec[key.hearttime] ? Math.floor(rec[key.hearttime] / 1000) : null,
                        datastatus: rec[key.locationstatus],
                        devicename: rec[key.device_name],
                    };
                }
                return null;
            } catch (err) {
                console.warn(`[GPS] Failed to fetch device #${id}:`, err.message);
                return null;
            }
        });

        const batchResults = await Promise.all(promises);
        allResults.push(...batchResults.filter(Boolean));
    }

    return allResults;
}

/**
 * Determine the connection status of a GPS record based on how old the data is.
 */
export function getGpsStatus(record) {
    const staleThreshold = Number(import.meta.env.VITE_GPS_STALE_THRESHOLD_SECONDS || 300);
    const now = Math.floor(Date.now() / 1000);

    if (!record || !record.latitude || !record.longitude) return "Offline";

    const lastGps = Number(record.gpstime || 0);

    if (!lastGps) return "No GPS";
    const diff = now - lastGps;
    if (diff > 86400 * 2) return "Offline"; // Over 48 hours without signal
    if (diff > staleThreshold) return "Stale";

    return "Online";
}

/**
 * Map an iTrack record to a normalised GPS state object used in Cozy.
 */
export function normaliseGpsRecord(record) {
    return {
        imei:         String(record.imei || record.deviceid || ""),
        lat:          Number(record.latitude  || 0),
        lng:          Number(record.longitude || 0),
        speed:        Number(record.speed     || 0),
        course:       Number(record.course    || 0),
        ignition:     record.accstatus === 1,
        moving:       Number(record.speed || 0) > 2,
        gpsTime:      record.gpstime   ? new Date(record.gpstime   * 1000).toISOString() : null,
        serverTime:   record.servertime ? new Date(record.servertime * 1000).toISOString() : null,
        status:       getGpsStatus(record),
        raw:          record,
    };
}
