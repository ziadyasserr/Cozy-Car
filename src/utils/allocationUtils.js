import {
    addMinutesToDateTime,
    dateTimeToMinutes,
} from "./timeUtils.js";

const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86400000;

// Convert a date and time into an absolute minute value.
function getDateTime(date, time) {
    return dateTimeToMinutes(date, time);
}

// Returns a valid, non-negative duration, or null when data is missing/invalid.
function toValidDuration(value) {
    if (value === null || value === undefined || value === "") return null;

    const duration = Number(value);

    return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

// Absolute minutes -> "YYYY-MM-DD HH:mm" (used in messages).
function formatDateTime(totalMinutes) {
    const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
    const minutesOfDay = totalMinutes - days * MINUTES_PER_DAY;

    const date = new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
    const hours = String(Math.floor(minutesOfDay / 60)).padStart(2, "0");
    const minutes = String(minutesOfDay % 60).padStart(2, "0");

    return `${date} ${hours}:${minutes}`;
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
// After a Departure the vehicle is at the drop-off stop.
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

    const duration = toValidDuration(stop.departure);

    if (duration === null) return null;

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

// Minutes the vehicle needs between the end of `fromTrip` and being ready
// for `toTrip`.
//
// Where a trip leaves the vehicle:
// - Attendance: the vehicle returns to the company with the employees.
// - Departure:  the vehicle is at the drop-off stop.
//
// Rules:
// - Company   -> Departure : 0 (already at the company).
// - Company   -> Attendance: Attendance duration of the new stop (Routes).
// - Drop-off  -> Departure : return to the company (Departure duration of the stop).
// - Drop-off  -> Attendance: Travel Times (0 if it is the same stop).
//
// Returns null when the data needed is missing. Nothing is invented.
export function getRequiredTransferTime(
    fromTrip,
    toTrip,
    travelTimes = []
) {
    if (!fromTrip || !toTrip) return null;

    const endsAtCompany = fromTrip.endsAt
        ? fromTrip.endsAt === "company"
        : fromTrip.type === "Attendance";

    if (toTrip.type === "Departure") {
        if (endsAtCompany) return 0;

        return toValidDuration(fromTrip.stopToCompanyDuration);
    }

    if (toTrip.type === "Attendance") {
        if (endsAtCompany) {
            return toValidDuration(toTrip.duration);
        }

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

        return travel ? toValidDuration(travel.duration) : null;
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
            scheduledDateTime >= arrival.arrivalDateTime - MINUTES_PER_DAY &&
            scheduledDateTime <= arrival.arrivalDateTime + MINUTES_PER_DAY
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

                travelDuration = toValidDuration(travel.duration);

                if (travelDuration === null) return;
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
//
// Departure:
//   start = scheduled time (vehicle leaves the company)
//   end   = start + stop Departure duration (vehicle at the drop-off stop)
//   endsAt = "stop"
//
// Attendance:
//   start = scheduled time - stop Attendance duration (vehicle leaves the company)
//   scheduled time = vehicle must be at the pickup stop
//   end   = scheduled time + stop Departure duration (vehicle back at the company)
//   endsAt = "company"
//
// Returns null when a required duration is missing.
export function getTripDetails(operation, stopId, routes) {
    if (!operation || !Array.isArray(routes)) return null;

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

    // Time between the stop and the company (used to return to the company).
    const stopToCompanyDuration = toValidDuration(stop.departure);

    if (stopToCompanyDuration === null) return null;

    if (operation.type === "Departure") {
        const start = scheduledDateTime;
        const end = start + stopToCompanyDuration;

        return {
            operation,
            operationId: operation.id,
            type: "Departure",
            route,
            stop,
            stopId: Number(stop.id),
            stopName: stop.name,

            start,
            end,
            requiredTime: start,
            endsAt: "stop",

            duration: stopToCompanyDuration,
            stopToCompanyDuration,
            orderTime: start,
        };
    }

    if (operation.type === "Attendance") {
        const companyToStopDuration = toValidDuration(stop.attendance);

        if (companyToStopDuration === null) return null;

        const start = scheduledDateTime - companyToStopDuration;
        const end = scheduledDateTime + stopToCompanyDuration;

        return {
            operation,
            operationId: operation.id,
            type: "Attendance",
            route,
            stop,
            stopId: Number(stop.id),
            stopName: stop.name,

            start,
            end,
            requiredTime: scheduledDateTime,
            endsAt: "company",

            duration: companyToStopDuration,
            stopToCompanyDuration,
            orderTime: start,
        };
    }

    return null;
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

        // Time the vehicle must be ready for the next trip:
        // - Attendance: arrival time at the pickup stop.
        // - Departure:  the time it leaves the company.
        const availableTime =
            nextTrip.requiredTime - currentTrip.end;

        if (availableTime < 0) {
            return {
                hasConflict: true,
                reason:
                    `Vehicle is still busy: its previous trip ends at ` +
                    `${formatDateTime(currentTrip.end)}, but the next trip ` +
                    `requires it at ${formatDateTime(nextTrip.requiredTime)}.`,
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
                    `to ${nextTrip.stop.name}.`,
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