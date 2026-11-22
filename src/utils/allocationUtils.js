import {
    addMinutesToDateTime,
    dateTimeToMinutes,
} from "./timeUtils.js";

// Convert a date and time into an absolute minute value.
function getDateTime(date, time) {
    return dateTimeToMinutes(date, time);
}

// Get a stop from a route.
function getStop(routes, routeName, stopId) {
    const route = routes.find(
        (item) => item.name === routeName
    );

    const stop = route?.stops.find(
        (item) => Number(item.id) === Number(stopId)
    );

    return { route, stop };
}

// Get the arrival details of a vehicle after a Departure operation.
export function getDepartureArrival(operation, vehicleId, routes) {
    if (
        !operation ||
        operation.type !== "Departure" ||
        !Array.isArray(routes)
    ) {
        return null;
    }

    const assignments = operation.vehicleAssignments || {};
    const stopId = Number(assignments[vehicleId]);

    if (!Number.isFinite(stopId) || stopId <= 0) {
        return null;
    }

    const { route, stop } = getStop(
        routes,
        operation.route,
        stopId
    );

    if (!route || !stop) return null;

    const duration = Number(stop.departure);

    if (!Number.isFinite(duration) || duration < 0) {
        return null;
    }

    const arrival = addMinutesToDateTime(
        operation.date,
        operation.time,
        duration
    );

    if (!arrival) return null;

    return {
        vehicleId: Number(vehicleId),
        routeName: route.name,
        stopId: Number(stop.id),
        stopName: stop.name,
        departureDate: operation.date,
        departureTime: operation.time,
        arrivalDate: arrival.date,
        arrivalTime: arrival.time,
        arrivalDateTime: getDateTime(
            arrival.date,
            arrival.time
        ),
        duration,
    };
}

// Get the travel time required between two consecutive trips.
//
// A vehicle finishing at a stop can:
// 1. Move directly to another Attendance stop.
// 2. Return to the company before a Departure operation.
export function getRequiredTransferTime(
    fromTrip,
    toTrip,
    travelTimes = []
) {
    if (!fromTrip || !toTrip) return null;

    // The next trip is an Attendance operation.
    // Its scheduled time is the required arrival time at its stop.
    if (toTrip.type === "Attendance") {
        const fromStopId = Number(fromTrip.stopId);
        const toStopId = Number(toTrip.stopId);

        if (
            !Number.isFinite(fromStopId) ||
            !Number.isFinite(toStopId)
        ) {
            return null;
        }

        // Already at the required stop.
        if (fromStopId === toStopId) return 0;

        const travel = travelTimes.find(
            (item) =>
                Number(item.fromStopId) === fromStopId &&
                Number(item.toStopId) === toStopId
        );

        if (!travel) return null;

        const duration = Number(travel.duration);

        return Number.isFinite(duration) && duration >= 0
            ? duration
            : null;
    }

    // The next trip is a Departure operation.
    // The vehicle must return from its current stop to the company.
    if (toTrip.type === "Departure") {
        const duration = Number(
            fromTrip.stopToCompanyDuration
        );

        return Number.isFinite(duration) && duration >= 0
            ? duration
            : null;
    }

    return null;
}

// Count assigned vehicles at an Attendance stop.
function getAssignedCount(operation, stopId) {
    const assignments = operation.vehicleAssignments || {};

    return Object.values(assignments).filter(
        (assignedStopId) =>
            Number(assignedStopId) === Number(stopId)
    ).length;
}

