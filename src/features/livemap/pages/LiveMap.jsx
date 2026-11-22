import { useEffect, useRef, useState, useCallback } from "react";
import {
    MapPin, RefreshCw, Wifi, WifiOff, AlertCircle,
    Bus, Zap, Clock, Gauge, Navigation, RotateCcw, Settings, Building2
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "react-i18next";
import { useGPS } from "../../../context/GPSContext";
import { useFleet } from "../../../context/FleetContext";
import { Link } from "react-router-dom";

const STATUS_CONFIG = {
    Online:          { color: "#10b981", bg: "bg-emerald-100 text-emerald-800", labelKey: "Online",   icon: Wifi },
    Stale:           { color: "#f59e0b", bg: "bg-amber-100 text-amber-800",     labelKey: "Stale",    icon: Clock },
    Offline:         { color: "#ef4444", bg: "bg-red-100 text-red-800",         labelKey: "Offline",  icon: WifiOff },
    "No GPS":        { color: "#6b7280", bg: "bg-slate-100 text-slate-600",     labelKey: "No GPS",   icon: AlertCircle },
    "No Credentials":{ color: "#6b7280", bg: "bg-slate-100 text-slate-600",     labelKey: "Not Set",  icon: Settings },
};

// ── Bounds for Cairo, Giza, and Qalyubia only ───────────────────────────────
const GREATER_CAIRO_BOUNDS = [
    [29.70, 30.70], // Southwest: South Giza / 6th October / Helwan
    [30.55, 31.85], // Northeast: North Qalyubia / New Cairo / Badr
];
const GREATER_CAIRO_CENTER = [30.08, 31.28];

// ── Three Main Company Branches (Teleperformance Egypt) ─────────────────────
export const COMPANY_BRANCHES = [
    {
        id: "tp-plaza",
        name: "Teleperformance Plaza (تيلي برفورمنس بلازا)",
        shortName: "TP Plaza",
        coords: [30.0245, 31.4410],
        address: "شارع التسعين، القطاع الأول، التجمع الخامس، القاهرة الجديدة",
        color: "#6366f1", // Indigo
    },
    {
        id: "tp-1k",
        name: "Teleperformance 1K (وان قطامية)",
        shortName: "1K",
        coords: [29.9806, 31.3562],
        address: "مجمع وان قطامية، الطريق الدائري، معمار المرشدي",
        color: "#0284c7", // Sky Blue
    },
    {
        id: "tp-citywalk",
        name: "Teleperformance City Walk (سيتي ووك)",
        shortName: "City Walk",
        coords: [30.0165, 31.3882],
        address: "محور المشير طنطاوي، القاهرة",
        color: "#8b5cf6", // Purple
    },
];

/** Build a distinctive landmark pin for the three company branches */
function createBranchIcon(branch) {
    const html = `
        <div class="branch-map-marker" style="
            position: absolute;
            transform: translate(-50%, -100%);
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            filter: drop-shadow(0 4px 10px rgba(0,0,0,0.35));
        ">
            <div style="
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: #0f172a;
                color: #ffffff;
                padding: 4px 10px;
                border-radius: 9px;
                border: 2px solid ${branch.color};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 11px;
                font-weight: 800;
                white-space: nowrap;
            ">
                <span style="
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: ${branch.color};
                    box-shadow: 0 0 8px ${branch.color};
                "></span>
                <span>🏢 ${branch.shortName}</span>
            </div>
            <div style="
                width: 0;
                height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 7px solid ${branch.color};
                margin-top: -1px;
            "></div>
        </div>
    `;

    return L.divIcon({
        className: "custom-leaflet-marker",
        html: html,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -32],
    });
}

