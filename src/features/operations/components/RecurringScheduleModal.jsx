import { useState, useMemo, useEffect } from "react";
import {
    Clock,
    Check,
    Save,
    RotateCcw,
    AlertCircle,
    Sparkles,
    TrendingUp,
    TrendingDown,
    Minus,
    Plus,
    Info,
    ShieldAlert,
    CheckCircle2
} from "lucide-react";
import { useOperations } from "../../../context/OperationsContext";
import { useRoutes } from "../../../context/RoutesContext";
import { useFleet } from "../../../context/FleetContext";
import {
    ATTENDANCE_RULES,
    ATTENDANCE_HOURS,
    DEPARTURE_SLOT_TIMES,
    getSlotRecommendation,
    recordSchedulingDecision,
    analyzeScheduleHealth
} from "../../../utils/aiLearningEngine";

export default function RecurringScheduleModal({ isOpen, onClose }) {
    const { operations, setOperations } = useOperations();
    const { routes } = useRoutes();
    const { vehicles, dailyAvailability } = useFleet();

    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split("T")[0];
    });

    const [operationType, setOperationType] = useState("Attendance");
    const [selectedLocation, setSelectedLocation] = useState("All");
    const [savedNotice, setSavedNotice] = useState(false);
    const [aiAppliedNotice, setAiAppliedNotice] = useState(false);

    // Map each rule/location to an existing route in the system
    const locationRouteMap = useMemo(() => {
        const map = {};
        ATTENDANCE_RULES.forEach((rule) => {
            const matched = routes.find((r) =>
                rule.defaultRouteKeywords.some((keyword) =>
                    r.name.toLowerCase().includes(keyword.toLowerCase())
                )
            );
            map[rule.locationKey] = matched || routes[0] || null;
        });
        return map;
    }, [routes]);

    // Generate slots according to exact business rules
    const allSlots = useMemo(() => {
        const slots = [];

        if (operationType === "Attendance") {
            // Attendance: Moassassa (:15), Maadi (:30), Rehab (:55), Sherouk (:00)
            ATTENDANCE_HOURS.forEach((hour) => {
                ATTENDANCE_RULES.forEach((rule) => {
                    const hourFormatted = String(hour).padStart(2, "0");
                    const minuteFormatted = String(rule.minute).padStart(2, "0");
                    const time = `${hourFormatted}:${minuteFormatted}`;
                    const route = locationRouteMap[rule.locationKey];

                    slots.push({
                        key: `${rule.locationKey}-${time}`,
                        locationKey: rule.locationKey,
                        locationName: rule.displayName,
                        time,
                        route,
                        period: hour >= 12 ? "PM" : "AM"
                    });
                });
            });
        } else {
            // Departure: 4:30 PM (16:30) to 11:30 PM (23:30) - All departure times are PM
            DEPARTURE_SLOT_TIMES.forEach((time) => {
                ATTENDANCE_RULES.forEach((rule) => {
                    const route = locationRouteMap[rule.locationKey];
                    slots.push({
                        key: `${rule.locationKey}-${time}`,
                        locationKey: rule.locationKey,
                        locationName: rule.displayName,
                        time,
                        route,
                        period: "PM"
                    });
                });
            });
        }

        return slots;
    }, [operationType, locationRouteMap]);

    // Existing operations on this date & type indexed by "routeName-time"
    const existingOpsBySlot = useMemo(() => {
        const map = {};
        operations.forEach((op) => {
            if (op.date === selectedDate && op.type === operationType) {
                const key = `${op.route}-${op.time}`;
                map[key] = op;
            }
        });
        return map;
    }, [operations, selectedDate, operationType]);

    // Requirements matrix: key -> count (string or number)
    const [requirements, setRequirements] = useState({});

    // Populate with existing counts when date or type changes
    useEffect(() => {
        const initial = {};
        allSlots.forEach((slot) => {
            if (slot.route) {
                const opKey = `${slot.route.name}-${slot.time}`;
                const existing = existingOpsBySlot[opKey];
                if (existing && existing.vehiclesCount > 0) {
                    initial[slot.key] = existing.vehiclesCount;
                }
            }
        });
        setRequirements(initial);
    }, [selectedDate, operationType, existingOpsBySlot, allSlots]);

    // Precalculate AI recommendations for all slots
    const aiRecommendations = useMemo(() => {
        const recMap = {};
        allSlots.forEach((slot) => {
            if (!slot.route) return;
            const rec = getSlotRecommendation({
                locationKey: slot.locationKey,
                routeName: slot.route.name,
                time: slot.time,
                type: operationType,
                targetDate: selectedDate,
                allOperations: operations
            });
            recMap[slot.key] = rec;
        });
        return recMap;
    }, [allSlots, operationType, selectedDate, operations]);

    // Apply AI recommendations to all slots
    const handleApplyAiRecommendations = () => {
        const updated = { ...requirements };
        allSlots.forEach((slot) => {
            const rec = aiRecommendations[slot.key];
            if (rec && rec.recommendedCount > 0) {
                updated[slot.key] = rec.recommendedCount;
            }
        });
        setRequirements(updated);
        setAiAppliedNotice(true);
        setTimeout(() => setAiAppliedNotice(false), 3500);
    };

    const handleCountChange = (slotKey, value) => {
        setRequirements((prev) => ({
            ...prev,
            [slotKey]: value === "" ? "" : Math.max(0, parseInt(value, 10) || 0),
        }));
    };

    const handleIncrement = (slotKey) => {
        setRequirements((prev) => ({
            ...prev,
            [slotKey]: (Number(prev[slotKey]) || 0) + 1,
        }));
    };

    const handleDecrement = (slotKey) => {
        setRequirements((prev) => ({
            ...prev,
            [slotKey]: Math.max(0, (Number(prev[slotKey]) || 0) - 1),
        }));
    };

    // Calculate capacity health
    const todayAvailability = dailyAvailability[selectedDate] || {};
    const availableFleetCount = vehicles.filter(
        (v) => v.status === "Active" && todayAvailability[v.id] !== "Unavailable"
    ).length;

    // Calculate peak concurrent vehicle requirement across slots
    const hourlyRequirements = {};
    Object.entries(requirements).forEach(([key, count]) => {
        const num = Number(count) || 0;
        if (num > 0) {
            const time = key.split("-")[1];
            const hour = time ? time.split(":")[0] : "00";
            hourlyRequirements[hour] = (hourlyRequirements[hour] || 0) + num;
        }
    });

    const peakConcurrentCount = Math.max(0, ...Object.values(hourlyRequirements));
    const hasCapacityShortage = peakConcurrentCount > availableFleetCount && availableFleetCount > 0;

    const handleSaveSchedule = () => {
        let createdCount = 0;
        let updatedCount = 0;
        let removedCount = 0;

        setOperations((prevOps) => {
            const opsToKeep = [...prevOps];

            allSlots.forEach((slot) => {
                if (!slot.route) return;

                const countVal = Number(requirements[slot.key]);
                const opKey = `${slot.route.name}-${slot.time}`;
                const existingIndex = opsToKeep.findIndex(
                    (op) =>
                        op.date === selectedDate &&
                        op.type === operationType &&
                        op.route === slot.route.name &&
                        op.time === slot.time
                );

                if (countVal > 0) {
                    const firstStop = slot.route.stops?.[0];
                    const requestedStopAllocations = firstStop
                        ? { [firstStop.id]: countVal }
                        : {};

                    if (existingIndex >= 0) {
                        const existing = opsToKeep[existingIndex];
                        opsToKeep[existingIndex] = {
                            ...existing,
                            vehiclesCount: countVal,
                            requestedStopAllocations:
                                Object.keys(existing.requestedStopAllocations || {}).length > 0
                                    ? existing.requestedStopAllocations
                                    : requestedStopAllocations,
                        };
                        updatedCount++;
                    } else {
                        opsToKeep.push({
                            id: Date.now() + Math.floor(Math.random() * 1000000),
                            date: selectedDate,
                            type: operationType,
                            route: slot.route.name,
                            time: slot.time,
                            vehiclesCount: countVal,
                            status: "Pending",
                            requestedStopAllocations,
                            vehicleAssignments: {},
                            assignedVehicles: [],
                            stopAllocations: firstStop
                                ? [{ stopId: firstStop.id, stopName: firstStop.name, count: 0 }]
                                : [],
                        });
                        createdCount++;
                    }

                    // Feed learning engine with this decision
                    recordSchedulingDecision({
                        date: selectedDate,
                        type: operationType,
                        route: slot.route.name,
                        time: slot.time,
                        vehiclesCount: countVal,
                        wasManualOverride: true
                    });

                } else if (existingIndex >= 0 && (countVal === 0 || requirements[slot.key] === "")) {
                    const existing = opsToKeep[existingIndex];
                    const hasAssignments = Object.keys(existing.vehicleAssignments || {}).length > 0;
                    if (!hasAssignments) {
                        opsToKeep.splice(existingIndex, 1);
                        removedCount++;
                    }
                }
            });

            return opsToKeep;
        });

        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 3000);
    };

    if (!isOpen) return null;

    const filteredSlots = allSlots.filter((slot) => {
        if (selectedLocation === "All") return true;
        return slot.locationKey === selectedLocation;
    });

    const totalEnteredVehicles = Object.values(requirements).reduce(
        (sum, val) => sum + (Number(val) > 0 ? Number(val) : 0),
        0
    );

    const activeSlotsCount = Object.values(requirements).filter(
        (val) => Number(val) > 0
    ).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="flex max-h-[94vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/40 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                            <Sparkles size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-slate-800">
                                    Intelligent Daily Operating Scheduler
                                </h2>
                                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                                    AI Powered
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                                {operationType === "Attendance"
                                    ? "Attendance Rules: Moassassa (:15) • Maadi (:30) • Rehab (:55) • Sherouk (:00)"
                                    : "Departure Window: 4:30 PM – 11:30 PM (PM Operating Schedule)"}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                    >
                        ✕
                    </button>
                </div>

                {/* AI & Fleet Health Bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-3 text-xs">
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                            <Sparkles size={18} />
                        </div>
                        <div>
                            <span className="font-semibold text-slate-700">Demand Learning Engine</span>
                            <p className="text-[11px] text-slate-500">
                                Analyzing previous schedules to optimize vehicle allocation.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                        <div className={`rounded-lg p-2 ${hasCapacityShortage ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>
                            {hasCapacityShortage ? <ShieldAlert size={18} /> : <CheckCircle2 size={18} />}
                        </div>
                        <div>
                            <span className="font-semibold text-slate-700">Fleet Capacity Check</span>
                            <p className="text-[11px] text-slate-500">
                                Peak Hour: <strong className={hasCapacityShortage ? 'text-amber-700' : 'text-slate-800'}>{peakConcurrentCount}</strong> req. / {availableFleetCount} available
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={handleApplyAiRecommendations}
                            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 transition active:scale-95"
                        >
                            <Sparkles size={16} />
                            Apply AI Recommendations
                        </button>
                    </div>
                </div>

                {/* Controls Bar */}
                <div className="grid grid-cols-1 gap-4 border-b border-slate-100 bg-white p-5 sm:grid-cols-4">
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                            Operating Date
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                            Schedule Type
                        </label>
                        <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-300 bg-slate-100 p-1">
                            <button
                                type="button"
                                onClick={() => setOperationType("Attendance")}
                                className={`rounded-md py-1.5 text-xs font-semibold transition ${
                                    operationType === "Attendance"
                                        ? "bg-white text-blue-700 shadow-sm"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Attendance (الحضور)
                            </button>
                            <button
                                type="button"
                                onClick={() => setOperationType("Departure")}
                                className={`rounded-md py-1.5 text-xs font-semibold transition ${
                                    operationType === "Departure"
                                        ? "bg-white text-blue-700 shadow-sm"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Departure (الانصراف)
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                            Filter Location
                        </label>
                        <select
                            value={selectedLocation}
                            onChange={(e) => setSelectedLocation(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                        >
                            <option value="All">All Locations (الكل)</option>
                            {ATTENDANCE_RULES.map((rule) => (
                                <option key={rule.locationKey} value={rule.locationKey}>
                                    {rule.displayName}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col justify-end">
                        <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900 border border-blue-100">
                            <div className="flex justify-between">
                                <span>Active Slots:</span>
                                <strong className="font-bold">{activeSlotsCount}</strong>
                            </div>
                            <div className="flex justify-between mt-0.5">
                                <span>Total Vehicles:</span>
                                <strong className="font-bold text-blue-700">{totalEnteredVehicles}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Slots Table */}
                <div className="flex-1 overflow-y-auto p-5">
                    {savedNotice && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 border border-emerald-200">
                            <Check size={18} className="text-emerald-600" />
                            Schedule requirements successfully saved & synchronized! Learning data updated.
                        </div>
                    )}

                    {aiAppliedNotice && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 border border-blue-200">
                            <Sparkles size={18} className="text-blue-600" />
                            AI recommendations applied to slots! Review and fine-tune as needed.
                        </div>
                    )}

                    {hasCapacityShortage && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 border border-amber-200">
                            <ShieldAlert size={18} className="text-amber-600 flex-shrink-0" />
                            <span>
                                <strong>Capacity Shortage Detected:</strong> Peak concurrent demand is {peakConcurrentCount} vehicles, exceeding today&apos;s available fleet of {availableFleetCount} vehicles.
                            </span>
                        </div>
                    )}

                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
                                <tr>
                                    <th className="px-4 py-3">Location</th>
                                    <th className="px-4 py-3">Time</th>
                                    <th className="px-4 py-3">Linked Route</th>
                                    <th className="px-4 py-3">AI Demand Insight</th>
                                    <th className="px-4 py-3">Current Status</th>
                                    <th className="px-4 py-3 text-right">Required Vehicles</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSlots.map((slot) => {
                                    const opKey = slot.route ? `${slot.route.name}-${slot.time}` : "";
                                    const existing = existingOpsBySlot[opKey];
                                    const value = requirements[slot.key] ?? "";
                                    const hasValue = Number(value) > 0;
                                    const rec = aiRecommendations[slot.key];

                                    return (
                                        <tr
                                            key={slot.key}
                                            className={`transition-colors ${
                                                hasValue ? "bg-blue-50/40 hover:bg-blue-50/70" : "hover:bg-slate-50"
                                            }`}
                                        >
                                            <td className="px-4 py-3 font-semibold text-slate-800">
                                                {slot.locationName}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700">
                                                    <Clock size={13} className="text-slate-400" />
                                                    {slot.time} {slot.period}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-600">
                                                {slot.route ? (
                                                    <span className="rounded bg-slate-200/60 px-2 py-0.5">
                                                        {slot.route.name}
                                                    </span>
                                                ) : (
                                                    <span className="text-amber-600">No matching route</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {rec && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 text-[11px] border border-indigo-100">
                                                                <Sparkles size={11} />
                                                                Suggests: {rec.recommendedCount}
                                                            </span>
                                                            {rec.trend === "Increasing" && (
                                                                <span className="inline-flex items-center gap-0.5 text-emerald-600 text-[11px] font-medium">
                                                                    <TrendingUp size={12} /> Rising
                                                                </span>
                                                            )}
                                                            {rec.trend === "Decreasing" && (
                                                                <span className="inline-flex items-center gap-0.5 text-amber-600 text-[11px] font-medium">
                                                                    <TrendingDown size={12} /> Lower
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-slate-400" title={rec.explanation}>
                                                            {rec.explanation}
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {existing ? (
                                                    <span
                                                        className={`rounded-full px-2.5 py-0.5 font-medium ${
                                                            existing.status === "Distributed"
                                                                ? "bg-emerald-100 text-emerald-800"
                                                                : "bg-amber-100 text-amber-800"
                                                        }`}
                                                    >
                                                        {existing.status} ({existing.vehiclesCount} req)
                                                    </span>
                                                ) : hasValue ? (
                                                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 font-medium text-blue-800">
                                                        New
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-1.5 justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDecrement(slot.key)}
                                                        className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 flex items-center justify-center transition active:scale-95"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        placeholder="0"
                                                        value={value}
                                                        onChange={(e) =>
                                                            handleCountChange(slot.key, e.target.value)
                                                        }
                                                        className={`w-16 rounded-lg border px-2 py-1.5 text-center font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
                                                            hasValue
                                                                ? "border-blue-400 bg-white"
                                                                : "border-slate-200 bg-slate-50"
                                                        }`}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIncrement(slot.key)}
                                                        className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 flex items-center justify-center transition active:scale-95"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
                    <button
                        type="button"
                        onClick={() => setRequirements({})}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                        <RotateCcw size={16} />
                        Clear All
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveSchedule}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 active:scale-95"
                        >
                            <Save size={16} />
                            Save Operating Schedule
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
