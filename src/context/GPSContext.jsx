/**
 * GPS Context — Cozy Car
 *
 * Provides live GPS positions for all fleet vehicles.
 * - Automatically polls iTrack every VITE_GPS_POLL_INTERVAL_MS milliseconds.
 * - Merges iTrack device data with vehicles in FleetContext by vehicle number / plate.
 * - Exposes per-vehicle GPS state keyed by Cozy vehicle ID.
 * - Tracks overall connection status and last successful sync time.
 */

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useCallback,
} from "react";
import { useFleet } from "./FleetContext";
import {
    fetchDeviceList,
    fetchLivePositions,
    normaliseGpsRecord,
} from "../services/itrackService";

const GPSContext = createContext(null);

const POLL_INTERVAL = Number(import.meta.env.VITE_GPS_POLL_INTERVAL_MS || 10000);

/**
 * Attempt to match a Cozy vehicle record to an iTrack device record.
 *
 * Matching strategy (in priority order):
 *   1. Vehicle number matches plate number (platenumber field, case-insensitive)
 *   2. Vehicle number is a substring of the device name (devicename field)
 *   3. Vehicle number appears in the IMEI field (last-resort)
 */
function matchVehicleToDevice(vehicle, devices) {
    const vNum = String(vehicle.number || "").replace(/\D/g, ""); // extract numbers
    const vRaw = String(vehicle.number || "").trim().toLowerCase();
    if (!vNum && !vRaw) return null;

    // 1. Exact plate match
    let match = devices.find(
        (d) => d.platenumber && d.platenumber.trim().toLowerCase() === vRaw
    );
    if (match) return match;

    // 2. Exact digits match in devicename
    if (vNum) {
        match = devices.find((d) => {
            const dDigits = String(d.devicename || "").replace(/\D/g, "");
            return dDigits === vNum || (d.devicename && d.devicename.includes(vNum));
        });
        if (match) return match;
    }

    // 3. Exact digits match in platenumber
    if (vNum) {
        match = devices.find((d) => {
            const pDigits = String(d.platenumber || "").replace(/\D/g, "");
            return pDigits === vNum || (d.platenumber && d.platenumber.includes(vNum));
        });
        if (match) return match;
    }

    // 4. Vehicle string is contained in device name
    match = devices.find(
        (d) => d.devicename && d.devicename.toLowerCase().includes(vRaw)
    );
    if (match) return match;

    // 4. Vehicle number is contained in device IMEI / id
    match = devices.find(
        (d) => (d.imei && String(d.imei).includes(vRaw)) || (d.id && String(d.id).includes(vRaw))
    );
    return match || null;
}