/** Build a compact, readable marker for Leaflet with a small directional arrow and vehicle name */
function createVehicleIcon(vehicle, gps, color, defaultCarLabel) {
    const displayName = gps?.raw?.devicename || vehicle?.number || defaultCarLabel || "Car";
    const moving = Boolean(gps?.moving);
    const heading = Number(gps?.course || 0);
    const speed = Math.round(Number(gps?.speed || 0));

    // Small clear directional arrow (18-20px) pointing along vehicle's real movement heading
    const arrowIndicator = moving
        ? `<div style="
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: ${color};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.25);
            flex-shrink: 0;
            transform: rotate(${heading}deg);
            transition: transform 0.25s ease;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="white">
                <polygon points="12,2 22,22 12,17 2,22"/>
            </svg>
          </div>`
        : `<div style="
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: ${color};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            flex-shrink: 0;
          ">
            <span style="display:block;width:5px;height:5px;border-radius:50%;background:#ffffff;"></span>
          </div>`;

    const speedTag = speed > 0
        ? `<span style="font-size:9px;font-weight:700;color:#2563eb;background:#eff6ff;padding:1px 4px;border-radius:9999px;line-height:1;margin-left:2px;">${speed}k</span>`
        : "";

    const html = `
        <div class="vehicle-map-pill" style="
            position: absolute;
            transform: translate(-50%, -50%);
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: #ffffff;
            color: #0f172a;
            padding: 3px 8px 3px 4px;
            border-radius: 9999px;
            border: 1.5px solid ${color};
            box-shadow: 0 2px 8px rgba(15, 23, 42, 0.28);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            cursor: pointer;
            user-select: none;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        ">
            ${arrowIndicator}
            <span style="direction: rtl; unicode-bidi: plaintext; font-size: 11px; font-weight: 700; color: #1e293b; letter-spacing: -0.2px;">
                ${displayName}
            </span>
            ${speedTag}
        </div>
    `;

    return L.divIcon({
        className: "custom-leaflet-marker",
        html: html,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -18],
    });
}