// Find suitable and late Attendance requests for a vehicle.
export function getAttendanceSuggestions({
    departureOperation,
    vehicleId,
    operations,
    travelTimes,
    routes,
}) {
    const arrival = getDepartureArrival(
        departureOperation,
        vehicleId,
        routes
    );

    if (
        !arrival ||
        arrival.arrivalDateTime === null ||
        !Array.isArray(operations) ||
        !Array.isArray(travelTimes) ||
        !Array.isArray(routes)
    ) {
        return {
            arrival: null,
            suggestions: [],
            missingTravelTimes: [],
            lateCandidates: [],
        };
    }

    const suggestions = [];
    const missingTravelTimes = [];
    const lateCandidates = [];

    // Search Attendance operations within 24 hours
    // before and after the vehicle reaches its Departure stop.
    const attendanceOperations = operations.filter((operation) => {
        if (operation.type !== "Attendance") return false;

        const scheduledDateTime = getDateTime(
            operation.date,
            operation.time
        );

        if (scheduledDateTime === null) return false;

        return (
            scheduledDateTime >= arrival.arrivalDateTime - 1440 &&
            scheduledDateTime <= arrival.arrivalDateTime + 1440
        );
    });

    attendanceOperations.forEach((operation) => {
        const route = routes.find(
            (item) => item.name === operation.route
        );

        if (!route) return;

        route.stops.forEach((stop) => {
            const requestedCount = Number(
                operation.requestedStopAllocations?.[stop.id]
            ) || 0;

            const assignedCount = getAssignedCount(
                operation,
                stop.id
            );

            const remainingVehicles = Math.max(
                requestedCount - assignedCount,
                0
            );

            if (remainingVehicles === 0) return;

            const targetStopId = Number(stop.id);

            let travelDuration = 0;

            if (arrival.stopId !== targetStopId) {
                const travel = travelTimes.find(
                    (item) =>
                        Number(item.fromStopId) === arrival.stopId &&
                        Number(item.toStopId) === targetStopId
                );

                if (!travel) {
                    missingTravelTimes.push({
                        operationId: operation.id,
                        routeName: route.name,
                        stopId: stop.id,
                        stopName: stop.name,
                        fromStopName: arrival.stopName,
                        scheduledTime: operation.time,
                        scheduledDate: operation.date,
                    });

                    return;
                }

                travelDuration = Number(travel.duration);

                if (
                    !Number.isFinite(travelDuration) ||
                    travelDuration < 0
                ) {
                    return;
                }
            }

            // Estimated arrival at the Attendance stop.
            const estimatedArrival = addMinutesToDateTime(
                arrival.arrivalDate,
                arrival.arrivalTime,
                travelDuration
            );

            if (!estimatedArrival) return;

            const estimatedArrivalDateTime = getDateTime(
                estimatedArrival.date,
                estimatedArrival.time
            );

            const scheduledDateTime = getDateTime(
                operation.date,
                operation.time
            );

            if (
                estimatedArrivalDateTime === null ||
                scheduledDateTime === null
            ) {
                return;
            }

            const minutesEarly =
                scheduledDateTime - estimatedArrivalDateTime;

            const candidate = {
                operationId: operation.id,
                routeName: route.name,
                stopId: stop.id,
                stopName: stop.name,

                scheduledTime: operation.time,
                scheduledDate: operation.date,

                currentStop: arrival.stopName,
                currentArrivalTime: arrival.arrivalTime,
                currentArrivalDate: arrival.arrivalDate,

                travelDuration,

                estimatedArrival: estimatedArrival.time,
                estimatedArrivalDate: estimatedArrival.date,

                remainingVehicles,
                minutesEarly,
            };

            if (minutesEarly >= 0) {
                suggestions.push(candidate);
            } else {
                lateCandidates.push(candidate);
            }
        });
    });

    // Closest upcoming Attendance request first.
    suggestions.sort(
        (a, b) => a.minutesEarly - b.minutesEarly
    );

    // Least-late requests first.
    lateCandidates.sort(
        (a, b) => b.minutesEarly - a.minutesEarly
    );

    return {
        arrival,
        suggestions,
        missingTravelTimes,
        lateCandidates,
    };
}

// Build a vehicle trip from an operation and its assigned stop.
function getTripDetails(operation, stopId, routes) {
    const { route, stop } = getStop(
        routes,
        operation.route,
        stopId
    );

    if (!route || !stop) return null;

    const scheduledDateTime = getDateTime(
        operation.date,
        operation.time
    );

    if (scheduledDateTime === null) return null;

    const duration = Number(
        operation.type === "Departure"
            ? stop.departure
            : stop.attendance
    );

    const stopToCompanyDuration = Number(stop.departure);

    if (
        !Number.isFinite(duration) ||
        duration < 0 ||
        !Number.isFinite(stopToCompanyDuration) ||
        stopToCompanyDuration < 0
    ) {
        return null;
    }

    let start;
    let end;

    if (operation.type === "Departure") {
        // Departure time = vehicle leaves the company.
        start = scheduledDateTime;
        end = start + duration;
    } else if (operation.type === "Attendance") {
        // Attendance time = vehicle arrives at the pickup stop.
        end = scheduledDateTime;
        start = end - duration;
    } else {
        return null;
    }

    return {
        operation,
        type: operation.type,
        route,
        stop,
        stopId: Number(stop.id),

        start,
        end,

        duration,
        stopToCompanyDuration,

        // Used to order trips chronologically:
        // Departure is ordered by its company departure time.
        // Attendance is ordered by its stop arrival deadline.
        orderTime:
            operation.type === "Departure"
                ? start
                : end,
    };
}

