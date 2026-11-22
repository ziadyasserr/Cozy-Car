
import { useMemo, useState } from "react";
import {
    Bus,
    CalendarDays,
    Clock,
    MapPin,
    UserRound,
} from "lucide-react";

import { useFleet } from "../../../context/FleetContext";
import { useOperations } from "../../../context/OperationsContext";
import { useRoutes } from "../../../context/RoutesContext";
import { useDrivers } from "../../../context/DriversContext";
import { useDriverAssignments } from "../../../context/DriverAssignmentsContext";
import { useTravelTimes } from "../../../context/TravelTimesContext";

import {
    timeToMinutes,
    dateTimeToMinutes,
    addMinutesToDateTime,
} from "../../../utils/timeUtils";

import { getRequiredTransferTime } from "../../../utils/allocationUtils";

// Get previous or next date using UTC to avoid date-boundary issues.
const changeDate = (date, amount) => {
    const result = new Date(`${date}T00:00:00Z`);
    result.setUTCDate(result.getUTCDate() + amount);

    return result.toISOString().slice(0, 10);
};

export default function VehicleTimeline() {
    const { vehicles } = useFleet();
    const { operations } = useOperations();
    const { routes } = useRoutes();
    const { drivers } = useDrivers();
    const { driverAssignments } = useDriverAssignments();
    const { travelTimes } = useTravelTimes();

    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split("T")[0]
    );

    // Check whether a trip time belongs to a driver's shift.
    const isTimeInShift = (time, startTime, endTime) => {
        if (!time || !startTime || !endTime) return false;

        const current = timeToMinutes(time);
        const start = timeToMinutes(startTime);
        const end = timeToMinutes(endTime);

        if ([current, start, end].some((value) => value === null)) {
            return false;
        }

        if (end <= start) {
            return current >= start || current < end;
        }

        return current >= start && current < end;
    };

    // Find the driver assigned to a vehicle at the actual trip start.
    const getTripDriver = (vehicleId, tripDate, tripTime) => {
        const assignment = driverAssignments.find((item) => {
            if (Number(item.vehicleId) !== Number(vehicleId)) {
                return false;
            }

            if (item.date === tripDate) {
                return isTimeInShift(
                    tripTime,
                    item.startTime,
                    item.endTime
                );
            }

            // An overnight assignment may continue into the next date.
            if (item.endTime <= item.startTime) {
                const nextDate = changeDate(item.date, 1);

                if (tripDate === nextDate) {
                    const current = timeToMinutes(tripTime);
                    const end = timeToMinutes(item.endTime);

                    return (
                        current !== null &&
                        end !== null &&
                        current < end
                    );
                }
            }

            return false;
        });

        if (!assignment) return null;

        const driver = drivers.find(
            (item) =>
                Number(item.id) === Number(assignment.driverId)
        );

        if (!driver) return null;

        return {
            name: driver.name,
            shift: assignment.shift,
        };
    };

    // Build the timeline and calculate trips across date boundaries.
    const timeline = useMemo(() => {
        const previousDate = changeDate(selectedDate, -1);
        const nextDate = changeDate(selectedDate, 1);

        const selectedStart = dateTimeToMinutes(
            selectedDate,
            "00:00"
        );

        const selectedEnd = selectedStart + 1440;

        return vehicles.map((vehicle) => {
            // Include previous, selected and next day.
            // The previous day catches trips continuing into today.
            // The next day allows us to find the next scheduled trip.
            const vehicleOperations = operations
                .filter((operation) => {
                    const isRelevantDate = [
                        previousDate,
                        selectedDate,
                        nextDate,
                    ].includes(operation.date);

                    return (
                        isRelevantDate &&
                        Object.prototype.hasOwnProperty.call(
                            operation.vehicleAssignments || {},
                            String(vehicle.id)
                        )
                    );
                })
                .map((operation) => {
                    const stopId = Number(
                        operation.vehicleAssignments[vehicle.id]
                    );

                    const route = routes.find(
                        (item) => item.name === operation.route
                    );

                    const stop = route?.stops.find(
                        (item) => Number(item.id) === stopId
                    );

                    if (!stop) return null;

                    const isDeparture =
                        operation.type === "Departure";

                    const duration = Number(
                        isDeparture
                            ? stop.departure
                            : stop.attendance
                    );

                    if (
                        !Number.isFinite(duration) ||
                        duration < 0
                    ) {
                        return null;
                    }

                    const scheduledTime = dateTimeToMinutes(
                        operation.date,
                        operation.time
                    );

                    if (scheduledTime === null) return null;

                    /*
                     * Attendance:
                     * operation.time = arrival time at the stop.
                     * Actual trip starts before that time.
                     *
                     * Departure:
                     * operation.time = departure time from company.
                     * Actual trip ends after the travel duration.
                     */

                    const start = isDeparture
                        ? scheduledTime
                        : scheduledTime - duration;

                    const end = isDeparture
                        ? scheduledTime + duration
                        : scheduledTime;

                    const startDateTime = isDeparture
                        ? {
                              date: operation.date,
                              time: operation.time,
                          }
                        : addMinutesToDateTime(
                              operation.date,
                              operation.time,
                              -duration
                          );

                    const endDateTime = isDeparture
                        ? addMinutesToDateTime(
                              operation.date,
                              operation.time,
                              duration
                          )
                        : {
                              date: operation.date,
                              time: operation.time,
                          };

                    if (!startDateTime || !endDateTime) {
                        return null;
                    }

                    // Find the driver based on the actual trip start.
                    const driver = getTripDriver(
                        vehicle.id,
                        startDateTime.date,
                        startDateTime.time
                    );

                    return {
                        operationId: operation.id,
                        operationDate: operation.date,
                        type: operation.type,
                        routeName: route.name,
                        stopName: stop.name,
                        stopId,
                        start,
                        end,
                        startDate: startDateTime.date,
                        startTime: startDateTime.time,
                        arrivalDate: endDateTime.date,
                        arrivalTime: endDateTime.time,
                        endDate: endDateTime.date,
                        endTime: endDateTime.time,
                        duration,
                        driverName: driver?.name || null,
                        driverShift: driver?.shift || null,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.start - b.start);

            // Only display trips that overlap the selected date.
            // Keep all three dates available for next-trip calculations.
            const visibleTrips = vehicleOperations.filter(
                (trip) =>
                    trip.start < selectedEnd &&
                    trip.end > selectedStart
            );

            const tripsWithNext = visibleTrips.map((trip) => {
                const currentIndex = vehicleOperations.findIndex(
                    (item) =>
                        item.operationId === trip.operationId &&
                        item.operationDate === trip.operationDate
                );

                const nextTrip =
                    currentIndex >= 0
                        ? vehicleOperations[currentIndex + 1] || null
                        : null;

                if (!nextTrip) {
                    return {
                        ...trip,
                        nextTrip: null,
                        gapMinutes: null,
                        requiredTravelMinutes: null,
                        remainingMinutes: null,
                        hasConflict: false,
                        missingTravelTime: false,
                    };
                }

                const gapMinutes = nextTrip.start - trip.end;

                const requiredTravelMinutes =
                    getRequiredTransferTime(
                        trip,
                        nextTrip,
                        travelTimes
                    );

                const remainingMinutes =
                    requiredTravelMinutes === null
                        ? null
                        : gapMinutes - requiredTravelMinutes;

                const hasConflict =
                    gapMinutes < 0 ||
                    (
                        requiredTravelMinutes !== null &&
                        remainingMinutes < 0
                    );

                return {
                    ...trip,
                    nextTrip,
                    gapMinutes,
                    requiredTravelMinutes,
                    remainingMinutes,
                    hasConflict,
                    missingTravelTime:
                        requiredTravelMinutes === null,
                };
            });

            return {
                vehicle,
                operations: tripsWithNext,
            };
        });
    }, [
        vehicles,
        operations,
        routes,
        drivers,
        driverAssignments,
        travelTimes,
        selectedDate,
    ]);

    const formatTime = (time) => {
        if (!time) return "--";

        const [hours, minutes] = time.split(":");
        const hour = Number(hours);

        return `${hour % 12 || 12}:${minutes}`;
    };

    const formatDateTime = (date, time) => {
        if (!date || !time) return "--";

        return `${date} - ${formatTime(time)}`;
    };

    const totalTrips = timeline.reduce(
        (total, item) => total + item.operations.length,
        0
    );

    const activeVehicles = timeline.filter(
        (item) => item.operations.length > 0
    ).length;

    const assignedDrivers = timeline.reduce(
        (total, item) =>
            total +
            item.operations.filter((trip) => trip.driverName).length,
        0
    );

    const conflictCount = timeline.reduce(
        (total, item) =>
            total +
            item.operations.filter((trip) => trip.hasConflict).length,
        0
    );

    const missingTravelTimeCount = timeline.reduce(
        (total, item) =>
            total +
            item.operations.filter(
                (trip) => trip.missingTravelTime
            ).length,
        0
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-800">
                    Vehicle Timeline
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                    Track every vehicle's daily trips, drivers and movements.
                </p>
            </div>

            {/* Date Filter */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-slate-700">
                    <CalendarDays size={20} />

                    <span className="font-medium">
                        Select Operation Date
                    </span>
                </div>

                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-blue-500"
                />
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm text-slate-500">
                        Total Vehicles
                    </p>

                    <h2 className="mt-2 text-2xl font-bold text-slate-800">
                        {vehicles.length}
                    </h2>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm text-slate-500">
                        Vehicles With Trips
                    </p>

                    <h2 className="mt-2 text-2xl font-bold text-blue-600">
                        {activeVehicles}
                    </h2>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm text-slate-500">
                        Total Assigned Trips
                    </p>

                    <h2 className="mt-2 text-2xl font-bold text-green-600">
                        {totalTrips}
                    </h2>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm text-slate-500">
                        Trips With Drivers
                    </p>

                    <h2 className="mt-2 text-2xl font-bold text-purple-600">
                        {assignedDrivers}
                    </h2>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm text-slate-500">
                        Potential Conflicts
                    </p>

                    <h2 className="mt-2 text-2xl font-bold text-red-600">
                        {conflictCount}
                    </h2>

                    {missingTravelTimeCount > 0 && (
                        <p className="mt-1 text-xs text-amber-600">
                            {missingTravelTimeCount} missing travel time records
                        </p>
                    )}
                </div>
            </div>

            {/* Vehicle Timelines */}
            <div className="space-y-4">
                {timeline.map(
                    ({ vehicle, operations: vehicleTrips }) => (
                        <div
                            key={vehicle.id}
                            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                        >
                            {/* Vehicle Header */}
                            <div className="flex items-center justify-between border-b border-slate-100 p-4">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                                        <Bus size={22} />
                                    </div>

                                    <div>
                                        <h3 className="font-semibold text-slate-800">
                                            {vehicle.number || vehicle.name}
                                        </h3>

                                        <p className="text-xs text-slate-500">
                                            {vehicle.type}
                                        </p>
                                    </div>
                                </div>

                                <span
                                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                                        vehicleTrips.length
                                            ? "bg-green-100 text-green-700"
                                            : "bg-slate-100 text-slate-500"
                                    }`}
                                >
                                    {vehicleTrips.length
                                        ? `${vehicleTrips.length} Trips`
                                        : "No Trips"}
                                </span>
                            </div>

                            {/* Trips */}
                            <div className="p-4">
                                {vehicleTrips.length === 0 ? (
                                    <p className="py-3 text-center text-sm text-slate-400">
                                        No assigned trips on this date.
                                    </p>
                                ) : (
                                    <div className="space-y-4">
                                        {vehicleTrips.map((trip, index) => (
                                            <div
                                                key={`${trip.operationId}-${trip.operationDate}-${index}`}
                                                className="rounded-lg border border-slate-100 bg-slate-50 p-4"
                                            >
                                                {/* Trip Header */}
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                                                trip.type === "Attendance"
                                                                    ? "bg-blue-100 text-blue-700"
                                                                    : "bg-orange-100 text-orange-700"
                                                            }`}
                                                        >
                                                            {trip.type}
                                                        </span>

                                                        <span className="font-semibold text-slate-800">
                                                            {trip.routeName}
                                                        </span>
                                                    </div>

                                                    <span className="text-sm font-medium text-slate-600">
                                                        {formatDateTime(
                                                            trip.startDate,
                                                            trip.startTime
                                                        )}
                                                    </span>
                                                </div>

                                                {/* Trip Details */}
                                                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                    <div>
                                                        <p className="text-xs text-slate-500">
                                                            <MapPin className="mr-1 inline" size={14} />
                                                            Assigned Stop
                                                        </p>

                                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                                            {trip.stopName}
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs text-slate-500">
                                                            <Clock className="mr-1 inline" size={14} />
                                                            Estimated Arrival
                                                        </p>

                                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                                            {formatDateTime(
                                                                trip.arrivalDate,
                                                                trip.arrivalTime
                                                            )}
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs text-slate-500">
                                                            <Clock className="mr-1 inline" size={14} />
                                                            Estimated End
                                                        </p>

                                                        <p className="mt-1 text-sm font-medium text-slate-800">
                                                            {formatDateTime(
                                                                trip.endDate,
                                                                trip.endTime
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Driver Information */}
                                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                                                    <div className="flex items-center gap-2">
                                                        <UserRound
                                                            size={18}
                                                            className="text-slate-500"
                                                        />

                                                        <div>
                                                            <p className="text-xs text-slate-500">
                                                                Assigned Driver
                                                            </p>

                                                            <p className="mt-1 text-sm font-semibold text-slate-800">
                                                                {trip.driverName || "Not Assigned"}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                                                        {trip.driverShift || "No Shift"}
                                                    </span>
                                                </div>

                                                {/* Duration */}
                                                <div className="mt-3 border-t border-slate-200 pt-3">
                                                    <p className="text-xs text-slate-500">
                                                        Estimated Duration
                                                    </p>

                                                    <p className="mt-1 text-sm font-medium text-slate-700">
                                                        {trip.duration} minutes
                                                    </p>
                                                </div>

                                                {/* Next Trip Status */}
                                                {trip.nextTrip && (
                                                    <div
                                                        className={`mt-4 rounded-lg border p-3 ${
                                                            trip.hasConflict
                                                                ? "border-red-200 bg-red-50"
                                                                : trip.missingTravelTime
                                                                    ? "border-amber-200 bg-amber-50"
                                                                    : "border-green-200 bg-green-50"
                                                        }`}
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-xs font-semibold text-slate-600">
                                                                    {trip.hasConflict
                                                                        ? "Potential Schedule Conflict"
                                                                        : trip.missingTravelTime
                                                                            ? "Travel Time Not Configured"
                                                                            : "Next Scheduled Trip"}
                                                                </p>

                                                                <p className="mt-1 text-sm font-medium text-slate-800">
                                                                    {trip.nextTrip.type} - {trip.nextTrip.routeName}
                                                                </p>

                                                                <p className="mt-1 text-xs text-slate-600">
                                                                    {trip.nextTrip.stopName}
                                                                </p>
                                                            </div>

                                                            <div className="text-right">
                                                                <p className="text-xs text-slate-500">
                                                                    Next Start
                                                                </p>

                                                                <p className="mt-1 text-sm font-semibold text-slate-800">
                                                                    {formatDateTime(
                                                                        trip.nextTrip.startDate,
                                                                        trip.nextTrip.startTime
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
                                                            <div>
                                                                <p className="text-xs text-slate-500">
                                                                    Available Time
                                                                </p>

                                                                <p className="mt-1 text-sm font-semibold text-slate-800">
                                                                    {trip.gapMinutes} min
                                                                </p>
                                                            </div>

                                                            <div>
                                                                <p className="text-xs text-slate-500">
                                                                    Required Travel
                                                                </p>

                                                                <p className="mt-1 text-sm font-semibold text-slate-800">
                                                                    {trip.requiredTravelMinutes === null
                                                                        ? "Not Configured"
                                                                        : `${trip.requiredTravelMinutes} min`}
                                                                </p>
                                                            </div>

                                                            <div>
                                                                <p className="text-xs text-slate-500">
                                                                    Remaining Time
                                                                </p>

                                                                <p
                                                                    className={`mt-1 text-sm font-semibold ${
                                                                        trip.hasConflict
                                                                            ? "text-red-700"
                                                                            : trip.missingTravelTime
                                                                                ? "text-amber-700"
                                                                                : "text-green-700"
                                                                    }`}
                                                                >
                                                                    {trip.remainingMinutes === null
                                                                        ? "--"
                                                                        : `${trip.remainingMinutes} min`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
