
import { useMemo, useState } from "react";
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

function getAbsoluteTime(date, time) {
    return dateTimeToMinutes(date, time);
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

    if (end <= start) end += MINUTES_PER_DAY;

    return { start, end };
}

function formatTime(time) {
    if (!time) return "--";

    const [hours, minutes] = time.split(":");
    const hour = Number(hours);

    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${minutes} ${suffix}`;
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
    const { routes } = useRoutes();
    const { vehicles } = useFleet();
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

    const getAvailableDrivers = (suggestion) => {
        if (!selectedOperation || !selectedVehicleArrival) {
            return [];
        }

        const targetOperation = operations.find(
            (operation) =>
                String(operation.id) ===
                String(suggestion.operationId)
        );

        if (!targetOperation) return [];

        const departureStart = getAbsoluteTime(
            selectedOperation.date,
            selectedOperation.time
        );

        const attendanceArrival = getAbsoluteTime(
            suggestion.scheduledDate,
            suggestion.scheduledTime
        );

        if (
            departureStart === null ||
            attendanceArrival === null
        ) {
            return [];
        }

        const vehicleArrival =
            selectedVehicleArrival.arrivalDateTime;

        const tripStart = departureStart;
        const tripEnd = attendanceArrival;

        if (tripEnd < vehicleArrival) return [];

        const matchingAssignments = driverAssignments.filter(
            (assignment) => {
                if (
                    Number(assignment.vehicleId) !==
                    Number(selectedVehicleId)
                ) {
                    return false;
                }

                const interval = getShiftInterval(assignment);
                if (!interval) return false;

                return (
                    interval.start <= tripEnd &&
                    interval.end >= tripEnd
                );
            }
        );

        const assignedMatches = matchingAssignments
            .map((assignment) => {
                const driver = drivers.find(
                    (item) =>
                        Number(item.id) ===
                        Number(assignment.driverId)
                );

                if (!driver || driver.status !== "Active") {
                    return null;
                }

                return {
                    assignment,
                    driver,
                };
            })
            .filter(Boolean);

        if (assignedMatches.length > 0) {
            return assignedMatches;
        }

        const fixedDrivers = drivers.filter(
            (driver) =>
                driver.status === "Active" &&
                driver.driverType === "Fixed Vehicle Driver" &&
                Number(driver.vehicleId) === Number(selectedVehicleId)
        );

        return fixedDrivers.map((driver) => {
            const shiftRange =
                driver.fixedShift === "12:00-00:00"
                    ? {
                        startTime: "12:00",
                        endTime: "00:00",
                        name: "Second Shift",
                    }
                    : {
                        startTime: "00:00",
                        endTime: "12:00",
                        name: "First Shift",
                    };

            return {
                assignment: {
                    shift: shiftRange.name,
                    startTime: shiftRange.startTime,
                    endTime: shiftRange.endTime,
                },
                driver,
            };
        });
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
                reason: "Attendance operation not found.",
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
                reason: "This vehicle is already assigned to this operation.",
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
                reason: "This stop already has all its requested vehicles.",
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
                    "No active driver assigned to this vehicle covers the complete trip and waiting time.",
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
                message: "Attendance operation not found.",
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
                message: "Please select a driver first.",
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
                message: "The selected driver is no longer available.",
                type: "warning",
            });
            return;
        }

        const conflict = getSuggestionConflict(suggestion);

        if (conflict.hasConflict) {
            setAlertModal({
                open: true,
                message: conflict.reason,
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
            message: `Vehicle assigned successfully.\nDriver: ${driverOption.driver.name}`,
            type: "info",
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-slate-800">
                            Smart Fleet Allocation
                        </h1>

                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                            AI Autonomous
                        </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                        Intelligently assign vehicles and drivers to minimize deadhead miles and idle time.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setShowAutoAllocationModal(true)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-700 hover:to-blue-700 transition active:scale-95"
                >
                    <Zap size={18} className="text-amber-300" />
                    Run Autonomous Allocation
                </button>
            </div>

            <OperatingAssistant
                onOpenAutoAllocation={() => setShowAutoAllocationModal(true)}
            />

            <div className="flex items-center justify-between pt-2">
                <h2 className="text-base font-bold text-slate-700">
                    Manual Trip &amp; Transition Inspector
                </h2>

                <span className="text-xs text-slate-400">
                    Inspect individual vehicle arrivals and attendance pairing
                </span>
            </div>

            {/* Selection */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                        Departure Operation
                    </label>

                    <select
                        value={selectedOperationId}
                        onChange={(e) =>
                            handleOperationChange(e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                    >
                        <option value="">
                            Select departure operation
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
                            No Departure operations found. Add a Departure operation in Daily Operations first.
                        </p>
                    )}
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                        Vehicle
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
                            Select vehicle
                        </option>

                        {assignedVehicles.map(({ id, vehicle }) => (
                            <option key={id} value={id}>
                                {vehicle.number || vehicle.name || `Vehicle ${id}`}
                            </option>
                        ))}
                    </select>

                    {selectedOperation && assignedVehicles.length === 0 && (
                        <p className="mt-2 text-xs text-amber-600">
                            No vehicles distributed to this Departure operation yet. Open Daily Operations and distribute vehicles first.
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
                        Select a departure operation
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                        Choose an operation and vehicle to find attendance opportunities.
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
                        Select a vehicle to continue.
                    </p>
                </div>
            )}

            {/* Current Trip */}
            {selectedVehicleArrival && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                    <h2 className="mb-4 font-semibold text-slate-800">
                        Vehicle Current Trip
                    </h2>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                            <p className="text-xs text-slate-500">
                                Vehicle
                            </p>

                            <p className="mt-1 font-semibold text-slate-800">
                                {selectedVehicleId}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-500">
                                Destination
                            </p>

                            <p className="mt-1 font-semibold text-slate-800">
                                {selectedVehicleArrival.stopName}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-500">
                                Estimated Arrival
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
                            Attendance Suggestions
                        </h2>

                        <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                            {results.suggestions.length} Suitable
                        </span>
                    </div>

                    {results.suggestions.length === 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                            <AlertCircle
                                className="mx-auto mb-3 text-amber-500"
                                size={32}
                            />

                            <h3 className="font-semibold text-slate-700">
                                No suitable attendance trips found
                            </h3>

                            <p className="mt-1 text-sm text-slate-500">
                                Check remaining requests and travel time records.
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
                                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                                            status.canAssign
                                                ? "bg-green-100 text-green-700"
                                                : "bg-amber-100 text-amber-700"
                                        }`}
                                    >
                                        {status.canAssign
                                            ? "Available"
                                            : "Needs attention"}
                                    </span>
                                </div>

                                <div className="my-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    <div>
                                        <p className="text-xs text-slate-500">
                                            Current Location
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                            {suggestion.currentStop}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-500">
                                            Estimated Arrival
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                            {formatDate(suggestion.estimatedArrivalDate)}
                                            <br />
                                            {formatTime(suggestion.estimatedArrival)}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-500">
                                            Scheduled Time
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                            {formatDate(suggestion.scheduledDate)}
                                            <br />
                                            {formatTime(suggestion.scheduledTime)}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-500">
                                            Remaining Vehicles
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                            {suggestion.remainingVehicles}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                                    <Clock size={16} />

                                    Travel time: {suggestion.travelDuration} minutes

                                    <ArrowRight size={16} />

                                    <span className="font-medium text-green-700">
                                        {suggestion.minutesEarly} minutes before scheduled time
                                    </span>
                                </div>

                                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <UserRound size={17} />
                                        Driver for this trip
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
                                                Select driver
                                            </option>

                                            {status.availableDrivers.map((item) => (
                                                <option
                                                    key={item.driver.id}
                                                    value={item.driver.id}
                                                >
                                                    {item.driver.name} - {item.assignment.shift}
                                                    ({item.assignment.startTime} - {item.assignment.endTime})
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm text-red-600">
                                            No driver assignment covers this trip and its waiting period.
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
                                        Assign Vehicle
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
                            Missing Travel Time Data
                        </h3>

                        <div className="space-y-2">
                            {results.missingTravelTimes.map((item, index) => (
                                <p
                                    key={`${item.operationId}-${item.stopId}-${index}`}
                                    className="text-sm text-amber-800"
                                >
                                    {item.fromStopName} → {item.stopName}
                                    {" — "}
                                    No travel time recorded.
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
                            Trips the vehicle cannot reach on time
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
                                    {" | Estimated arrival: "}
                                    {formatTime(item.estimatedArrival)}
                                    {" / Scheduled: "}
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
                title="Smart Allocation"
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