// Check whether a vehicle can move between its assigned trips.
export function checkVehicleConflict({
    vehicleId,
    targetOperation,
    operations,
    travelTimes,
    routes,
}) {
    if (
        !targetOperation ||
        !Array.isArray(routes) ||
        !Array.isArray(operations) ||
        !Array.isArray(travelTimes)
    ) {
        return {
            hasConflict: true,
            reason: "Invalid target operation or scheduling data.",
        };
    }

    const targetTrip = getTripDetails(
        targetOperation,
        targetOperation.stopId,
        routes
    );

    if (!targetTrip) {
        return {
            hasConflict: true,
            reason: "Could not determine the target trip details.",
        };
    }

    // Check trips from the previous, target, and following days.
    // This supports overnight operation schedules.
    const targetDate = new Date(
        `${targetOperation.date}T00:00:00Z`
    );

    if (
        Number.isNaN(targetDate.getTime()) ||
        targetDate.toISOString().slice(0, 10) !== targetOperation.date
    ) {
        return {
            hasConflict: true,
            reason: "Invalid target operation date.",
        };
    }

    const previousDate = new Date(targetDate);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);

    const nextDate = new Date(targetDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    const toDateString = (value) =>
        value.toISOString().slice(0, 10);

    const relevantDates = new Set([
        toDateString(previousDate),
        targetOperation.date,
        toDateString(nextDate),
    ]);

    const vehicleTrips = operations
        .filter((operation) => {
            if (!relevantDates.has(operation.date)) {
                return false;
            }

            if (
                String(operation.id) ===
                String(targetOperation.id)
            ) {
                return false;
            }

            return Object.prototype.hasOwnProperty.call(
                operation.vehicleAssignments || {},
                String(vehicleId)
            );
        })
        .map((operation) => {
            const stopId =
                operation.vehicleAssignments[String(vehicleId)];

            return getTripDetails(
                operation,
                stopId,
                routes
            );
        })
        .filter(Boolean);

    const allTrips = [
        ...vehicleTrips,
        targetTrip,
    ].sort((a, b) => a.orderTime - b.orderTime);

    // Check every transition between consecutive trips.
    for (let i = 0; i < allTrips.length - 1; i++) {
        const currentTrip = allTrips[i];
        const nextTrip = allTrips[i + 1];

        // For Attendance, nextTrip.end is the required arrival time
        // at the pickup stop.
        //
        // For Departure, nextTrip.start is the required time
        // to leave the company.
        const requiredTime =
            nextTrip.type === "Attendance"
                ? nextTrip.end
                : nextTrip.start;

        const availableTime =
            requiredTime - currentTrip.end;

        if (availableTime < 0) {
            return {
                hasConflict: true,
                reason:
                    `Vehicle cannot complete the trip on time. ` +
                    `Previous trip ends at ${currentTrip.operation.date} ` +
                    `${currentTrip.operation.time}, while the next trip ` +
                    `requires the vehicle earlier.`,
            };
        }

        const requiredTravelTime = getRequiredTransferTime(
            currentTrip,
            nextTrip,
            travelTimes
        );

        if (requiredTravelTime === null) {
            return {
                hasConflict: true,
                reason:
                    `Missing travel time from ${currentTrip.stop.name} ` +
                    `to the next trip location.`,
            };
        }

        if (availableTime < requiredTravelTime) {
            return {
                hasConflict: true,
                reason:
                    `Vehicle needs ${requiredTravelTime} minutes ` +
                    `to reach the next trip, but only ` +
                    `${availableTime} minutes are available.`,
            };
        }
    }

    return {
        hasConflict: false,
        reason: "",
    };
}