export function GPSProvider({ children }) {
    const { vehicles } = useFleet();

    // Map of Cozy vehicleId (number) → normalised GPS state object
    const [gpsData, setGpsData] = useState({});

    // Map of iTrack IMEI → Cozy vehicleId (built after device list is fetched)
    const [imeiToVehicleId, setImeiToVehicleId] = useState({});

    // All IMEIs we should poll (fetched once per session)
    const [allImeis, setAllImeis] = useState([]);

    // Global status for the GPS system
    const [systemStatus, setSystemStatus] = useState("Connecting"); // Connecting | Active | Error | No Credentials
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    const pollRef = useRef(null);
    const isPollingRef = useRef(false);

    // ── Check credentials ───────────────────────────────────────────────────
    const hasCredentials =
        Boolean(import.meta.env.VITE_ITRACK_ACCOUNT) &&
        Boolean(import.meta.env.VITE_ITRACK_PASSWORD) &&
        import.meta.env.VITE_ITRACK_ACCOUNT !== "YOUR_ITRACK_USERNAME_HERE";

    // ── Step 1: Load device list and build IMEI → vehicleId map ─────────────
    const initDeviceMap = useCallback(async () => {
        if (!hasCredentials || vehicles.length === 0) return;

        try {
            const devices = await fetchDeviceList();
            const imeiMap = {};
            const imeis = [];

            vehicles.forEach((vehicle) => {
                const device = matchVehicleToDevice(vehicle, devices);
                if (device && device.imei) {
                    const imei = String(device.imei);
                    imeiMap[imei] = vehicle.id;
                    imeis.push(imei);
                }
            });

            setImeiToVehicleId(imeiMap);
            setAllImeis(imeis);

            // Mark vehicles that could not be matched
            const unmatchedCount = vehicles.length - imeis.length;
            if (unmatchedCount > 0) {
                console.warn(
                    `[GPS] ${unmatchedCount} Cozy vehicle(s) could not be matched to any iTrack device.`
                );
            }
        } catch (err) {
            console.error("[GPS] Failed to load device list:", err);
            setSystemStatus("Error");
            setErrorMessage(`Device list failed: ${err.message}`);
        }
    }, [vehicles, hasCredentials]);

    // ── Step 2: Poll live positions ──────────────────────────────────────────
    const pollPositions = useCallback(async () => {
        if (isPollingRef.current || allImeis.length === 0) return;
        isPollingRef.current = true;

        try {
            const records = await fetchLivePositions(allImeis);

            setGpsData((prev) => {
                const updated = { ...prev };
                records.forEach((record) => {
                    const imei = String(record.imei || "");
                    const vehicleId = imeiToVehicleId[imei];
                    if (vehicleId !== undefined) {
                        updated[vehicleId] = normaliseGpsRecord(record);
                    }
                });
                return updated;
            });

            setSystemStatus("Active");
            setLastSyncTime(new Date().toISOString());
            setErrorMessage(null);
        } catch (err) {
            console.error("[GPS] Poll failed:", err);
            setSystemStatus("Error");
            setErrorMessage(err.message);
        } finally {
            isPollingRef.current = false;
        }
    }, [allImeis, imeiToVehicleId]);

    // ── Bootstrap on mount ──────────────────────────────────────────────────
    useEffect(() => {
        if (!hasCredentials) {
            setSystemStatus("No Credentials");
            setErrorMessage(
                "iTrack credentials are not configured. Fill in VITE_ITRACK_ACCOUNT and VITE_ITRACK_PASSWORD in .env then restart the dev server."
            );
            return;
        }
        initDeviceMap();
    }, [initDeviceMap, hasCredentials]);

    // ── Start/restart polling whenever the IMEI list changes ────────────────
    useEffect(() => {
        if (allImeis.length === 0) return;

        // Immediate first poll
        pollPositions();

        // Then schedule recurring polls
        pollRef.current = setInterval(pollPositions, POLL_INTERVAL);

        return () => {
            clearInterval(pollRef.current);
        };
    }, [allImeis, pollPositions]);

    // ── Convenience helpers ─────────────────────────────────────────────────

    /** Get the GPS state for a specific Cozy vehicle by its numeric ID */
    const getVehicleGPS = useCallback(
        (vehicleId) => gpsData[vehicleId] || null,
        [gpsData]
    );

    /** Force an immediate refresh outside the normal poll cycle */
    const refresh = useCallback(() => pollPositions(), [pollPositions]);

    /** True if we have live GPS data for at least one vehicle */
    const hasLiveData = Object.keys(gpsData).length > 0;

    const value = {
        gpsData,           // { [vehicleId]: NormalisedGPSState }
        systemStatus,      // "Connecting" | "Active" | "Error" | "No Credentials"
        lastSyncTime,      // ISO string or null
        errorMessage,      // string or null
        hasLiveData,
        getVehicleGPS,
        refresh,
        imeiToVehicleId,   // For debugging / advanced use
        trackedCount: Object.keys(gpsData).length,
        totalVehicles: vehicles.length,
    };

    return (
        <GPSContext.Provider value={value}>
            {children}
        </GPSContext.Provider>
    );
}

export function useGPS() {
    const ctx = useContext(GPSContext);
    if (!ctx) throw new Error("useGPS must be used inside GPSProvider");
    return ctx;
}