function StatusBadge({ status }) {
    const { t } = useTranslation();
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Offline;
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.bg}`}>
            <Icon size={11} />
            {t(`LiveMap.statuses.${cfg.labelKey}`)}
        </span>
    );
}

function VehiclePanel({ vehicle, gps, onFocus }) {
    const { t } = useTranslation();
    const cfg = STATUS_CONFIG[gps?.status] || STATUS_CONFIG.Offline;
    return (
        <button
            onClick={() => onFocus(vehicle, gps)}
            className="w-full text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition group"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-white flex-shrink-0"
                        style={{ backgroundColor: cfg.color }}
                    >
                        <Bus size={15} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-800">#{vehicle.number}</p>
                        <p className="text-[10px] text-slate-400">{vehicle.type}</p>
                    </div>
                </div>
                <StatusBadge status={gps?.status || "Offline"} />
            </div>

            {gps && gps.status !== "Offline" && gps.status !== "No GPS" && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="flex items-center gap-1 text-slate-600">
                        <Gauge size={11} className="text-blue-500" />
                        <span>{t("LiveMap.speedKmH", { speed: gps.speed })}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600">
                        <Navigation size={11} className="text-indigo-500" />
                        <span>{t("LiveMap.courseDeg", { course: gps.course })}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1 text-slate-500">
                        <Zap size={11} className={gps.ignition ? "text-emerald-500" : "text-slate-400"} />
                        <span>{gps.ignition ? t("LiveMap.ignitionOn") : t("LiveMap.ignitionOff")}</span>
                        {gps.moving && (
                            <span className="ml-auto rounded-full bg-blue-50 px-1.5 py-px text-blue-700 font-semibold">
                                {t("LiveMap.movingBadge")}
                            </span>
                        )}
                    </div>
                    {gps.gpsTime && (
                        <div className="col-span-2 text-slate-400 text-[10px]">
                            {t("LiveMap.lastFix", { time: new Date(gps.gpsTime).toLocaleTimeString() })}
                        </div>
                    )}
                </div>
            )}
        </button>
    );
}

export default function LiveMap() {
    const { t } = useTranslation();
    const { gpsData, systemStatus, lastSyncTime, errorMessage, refresh, trackedCount, totalVehicles } = useGPS();
    const { vehicles } = useFleet();

    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markersRef = useRef({}); // vehicleId → L.marker

    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filterStatus, setFilterStatus] = useState("All");
    const hasInitialFit = useRef(false);

    // ── Build popup HTML ─────────────────────────────────────────────────────
    const buildPopupContent = useCallback((vehicle, gps) => {
        const cfg = STATUS_CONFIG[gps?.status] || STATUS_CONFIG.Offline;
        const lastFix = gps?.gpsTime ? new Date(gps.gpsTime).toLocaleString() : "—";
        const displayName = gps?.raw?.devicename || t("LiveMap.vehicleDefaultName", { number: vehicle.number });
        const statusLabel = t(`LiveMap.statuses.${cfg.labelKey}`);
        const speedLabel = t("LiveMap.speed");
        const speedVal = t("LiveMap.speedKmH", { speed: gps?.speed || 0 });
        const headingLabel = t("LiveMap.heading");
        const headingVal = t("LiveMap.courseDeg", { course: gps?.course || 0 });
        const ignitionLabel = t("LiveMap.ignition");
        const ignitionVal = gps?.ignition ? t("LiveMap.ignitionOnVal") : t("LiveMap.ignitionOffVal");
        const movementLabel = t("LiveMap.movement");
        const movementVal = gps?.moving ? t("LiveMap.movingVal") : t("LiveMap.stoppedVal");
        const lastFixLabel = t("LiveMap.lastFix", { time: "" }).replace(/:\s*$/, "") || "Last fix";
        const coordinatesLabel = t("LiveMap.coordinates");
        const coordsVal = `${gps?.lat?.toFixed(5) || 0}, ${gps?.lng?.toFixed(5) || 0}`;

        return `
            <div style="font-family:sans-serif;font-size:12px;min-width:190px;padding:2px">
                <div style="font-weight:700;font-size:14px;margin-bottom:4px;color:#1e293b;direction:rtl;text-align:right">
                    ${displayName}
                    <span style="font-weight:400;font-size:11px;color:#64748b;margin-right:4px">(${vehicle.type})</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cfg.color}"></span>
                    <span style="font-size:11px;font-weight:600">${statusLabel}</span>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:11px">
                    <tr><td style="color:#64748b;padding:2px 0">${speedLabel}</td><td style="font-weight:600;text-align:right">${speedVal}</td></tr>
                    <tr><td style="color:#64748b;padding:2px 0">${headingLabel}</td><td style="font-weight:600;text-align:right">${headingVal}</td></tr>
                    <tr><td style="color:#64748b;padding:2px 0">${ignitionLabel}</td><td style="font-weight:600;text-align:right">${ignitionVal}</td></tr>
                    <tr><td style="color:#64748b;padding:2px 0">${movementLabel}</td><td style="font-weight:600;text-align:right">${movementVal}</td></tr>
                    <tr><td style="color:#64748b;padding:2px 0">${lastFixLabel}</td><td style="font-weight:600;text-align:right">${lastFix}</td></tr>
                    <tr><td style="color:#64748b;padding:2px 0">${coordinatesLabel}</td><td style="font-weight:600;text-align:right">${coordsVal}</td></tr>
                </table>
            </div>
        `;
    }, [t]);

    // ── Initialise Leaflet Map (Restricted strictly to Cairo, Giza, and Qalyubia) ─────────
    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        // Centre of Cairo / Giza / Qalyubia region
        const map = L.map(mapRef.current, {
            center: GREATER_CAIRO_CENTER,
            zoom: 11,
            minZoom: 10,
            maxZoom: 18,
            maxBounds: GREATER_CAIRO_BOUNDS,
            maxBoundsViscosity: 1.0,
            zoomControl: true,
        });

        // OpenStreetMap tile layer (Fast, free, reliable, no API key required)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
        }).addTo(map);

        // Add 3 Main Company Branch Landmark Markers (Teleperformance Egypt)
        COMPANY_BRANCHES.forEach((branch) => {
            const branchMarker = L.marker(branch.coords, {
                icon: createBranchIcon(branch),
                title: branch.name,
                zIndexOffset: 800,
            }).addTo(map);

            branchMarker.bindPopup(`
                <div style="font-family:sans-serif;font-size:12px;min-width:210px;padding:3px;direction:rtl;text-align:right">
                    <div style="font-weight:800;font-size:14px;color:#0f172a;margin-bottom:3px">
                        🏢 ${branch.name}
                    </div>
                    <div style="color:#64748b;font-size:11px;margin-bottom:6px">
                        ${branch.address}
                    </div>
                    <div style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;background:${branch.color}18;color:${branch.color};border:1px solid ${branch.color}50">
                        ${t("LiveMap.mainBranchBadge")}
                    </div>
                </div>
            `);
        });

        mapInstance.current = map;

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, [t]);

    // ── Update Leaflet Markers when GPS data changes ──────────────────────────
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;
        const validCoords = [];
        const defaultCarLabel = t("LiveMap.defaultCar");

        vehicles.forEach((vehicle) => {
            const gps = gpsData[vehicle.id];
            if (!gps || !gps.lat || !gps.lng) {
                if (markersRef.current[vehicle.id]) {
                    map.removeLayer(markersRef.current[vehicle.id]);
                    delete markersRef.current[vehicle.id];
                }
                return;
            }

            validCoords.push([gps.lat, gps.lng]);
            const cfg = STATUS_CONFIG[gps.status] || STATUS_CONFIG.Offline;
            const icon = createVehicleIcon(vehicle, gps, cfg.color, defaultCarLabel);
            const latLng = [gps.lat, gps.lng];
            const markerTitle = t("LiveMap.vehicleTitle", { number: vehicle.number, status: t(`LiveMap.statuses.${cfg.labelKey}`) });

            if (markersRef.current[vehicle.id]) {
                const marker = markersRef.current[vehicle.id];
                marker.setLatLng(latLng);
                marker.setIcon(icon);
                marker.setPopupContent(buildPopupContent(vehicle, gps));
            } else {
                const marker = L.marker(latLng, { icon, title: markerTitle })
                    .addTo(map)
                    .bindPopup(buildPopupContent(vehicle, gps));

                marker.on("click", () => {
                    setSelectedVehicle({ vehicle, gps });
                });

                markersRef.current[vehicle.id] = marker;
            }
        });

        // Fit map bounds to show all active vehicles on initial load within region
        if (!hasInitialFit.current && validCoords.length > 0) {
            map.fitBounds(validCoords, { padding: [40, 40], maxZoom: 13 });
            hasInitialFit.current = true;
        }
    }, [gpsData, vehicles, buildPopupContent, t]);

    // ── Fit map to all tracked vehicles or Cairo region ──────────────────────
    const fitAllVehicles = useCallback(() => {
        if (!mapInstance.current) return;
        const coords = vehicles
            .map((v) => gpsData[v.id])
            .filter((g) => g && g.lat && g.lng)
            .map((g) => [g.lat, g.lng]);

        if (coords.length > 0) {
            mapInstance.current.fitBounds(coords, { padding: [40, 40], maxZoom: 13 });
        } else {
            mapInstance.current.fitBounds(GREATER_CAIRO_BOUNDS);
        }
    }, [vehicles, gpsData]);

    // ── Focus map on a specific company branch ──────────────────────────────
    const focusBranch = useCallback((branch) => {
        if (!mapInstance.current || !branch?.coords) return;
        mapInstance.current.setView(branch.coords, 16, { animate: true });
    }, []);

    // ── Focus map on a vehicle ───────────────────────────────────────────────
    const focusVehicle = useCallback((vehicle, gps) => {
        if (!mapInstance.current || !gps?.lat || !gps?.lng) return;
        setSelectedVehicle({ vehicle, gps });
        mapInstance.current.setView([gps.lat, gps.lng], 16, { animate: true });

        const marker = markersRef.current[vehicle.id];
        if (marker) {
            marker.openPopup();
        }
    }, []);

    // ── Manual refresh ───────────────────────────────────────────────────────
    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refresh();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    // ── Filtered vehicle list for sidebar ────────────────────────────────────
    const filteredVehicles = vehicles.filter((v) => {
        if (filterStatus === "All") return true;
        const gps = gpsData[v.id];
        return (gps?.status || "Offline") === filterStatus;
    });

    const sysCfg = STATUS_CONFIG[systemStatus] || STATUS_CONFIG.Offline;
    const SysIcon = sysCfg.icon;

    const onlineCount  = vehicles.filter((v) => gpsData[v.id]?.status === "Online").length;
    const staleCount   = vehicles.filter((v) => gpsData[v.id]?.status === "Stale").length;
    const offlineCount = vehicles.filter((v) => !gpsData[v.id] || gpsData[v.id]?.status === "Offline").length;
    const movingCount  = vehicles.filter((v) => gpsData[v.id]?.moving).length;

    return (
        <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* Custom Marker CSS */}
            <style>{`
                .custom-leaflet-marker {
                    background: transparent !important;
                    border: none !important;
                }
                .custom-leaflet-marker:hover .vehicle-map-pill {
                    transform: translate(-50%, -50%) scale(1.08) !important;
                    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.4) !important;
                    z-index: 99999 !important;
                }
            `}</style>

            {/* ── Left Panel: Vehicle List ──────────────────────────────── */}
            <div className="flex w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-slate-50">

                {/* Header */}
                <div className="border-b border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-base font-bold text-slate-800">{t("LiveMap.title")}</h2>
                            <p className="text-xs text-slate-500">
                                {t("LiveMap.trackedCount", { tracked: trackedCount, total: totalVehicles })}
                            </p>
                        </div>
                        <button
                            onClick={handleRefresh}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 transition"
                            title={t("LiveMap.refreshTitle")}
                        >
                            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                        </button>
                    </div>

                    {/* System status */}
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${sysCfg.bg}`}>
                        <SysIcon size={13} />
                        <span className="font-semibold">
                            {t("LiveMap.gpsSystem", { status: t(`LiveMap.statuses.${sysCfg.labelKey}`) })}
                        </span>
                    </div>

                    {lastSyncTime && (
                        <p className="mt-1.5 text-[10px] text-slate-400">
                            {t("LiveMap.lastSync", { time: new Date(lastSyncTime).toLocaleTimeString() })}
                        </p>
                    )}

                    {errorMessage && (
                        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700">
                            {errorMessage}
                            {systemStatus === "No Credentials" && (
                                <Link to="/settings" className="ml-1 underline font-semibold">
                                    {t("LiveMap.goToSettings")}
                                </Link>
                            )}
                        </div>
                    )}
                </div>

                {/* Company Branches (Teleperformance) */}
                <div className="border-b border-slate-200 p-3 bg-slate-100/70">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("LiveMap.mainBranches")}</span>
                        <Building2 size={13} className="text-indigo-600" />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {COMPANY_BRANCHES.map((b) => (
                            <button
                                key={b.id}
                                onClick={() => focusBranch(b)}
                                className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-2 hover:border-indigo-400 hover:shadow-xs transition text-center cursor-pointer group"
                                title={b.name}
                            >
                                <span className="h-2 w-2 rounded-full mb-1 group-hover:scale-125 transition" style={{ backgroundColor: b.color }} />
                                <span className="text-[11px] font-bold text-slate-800 leading-tight">{b.shortName}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-1 border-b border-slate-200 p-3 text-center text-[11px]">
                    <div className="rounded-lg bg-emerald-50 py-1.5">
                        <div className="font-bold text-emerald-700 text-sm">{onlineCount}</div>
                        <div className="text-emerald-600">{t("LiveMap.statOnline")}</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 py-1.5">
                        <div className="font-bold text-blue-700 text-sm">{movingCount}</div>
                        <div className="text-blue-600">{t("LiveMap.statMoving")}</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 py-1.5">
                        <div className="font-bold text-amber-700 text-sm">{staleCount}</div>
                        <div className="text-amber-600">{t("LiveMap.statStale")}</div>
                    </div>
                    <div className="rounded-lg bg-red-50 py-1.5">
                        <div className="font-bold text-red-700 text-sm">{offlineCount}</div>
                        <div className="text-red-600">{t("LiveMap.statOffline")}</div>
                    </div>
                </div>

                {/* Filter */}
                <div className="border-b border-slate-200 p-3">
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                    >
                        <option value="All">{t("LiveMap.allVehiclesOption", { count: vehicles.length })}</option>
                        <option value="Online">{t("LiveMap.onlineOption", { count: onlineCount })}</option>
                        <option value="Stale">{t("LiveMap.staleOption", { count: staleCount })}</option>
                        <option value="Offline">{t("LiveMap.offlineOption", { count: offlineCount })}</option>
                    </select>
                </div>

                {/* Vehicle Cards */}
                <div className="flex-1 overflow-y-auto space-y-2 p-3">
                    {filteredVehicles.length === 0 && (
                        <div className="py-8 text-center text-xs text-slate-400">
                            {t("LiveMap.noVehiclesCategory")}
                        </div>
                    )}
                    {filteredVehicles.map((vehicle) => (
                        <VehiclePanel
                            key={vehicle.id}
                            vehicle={vehicle}
                            gps={gpsData[vehicle.id] || null}
                            onFocus={focusVehicle}
                        />
                    ))}
                </div>
            </div>

            {/* ── Right Panel: Map ───────────────────────────────── */}
            <div className="relative flex-1">
                {/* The Leaflet map container */}
                <div ref={mapRef} className="h-full w-full z-0" />

                {/* Selected vehicle overlay */}
                {selectedVehicle && (
                    <div className="absolute bottom-4 right-4 z-[1000] w-64 rounded-2xl bg-white shadow-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-slate-800">#{selectedVehicle.vehicle.number}</span>
                            <button
                                onClick={() => setSelectedVehicle(null)}
                                className="text-slate-400 hover:text-slate-700"
                            >
                                ✕
                            </button>
                        </div>
                        <StatusBadge status={selectedVehicle.gps?.status || "Offline"} />
                        {selectedVehicle.gps && (
                            <div className="mt-3 space-y-1 text-xs text-slate-600">
                                <div className="flex justify-between">
                                    <span>{t("LiveMap.speed")}</span>
                                    <strong>{t("LiveMap.speedKmH", { speed: selectedVehicle.gps.speed })}</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span>{t("LiveMap.heading")}</span>
                                    <strong>{t("LiveMap.courseDeg", { course: selectedVehicle.gps.course })}</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span>{t("LiveMap.ignition")}</span>
                                    <strong>{selectedVehicle.gps.ignition ? t("LiveMap.ignitionOnVal") : t("LiveMap.ignitionOffVal")}</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span>{t("LiveMap.latLng")}</span>
                                    <strong>{selectedVehicle.gps.lat.toFixed(4)}, {selectedVehicle.gps.lng.toFixed(4)}</strong>
                                </div>
                                {selectedVehicle.gps.gpsTime && (
                                    <div className="flex justify-between">
                                        <span>{t("LiveMap.lastFix", { time: "" }).replace(/:\s*$/, "") || "Last fix"}</span>
                                        <strong>{new Date(selectedVehicle.gps.gpsTime).toLocaleTimeString()}</strong>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Refresh indicator overlay */}
                {systemStatus === "Active" && (
                    <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-sm border border-emerald-200 px-3 py-1.5 shadow-sm text-xs">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-emerald-700 font-semibold">{t("LiveMap.liveGpsActive")}</span>
                        <span className="text-slate-400">
                            {t("LiveMap.updatesEvery", { seconds: Math.round(Number(import.meta.env.VITE_GPS_POLL_INTERVAL_MS || 10000) / 1000) })}
                        </span>
                    </div>
                )}

                {/* Map Control Buttons & Branch Quick Jumps */}
                <div className="absolute top-3 right-3 z-[1000] flex flex-wrap items-center gap-2">
                    {/* Branch quick jump buttons */}
                    <div className="hidden sm:flex items-center gap-1 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200 p-1 shadow-sm text-xs">
                        <span className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("LiveMap.branchesLabel")}</span>
                        {COMPANY_BRANCHES.map((b) => (
                            <button
                                key={b.id}
                                onClick={() => focusBranch(b)}
                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                title={b.name}
                            >
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                                <span>{b.shortName}</span>
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={fitAllVehicles}
                        className="flex items-center gap-1.5 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200 px-3 py-2 shadow-sm text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                        title={t("LiveMap.fitAllTitle")}
                    >
                        <RotateCcw size={13} className="text-blue-500" />
                        <span>{t("LiveMap.centerFleet")}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
