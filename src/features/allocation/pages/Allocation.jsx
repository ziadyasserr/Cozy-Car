import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Search,
    Bus,
    Clock,
    ArrowRight,
    AlertCircle,
    UserRound,
    Zap,
} from "lucide-react";

import { useRoutes } from "../../../context/RoutesContext";
import { useFleet } from "../../../context/FleetContext";
import { useDrivers } from "../../../context/DriversContext";
import { useDriverAssignments } from "../../../context/DriverAssignmentsContext";
import { useOperations } from "../../../context/OperationsContext";
import { useTravelTimes } from "../../../context/TravelTimesContext";
import AlertModal from "../../../components/ui/AlertModal";
import OperatingAssistant from "../../../components/common/OperatingAssistant";
import SmartAutoAllocationModal from "../components/SmartAutoAllocationModal";

import {
    getAttendanceSuggestions,
    getDepartureArrival,
    checkVehicleConflict,
} from "../../../utils/allocationUtils";
import { dateTimeToMinutes } from "../../../utils/timeUtils";

const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86400000;

const FIXED_TYPE = "Fixed Vehicle Driver";

function getAbsoluteTime(date, time) {
    return dateTimeToMinutes(date, time);
}

// Absolute minutes -> "YYYY-MM-DD" (UTC based, same basis as timeUtils)
function minutesToDateString(totalMinutes) {
    const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
    return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

function getShiftInterval(assignment) {
    const start = getAbsoluteTime(
        assignment.date,
        assignment.startTime
    );

    let end = getAbsoluteTime(
        assignment.date,
        assignment.endTime
    );

    if (start === null || end === null) return null;

    // Also covers Full Day stored as 00:00 -> 00:00 (24 hours).
    if (end <= start) end += MINUTES_PER_DAY;

    return { start, end };
}

// Shift of a fixed driver on a given date, as an absolute interval.
function getFixedShiftParts(driver) {
    if (
        driver.fixedMode === "single" ||
        driver.fixedShift === "00:00-24:00"
    ) {
        return { name: "Full Day", startTime: "00:00", endTime: "00:00" };
    }

    if (driver.fixedShift === "12:00-00:00") {
        return { name: "Second Shift", startTime: "12:00", endTime: "00:00" };
    }

    return { name: "First Shift", startTime: "00:00", endTime: "12:00" };
}

// True when the union of the intervals fully covers [start, end].
function intervalsCover(intervals, start, end) {
    const sorted = intervals
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);

    const merged = [];

    sorted.forEach((interval) => {
        const last = merged[merged.length - 1];

        if (last && interval.start <= last.end) {
            last.end = Math.max(last.end, interval.end);
        } else {
            merged.push({ ...interval });
        }
    });

    return merged.some(
        (interval) => interval.start <= start && interval.end >= end
    );
}

function hasOverlap(first, second) {
    if (!first || !second) return false;
    return first.start < second.end && second.start < first.end;
}

function formatTime(time) {
    if (!time) return "--";

    const [hours, minutes] = time.split(":");
    const hour = Number(hours);

    const displayHour = hour % 12 || 12;

    return `${displayHour}:${minutes}`;
}

function formatDate(date) {
    if (!date) return "--";

    return new Date(`${date}T00:00:00Z`).toLocaleDateString(
        "en-GB",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
        }
    );
}

export default function Allocation() {
    const { t } = useTranslation();
    const { routes } = useRoutes();
    const { vehicles, dailyAvailability } = useFleet();
    const { operations, setOperations } = useOperations();
    const { travelTimes } = useTravelTimes();
    const { drivers } = useDrivers();
    const { driverAssignments } = useDriverAssignments();

    const [selectedOperationId, setSelectedOperationId] =
        useState("");

    const [selectedVehicleId, setSelectedVehicleId] =
        useState("");

    const [selectedDrivers, setSelectedDrivers] = useState({});
    const [showAutoAllocationModal, setShowAutoAllocationModal] = useState(false);

    const [alertModal, setAlertModal] = useState({
        open: false,
        message: "",
        type: "info",
    });

    // Show all Departure operations, even before vehicle distribution.
    const departureOperations = useMemo(
        () =>
            operations.filter(
                (operation) =>
                    String(operation.type).trim().toLowerCase() ===
                    "departure"
            ),
        [operations]
    );

    const selectedOperation = departureOperations.find(
        (operation) =>
            String(operation.id) === selectedOperationId
    );

    // A vehicle must have a stop assigned in this Departure operation
    // so the system can calculate its arrival location and time.
    const assignedVehicleIds = selectedOperation
        ? Object.keys(selectedOperation.vehicleAssignments || {})
        : [];

    const assignedVehicles = assignedVehicleIds
        .map((vehicleId) => {
            const vehicle = vehicles.find(
                (item) =>
                    Number(item.id) === Number(vehicleId)
            );

            return {
                id: vehicleId,
                vehicle,
            };
        })
        .filter((item) => item.vehicle);

    const selectedVehicleArrival =
        selectedOperation && selectedVehicleId
            ? getDepartureArrival(
                selectedOperation,
                selectedVehicleId,
                routes
            )
            : null;

    const results = useMemo(() => {
        if (!selectedOperation || !selectedVehicleId) {
            return {
                arrival: null,
                suggestions: [],
                missingTravelTimes: [],
                lateCandidates: [],
            };
        }

        return getAttendanceSuggestions({
            departureOperation: selectedOperation,
            vehicleId: selectedVehicleId,
            operations,
            travelTimes,
            routes,
        });
    }, [
        selectedOperation,
        selectedVehicleId,
        operations,
        travelTimes,
        routes,
    ]);

    // Active vehicles are available by default unless marked "Unavailable" for that date.
    const isVehicleAvailableOn = (vehicleId, date) => {
        const vehicle = vehicles.find(
            (item) => Number(item.id) === Number(vehicleId)
        );

        if (!vehicle || vehicle.status !== "Active") return false;

        return (
            (dailyAvailability?.[date] || {})[vehicle.id] !==
            "Unavailable"
        );
    };

    // Interval a vehicle spends on an operation (used for driver busy checks).
    const getOperationInterval = (operation, vehicleId) => {
        const stopId = operation.vehicleAssignments?.[vehicleId];
        if (!stopId) return null;

        const route = routes.find(
            (item) => item.name === operation.route
        );

        const stop = route?.stops.find(
            (item) => Number(item.id) === Number(stopId)
        );

        const scheduled = getAbsoluteTime(
            operation.date,
            operation.time
        );

        if (!stop || scheduled === null) return null;

        if (operation.type === "Departure") {
            const duration = Number(stop.departure);
            if (!Number.isFinite(duration)) return null;
            return { start: scheduled, end: scheduled + duration };
        }

        const duration = Number(stop.attendance);
        if (!Number.isFinite(duration)) return null;
        return { start: scheduled - duration, end: scheduled };
    };

    // True when the driver is busy on ANOTHER vehicle during the window.
    const isDriverBusyElsewhere = (driverId, window, targetOperationId) => {
        const busyInRecords = driverAssignments.some((assignment) => {
            if (Number(assignment.driverId) !== Number(driverId)) {
                return false;
            }

            if (Number(assignment.vehicleId) === Number(selectedVehicleId)) {
                return false;
            }

            return hasOverlap(getShiftInterval(assignment), window);
        });

        if (busyInRecords) return true;

        return operations.some((operation) => {
            if (String(operation.id) === String(targetOperationId)) {
                return false;
            }

            return Object.entries(operation.driverAssignments || {}).some(
                ([vehicleId, assignedDriverId]) => {
                    if (Number(assignedDriverId) !== Number(driverId)) {
                        return false;
                    }

                    if (Number(vehicleId) === Number(selectedVehicleId)) {
                        return false;
                    }

                    return hasOverlap(
                        getOperationInterval(operation, vehicleId),
                        window
                    );
                }
            );
        });
    };

    // Drivers that can take the vehicle from its arrival at the drop-off
    // point until the Attendance operation's scheduled time.
    const getAvailableDrivers = (suggestion) => {
        if (!selectedOperation || !selectedVehicleArrival) {
            return [];
        }

        const attendanceTime = getAbsoluteTime(
            suggestion.scheduledDate,
            suggestion.scheduledTime
        );

        if (attendanceTime === null) return [];

        const windowStart = selectedVehicleArrival.arrivalDateTime;
        const windowEnd = attendanceTime;

        if (windowEnd < windowStart) return [];

        const window = { start: windowStart, end: windowEnd };
        const candidates = new Map();

        // 1) Drivers with actual assignment records on this vehicle.
        const recordsByDriver = {};

        driverAssignments.forEach((assignment) => {
            if (
                Number(assignment.vehicleId) !== Number(selectedVehicleId)
            ) {
                return;
            }

            const interval = getShiftInterval(assignment);
            if (!interval) return;

            const key = Number(assignment.driverId);
            recordsByDriver[key] = recordsByDriver[key] || [];
            recordsByDriver[key].push({ assignment, interval });
        });

        Object.entries(recordsByDriver).forEach(([driverId, records]) => {
            const driver = drivers.find(
                (item) => Number(item.id) === Number(driverId)
            );

            if (!driver || driver.status !== "Active") return;

            if (
                !intervalsCover(
                    records.map((record) => record.interval),
                    windowStart,
                    windowEnd
                )
            ) {
                return;
            }

            // Show the record that covers the end of the trip.
            const display =
                records.find(
                    (record) =>
                        record.interval.start <= windowEnd &&
                        record.interval.end >= windowEnd
                ) || records[0];

            candidates.set(Number(driver.id), {
                assignment: display.assignment,
                driver,
            });
        });

        // 2) Fixed drivers of this vehicle (their shift repeats every day).
        const firstDay = Math.floor(windowStart / MINUTES_PER_DAY) - 1;
        const lastDay = Math.floor(windowEnd / MINUTES_PER_DAY);

        drivers
            .filter(
                (driver) =>
                    driver.status === "Active" &&
                    driver.driverType === FIXED_TYPE &&
                    Number(driver.vehicleId) === Number(selectedVehicleId) &&
                    !candidates.has(Number(driver.id))
            )
            .forEach((driver) => {
                const shift = getFixedShiftParts(driver);
                const intervals = [];

                for (let day = firstDay; day <= lastDay; day++) {
                    const date = minutesToDateString(day * MINUTES_PER_DAY);

                    intervals.push(
                        getShiftInterval({
                            date,
                            startTime: shift.startTime,
                            endTime: shift.endTime,
                        })
                    );
                }

                if (!intervalsCover(intervals, windowStart, windowEnd)) {
                    return;
                }

                candidates.set(Number(driver.id), {
                    assignment: {
                        shift: shift.name,
                        startTime: shift.startTime,
                        endTime: shift.endTime,
                    },
                    driver,
                });
            });

        // 3) Remove drivers who are busy on another vehicle in that period.
    };

    const getSuggestionConflict = (suggestion) => {
        const targetOperation = operations.find(
            (operation) =>
                String(operation.id) ===
                String(suggestion.operationId)
        );

        if (!targetOperation) {
            return {
                hasConflict: true,
                reason: t("Allocation.alerts.attendanceNotFound"),
            };
        }

        if (
            !isVehicleAvailableOn(
                selectedVehicleId,
                targetOperation.date
            )
        ) {
            return {
                hasConflict: true,
                reason: t("Allocation.alerts.vehicleUnavailable"),
            };
        }

        const assignments =
            targetOperation.vehicleAssignments || {};

        if (
            Object.prototype.hasOwnProperty.call(
                assignments,
                String(selectedVehicleId)
            )
        ) {
            return {
                hasConflict: true,
                reason: t("Allocation.alerts.vehicleAlreadyAssigned"),
            };
        }

        const requestedCount =
            Number(
                targetOperation.requestedStopAllocations?.[
                suggestion.stopId
                ]
            ) || 0;

        const assignedCount = Object.values(assignments).filter(
            (stopId) =>
                Number(stopId) === Number(suggestion.stopId)
        ).length;

        if (assignedCount >= requestedCount) {
            return {
                hasConflict: true,
                reason: t("Allocation.alerts.stopFull"),
            };
        }

        return checkVehicleConflict({
            vehicleId: selectedVehicleId,
            targetOperation: {
                ...targetOperation,
                stopId: suggestion.stopId,
            },
            operations,
            travelTimes,
            routes,
        });
    };

    const getSuggestionStatus = (suggestion) => {
        const availableDrivers = getAvailableDrivers(suggestion);
        const conflict = getSuggestionConflict(suggestion);

        if (conflict.hasConflict) {
            return {
                canAssign: false,
                reason: conflict.reason,
                availableDrivers,
            };
        }

        if (availableDrivers.length === 0) {
            return {
                canAssign: false,
                reason:
                    t("Allocation.alerts.noDriverAvailable"),
                availableDrivers,
            };
        }

        return {
            canAssign: true,
            reason: "",
            availableDrivers,
        };
    };

    const handleOperationChange = (value) => {
        setSelectedOperationId(value);
        setSelectedVehicleId("");
        setSelectedDrivers({});
    };

    const handleVehicleChange = (value) => {
        setSelectedVehicleId(value);
        setSelectedDrivers({});
    };

    const handleAssignVehicle = (suggestion) => {
        const targetOperation = operations.find(
            (operation) =>
                String(operation.id) ===
                String(suggestion.operationId)
        );

        if (!targetOperation) {
            setAlertModal({
                open: true,
                message: t("Allocation.alerts.attendanceNotFound"),
                type: "warning",
            });
            return;
        }

        const status = getSuggestionStatus(suggestion);

        if (!status.canAssign) {
            setAlertModal({
                open: true,
                message: status.reason,
                type: "warning",
            });
            return;
        }

        const selectedDriverId =
            selectedDrivers[
            `${suggestion.operationId}-${suggestion.stopId}`
            ];

        if (!selectedDriverId) {
            setAlertModal({
                open: true,
                message: t("Allocation.alerts.selectDriverFirst"),
                type: "warning",
            });
            return;
        }

        const driverOption = status.availableDrivers.find(
            (item) =>
                Number(item.driver.id) ===
                Number(selectedDriverId)
        );

        if (!driverOption) {
            setAlertModal({
                open: true,
                message: t("Allocation.alerts.driverNoLongerAvailable"),
                type: "warning",
            });
            return;
        }

        const assignments =
            targetOperation.vehicleAssignments || {};

        const updatedAssignments = {
            ...assignments,
            [selectedVehicleId]: Number(suggestion.stopId),
        };

        const existingDriverAssignments =
            targetOperation.driverAssignments || {};

        const updatedDriverAssignments = {
            ...existingDriverAssignments,
            [selectedVehicleId]: Number(selectedDriverId),
        };

        const targetRoute = routes.find(
            (route) => route.name === targetOperation.route
        );

        const countsByStop = {};

        Object.values(updatedAssignments).forEach((stopId) => {
            countsByStop[stopId] =
                (countsByStop[stopId] || 0) + 1;
        });

        const stopAllocationsArray = targetRoute?.stops
            ? targetRoute.stops.map((stop) => ({
                stopId: stop.id,
                stopName: stop.name,
                count: countsByStop[stop.id] || 0,
            }))
            : Object.entries(countsByStop).map(([stopId, count]) => ({
                stopId: Number(stopId),
                stopName: `Stop ${stopId}`,
                count,
            }));

        const totalAssigned =
            Object.keys(updatedAssignments).length;

        const totalRequested =
            Number(targetOperation.vehiclesCount) || 0;

        const statusValue =
            totalAssigned >= totalRequested
                ? "Distributed"
                : "Partially Distributed";

        setOperations((previousOperations) =>
            previousOperations.map((operation) =>
                String(operation.id) ===
                    String(targetOperation.id)
                    ? {
                        ...operation,
                        vehicleAssignments: updatedAssignments,
                        driverAssignments: updatedDriverAssignments,
                        assignedVehicles: Object.keys(
                            updatedAssignments
                        ).map(Number),
                        stopAllocations: stopAllocationsArray,
                        status: statusValue,
                    }
                    : operation
            )
        );

        setAlertModal({
            open: true,
            message: t("Allocation.alerts.assignedSuccess", { driverName: driverOption.driver.name }),
            type: "info",
        });
    };

    const formatDriverShift = (shift) => {
        if (shift === "First Shift") return t("Allocation.shifts.firstShift");
        if (shift === "Second Shift") return t("Allocation.shifts.secondShift");
        return shift;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-slate-800">
                            {t("Allocation.title")}
                        </h1>

                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                            {t("Allocation.badgeAutonomous")}
                        </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                        {t("Allocation.description")}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setShowAutoAllocationModal(true)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-700 hover:to-blue-700 transition active:scale-95"
                >
                    <Zap size={18} className="text-amber-300" />
                    {t("Allocation.runAutonomous")}
                </button>
            </div>

            <OperatingAssistant
                onOpenAutoAllocation={() => setShowAutoAllocationModal(true)}
            />

            <div className="flex items-center justify-between pt-2">
                <h2 className="text-base font-bold text-slate-700">
                    {t("Allocation.manualInspectorTitle")}
                </h2>

                <span className="text-xs text-slate-400">
                    {t("Allocation.manualInspectorDesc")}
                </span>
            </div>

            {/* Selection */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                        {t("Allocation.departureOperationLabel")}
                    </label>

                    <select
                        value={selectedOperationId}
                        onChange={(e) =>
                            handleOperationChange(e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                    >
                        <option value="">
                            {t("Allocation.selectDepartureOperation")}
                        </option>

                        {departureOperations.map((operation) => (
                            <option
                                key={operation.id}
                                value={operation.id}
                            >
                                {operation.route} - {formatTime(operation.time)} - {operation.date}
                            </option>
                        ))}
                    </select>

                    {departureOperations.length === 0 && (
                        <p className="mt-2 text-xs text-amber-600">
                            {t("Allocation.noDepartureOperations")}
                        </p>
                    )}
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                        {t("Allocation.vehicleLabel")}
                    </label>

                    <select
                        value={selectedVehicleId}
                        onChange={(e) =>
                            handleVehicleChange(e.target.value)
                        }
                        disabled={!selectedOperation || assignedVehicles.length === 0}
                        className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500 disabled:bg-slate-100"
                    >
                        <option value="">
                            {t("Allocation.selectVehicle")}
                        </option>

                        {assignedVehicles.map(({ id, vehicle }) => (
                            <option key={id} value={id}>
                                {vehicle.number || vehicle.name || t("Allocation.defaultVehicleName", { id })}
                            </option>
                        ))}
                    </select>

                    {selectedOperation && assignedVehicles.length === 0 && (
                        <p className="mt-2 text-xs text-amber-600">
                            {t("Allocation.noVehiclesDistributed")}
                        </p>
                    )}
                </div>
            </div>

            {!selectedOperationId && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
                    <Search
                        className="mx-auto mb-3 text-slate-400"
                        size={36}
                    />

                    <h3 className="font-semibold text-slate-700">
                        {t("Allocation.emptySelectDeparture")}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                        {t("Allocation.emptySelectDepartureDesc")}
                    </p>
                </div>
            )}

            {selectedOperationId && !selectedVehicleId && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
                    <Bus
                        className="mx-auto mb-3 text-slate-400"
                        size={36}
                    />

                    <p className="font-medium text-slate-600">
                        {t("Allocation.emptySelectVehicle")}
                    </p>
                </div>
            )}

            {/* Current Trip */}
            {selectedVehicleArrival && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                    <h2 className="mb-4 font-semibold text-slate-800">
                        {t("Allocation.currentTrip")}
                    </h2>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                            <p className="text-xs text-slate-500">
                                {t("Allocation.thVehicle")}
                            </p>

                            <p className="mt-1 font-semibold text-slate-800">
                                {selectedVehicleId}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-500">
                                {t("Allocation.destination")}
                            </p>

                            <p className="mt-1 font-semibold text-slate-800">
                                {selectedVehicleArrival.stopName}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-500">
                                {t("Allocation.estimatedArrival")}
                            </p>

                            <p className="mt-1 font-semibold text-blue-700">
                                {formatDate(selectedVehicleArrival.arrivalDate)}{" "}
                                {formatTime(selectedVehicleArrival.arrivalTime)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Suggestions */}
            {selectedVehicleId && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-800">
                            {t("Allocation.attendanceSuggestions")}
                        </h2>

                        <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                            {t("Allocation.suitableCount", { count: results.suggestions.length })}
                        </span>
                    </div>

                    {results.suggestions.length === 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                            <AlertCircle
                                className="mx-auto mb-3 text-amber-500"
                                size={32}
                            />

                            <h3 className="font-semibold text-slate-700">
                                {t("Allocation.noSuitableTrips")}
                            </h3>

                            <p className="mt-1 text-sm text-slate-500">
                                {t("Allocation.noSuitableTripsDesc")}
                            </p>
                        </div>
                    )}

                    {results.suggestions.map((suggestion, index) => {
                        const status = getSuggestionStatus(suggestion);

                        const selectionKey =
                            `${suggestion.operationId}-${suggestion.stopId}`;

                        const selectedDriverId =
                            selectedDrivers[selectionKey] || "";

                        return (
                            <div
                                key={selectionKey}
                                className="rounded-xl border border-slate-200 bg-white p-5"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
                                            {index + 1}
                                        </span>

                                        <div>
                                            <h3 className="font-semibold text-slate-800">
                                                {suggestion.routeName}
                                            </h3>

                                            <p className="text-sm text-slate-500">
                                                {suggestion.stopName}
                                            </p>
                                        </div>
                                    </div>

                                    <span
                                        className={`rounded-full px-3 py-1 text-xs font-medium ${status.canAssign
                                                ? "bg-green-100 text-green-700"
                                                : "bg-amber-100 text-amber-700"
                                            }`}
                                    >
                                        {status.canAssign
                                            ? t("Allocation.statusAvailable")
                                            : t("Allocation.statusNeedsAttention")}
                                    </span>
                                </div>

                                <div className="my-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    <div>
                                        <p className="text-xs text-slate-500">
                                            {t("Allocation.currentLocation")}
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                            {suggestion.currentStop}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-500">
                                            {t("Allocation.estimatedArrival")}
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                            {formatDate(suggestion.estimatedArrivalDate)}
                                            <br />
                                            {formatTime(suggestion.estimatedArrival)}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-500">
                                            {t("Allocation.scheduledTime")}
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                            {formatDate(suggestion.scheduledDate)}
                                            <br />
                                            {formatTime(suggestion.scheduledTime)}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-500">
                                            {t("Allocation.remainingVehicles")}
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                            {suggestion.remainingVehicles}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                                    <Clock size={16} />

                                    {t("Allocation.travelTimeText", { duration: suggestion.travelDuration })}

                                    <ArrowRight size={16} />

                                    <span className="font-medium text-green-700">
                                        {t("Allocation.minutesEarlyText", { minutes: suggestion.minutesEarly })}
                                    </span>
                                </div>

                                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <UserRound size={17} />
                                        {t("Allocation.driverForTrip")}
                                    </label>

                                    {status.availableDrivers.length > 0 ? (
                                        <select
                                            value={selectedDriverId}
                                            onChange={(e) =>
                                                setSelectedDrivers((prev) => ({
                                                    ...prev,
                                                    [selectionKey]: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-slate-300 bg-white p-3 outline-none focus:border-blue-500"
                                        >
                                            <option value="">
                                                {t("Allocation.selectDriver")}
                                            </option>

                                            {status.availableDrivers.map((item) => (
                                                <option
                                                    key={item.driver.id}
                                                    value={item.driver.id}
                                                >
                                                    {item.driver.name} - {formatDriverShift(item.assignment.shift)}
                                                    ({item.assignment.startTime} - {item.assignment.endTime})
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm text-red-600">
                                            {t("Allocation.noDriverCovers")}
                                        </p>
                                    )}
                                </div>

                                {!status.canAssign && (
                                    <p className="mt-3 flex items-start gap-2 text-sm text-amber-700">
                                        <AlertCircle
                                            size={17}
                                            className="mt-0.5 shrink-0"
                                        />
                                        {status.reason}
                                    </p>
                                )}

                                <div className="mt-4 border-t border-slate-100 pt-4">
                                    <button
                                        type="button"
                                        disabled={
                                            !status.canAssign ||
                                            !selectedDriverId
                                        }
                                        onClick={() =>
                                            handleAssignVehicle(suggestion)
                                        }
                                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                                    >
                                        <Bus size={18} />
                                        {t("Allocation.assignVehicleBtn")}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Missing Travel Times */}
            {selectedVehicleId &&
                results.missingTravelTimes.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                        <h3 className="mb-3 flex items-center gap-2 font-semibold text-amber-800">
                            <AlertCircle size={18} />
                            {t("Allocation.missingTravelTimeTitle")}
                        </h3>

                        <div className="space-y-2">
                            {results.missingTravelTimes.map((item, index) => (
                                <p
                                    key={`${item.operationId}-${item.stopId}-${index}`}
                                    className="text-sm text-amber-800"
                                >
                                    {item.fromStopName} → {item.stopName}
                                    {" — "}
                                    {t("Allocation.noTravelTimeRecorded")}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

            {/* Late Candidates */}
            {selectedVehicleId &&
                results.lateCandidates.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                        <h3 className="mb-3 font-semibold text-red-800">
                            {t("Allocation.lateTripsTitle")}
                        </h3>

                        <div className="space-y-2">
                            {results.lateCandidates.map((item, index) => (
                                <p
                                    key={`${item.operationId}-${item.stopId}-${index}`}
                                    className="text-sm text-red-700"
                                >
                                    {item.routeName} - {item.stopName}
                                    {" — "}
                                    {formatDate(item.scheduledDate)}
                                    {" | "}{t("Allocation.estimatedArrivalLabel")}{" "}
                                    {formatTime(item.estimatedArrival)}
                                    {" / "}{t("Allocation.scheduledLabel")}{" "}
                                    {formatTime(item.scheduledTime)}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

            <SmartAutoAllocationModal
                isOpen={showAutoAllocationModal}
                onClose={() => setShowAutoAllocationModal(false)}
            />

            <AlertModal
                isOpen={alertModal.open}
                title={t("Allocation.alertModalTitle")}
                message={alertModal.message}
                type={alertModal.type || "info"}
                onClose={() =>
                    setAlertModal({
                        open: false,
                        message: "",
                        type: "info",
                    })
                }
            />
        </div>
    );
}