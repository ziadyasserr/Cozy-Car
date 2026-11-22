/**
 * Cozy - Smart Auto-Allocation Engine
 *
 * Builds SUGGESTIONS only. Nothing is written until the supervisor applies them.
 * - Never invents travel times or durations: missing data excludes the vehicle.
 * - Uses getTripDetails / checkVehicleConflict from allocationUtils so the rules
 *   match Operations and Allocation exactly.
 * - After an Attendance the vehicle is at the company; after a Departure it is
 *   at the drop-off stop.
 * - Every suggestion carries a free driver who covers the whole period.
 */

import { dateTimeToMinutes } from "./timeUtils.js";
import {
    checkVehicleConflict,
    getRequiredTransferTime,
    getTripDetails,
} from "./allocationUtils.js";

const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86400000;
const FIXED_TYPE = "Fixed Vehicle Driver";

function toAbsoluteMinutes(date, time) {
    return dateTimeToMinutes(date, time);
}

function minutesToDateString(totalMinutes) {
    const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
    return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

function shiftDate(date, days) {
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    if (Number.isNaN(timestamp)) return null;
    return new Date(timestamp + days * MS_PER_DAY).toISOString().slice(0, 10);
}

// Interval of a driver assignment record. Also covers Full Day (00:00 -> 00:00).
function getRecordInterval(assignment) {
    const start = toAbsoluteMinutes(assignment.date, assignment.startTime);
    let end = toAbsoluteMinutes(assignment.date, assignment.endTime);

    if (start === null || end === null) return null;
    if (end <= start) end += MINUTES_PER_DAY;

    return { start, end };
}

function getFixedShiftParts(driver) {
    if (driver.fixedMode === "single" || driver.fixedShift === "00:00-24:00") {
        return { name: "Full Day", startTime: "00:00", endTime: "00:00" };
    }

    if (driver.fixedShift === "12:00-00:00") {
        return { name: "Second Shift", startTime: "12:00", endTime: "00:00" };
    }

    return { name: "First Shift", startTime: "00:00", endTime: "12:00" };
}

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

// All trips of a vehicle from the day before to the day after the date.
function getVehicleTrips(vehicleId, date, operations, routes) {
    const dates = new Set(
        [shiftDate(date, -1), date, shiftDate(date, 1)].filter(Boolean)
    );

    return operations
        .filter(
            (operation) =>
                dates.has(operation.date) &&
                Object.prototype.hasOwnProperty.call(
                    operation.vehicleAssignments || {},
                    String(vehicleId)
                )
        )
        .map((operation) =>
            getTripDetails(
                operation,
                operation.vehicleAssignments[vehicleId],
                routes
            )
        )
        .filter(Boolean)
        .sort((a, b) => a.orderTime - b.orderTime);
}

// Interval a vehicle spends on an operation (used for driver busy checks).
function getOperationInterval(operation, vehicleId, routes) {
    const trip = getTripDetails(
        operation,
        operation.vehicleAssignments?.[vehicleId],
        routes
    );

    return trip ? { start: trip.start, end: trip.end } : null;
}

// Free drivers who cover the whole window on the given vehicle.
function getDriverOptions({
    vehicleId,
    window,
    drivers,
    driverAssignments,
    operations,
    routes,
}) {
    const vId = Number(vehicleId);
    const candidates = new Map();
    const recordsByDriver = {};

    driverAssignments.forEach((assignment) => {
        if (Number(assignment.vehicleId) !== vId) return;

        const interval = getRecordInterval(assignment);
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

        const covers = intervalsCover(
            records.map((record) => record.interval),
            window.start,
            window.end
        );

        if (!covers) return;

        const display =
            records.find(
                (record) =>
                    record.interval.start <= window.end &&
                    record.interval.end >= window.end
            ) || records[0];

        candidates.set(Number(driver.id), {
            driver,
            shiftName: display.assignment.shift || "Assigned Shift",
        });
    });

    const firstDay = Math.floor(window.start / MINUTES_PER_DAY) - 1;
    const lastDay = Math.floor(window.end / MINUTES_PER_DAY);

    drivers
        .filter(
            (driver) =>
                driver.status === "Active" &&
                driver.driverType === FIXED_TYPE &&
                Number(driver.vehicleId) === vId &&
                !candidates.has(Number(driver.id))
        )
        .forEach((driver) => {
            const shift = getFixedShiftParts(driver);
            const intervals = [];

            for (let day = firstDay; day <= lastDay; day++) {
                intervals.push(
                    getRecordInterval({
                        date: minutesToDateString(day * MINUTES_PER_DAY),
                        startTime: shift.startTime,
                        endTime: shift.endTime,
                    })
                );
            }

            if (intervalsCover(intervals, window.start, window.end)) {
                candidates.set(Number(driver.id), {
                    driver,
                    shiftName: shift.name,
                });
            }
        });

    const isBusyElsewhere = (driverId) => {
        const busyInRecords = driverAssignments.some(
            (assignment) =>
                Number(assignment.driverId) === Number(driverId) &&
                Number(assignment.vehicleId) !== vId &&
                hasOverlap(getRecordInterval(assignment), window)
        );

        if (busyInRecords) return true;

        return operations.some((operation) =>
            Object.entries(operation.driverAssignments || {}).some(
                ([otherVehicleId, assignedDriverId]) =>
                    Number(assignedDriverId) === Number(driverId) &&
                    Number(otherVehicleId) !== vId &&
                    hasOverlap(
                        getOperationInterval(operation, otherVehicleId, routes),
                        window
                    )
            )
        );
    };

    return Array.from(candidates.values()).filter(
        (item) => !isBusyElsewhere(item.driver.id)
    );
}

function getAssignedCountAtStop(operation, stopId) {
    return Object.values(operation.vehicleAssignments || {}).filter(
        (assignedStopId) => Number(assignedStopId) === Number(stopId)
    ).length;
}

/**
 * Run smart allocation across all operations of a date.
 * Returns suggestions only. Nothing is saved here.
 */
export function runSmartAllocation({
    date,
    operations = [],
    vehicles = [],
    dailyAvailability = {},
    drivers = [],
    driverAssignments = [],
    travelTimes = [],
    routes = [],
}) {
    const todayAvailability = dailyAvailability?.[date] || {};

    // Active vehicles are available by default unless marked "Unavailable".
    const activeVehicles = vehicles.filter(
        (vehicle) =>
            vehicle.status === "Active" &&
            todayAvailability[vehicle.id] !== "Unavailable"
    );

    // Working copy so suggestions made in this run affect later ones.
    const workingOps = operations.map((operation) => ({
        ...operation,
        vehicleAssignments: { ...(operation.vehicleAssignments || {}) },
        driverAssignments: { ...(operation.driverAssignments || {}) },
    }));

    const targetOps = workingOps
        .filter((operation) => operation.date === date)
        .sort(
            (a, b) =>
                (toAbsoluteMinutes(a.date, a.time) ?? 0) -
                (toAbsoluteMinutes(b.date, b.time) ?? 0)
        );

    const proposedAllocations = [];
    const unfilledRequirements = [];

    const findBestCandidate = (operation, stop, reasons) => {
        const trip = getTripDetails(operation, stop.id, routes);

        if (!trip) {
            reasons.add(`Missing or invalid duration for stop ${stop.name}.`);
            return null;
        }

        let best = null;
        let noDriverFound = false;

        activeVehicles.forEach((vehicle) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    operation.vehicleAssignments,
                    String(vehicle.id)
                )
            ) {
                return;
            }

            const conflict = checkVehicleConflict({
                vehicleId: vehicle.id,
                targetOperation: { ...operation, stopId: stop.id },
                operations: workingOps,
                travelTimes,
                routes,
            });

            if (conflict.hasConflict) {
                if (conflict.reason.startsWith("Missing travel time")) {
                    reasons.add(conflict.reason);
                }
                return;
            }

            const previousTrip =
                getVehicleTrips(vehicle.id, date, workingOps, routes)
                    .filter(
                        (item) =>
                            String(item.operationId) !== String(operation.id) &&
                            item.orderTime < trip.orderTime
                    )
                    .pop() || null;

            // The driver must cover the vehicle from the end of its previous trip
            // until the new trip ends (for Attendance: back at the company).
            const window = {
                start: previousTrip ? previousTrip.end : trip.start,
                end: trip.end,
            };

            const driverOptions = getDriverOptions({
                vehicleId: vehicle.id,
                window,
                drivers,
                driverAssignments,
                operations: workingOps,
                routes,
            });

            if (driverOptions.length === 0) {
                noDriverFound = true;
                return;
            }

            let idleBuffer = null;

            if (previousTrip) {
                const transfer =
                    getRequiredTransferTime(previousTrip, trip, travelTimes) ?? 0;

                idleBuffer = Math.max(
                    trip.requiredTime - previousTrip.end - transfer,
                    0
                );
            }

            // Prefer a vehicle that continues without an empty return:
            // Departure -> Attendance, or Attendance -> Departure.
            const isChained =
                previousTrip &&
                ((previousTrip.type === "Departure" &&
                    operation.type === "Attendance") ||
                    (previousTrip.type === "Attendance" &&
                        operation.type === "Departure"));

            let score = 100;
            if (isChained) score += 60;
            if (idleBuffer !== null && idleBuffer <= 60) score += 20;
            else if (idleBuffer !== null && idleBuffer > 180) score -= 20;

            if (!best || score > best.score) {
                best = {
                    vehicle,
                    trip,
                    previousTrip,
                    idleBuffer,
                    driverOption: driverOptions[0],
                    score,
                };
            }
        });

        if (!best && noDriverFound) {
            reasons.add(
                "No free driver covers the required period for an available vehicle."
            );
        }

        return best;
    };

    targetOps.forEach((operation) => {
        const route = routes.find((item) => item.name === operation.route);
        if (!route || !route.stops || route.stops.length === 0) return;

        const requestedByStop = route.stops.map((stop) => ({
            stop,
            requested:
                Number(operation.requestedStopAllocations?.[stop.id]) || 0,
        }));

        const totalRequested = requestedByStop.reduce(
            (total, item) => total + item.requested,
            0
        );

        if (totalRequested === 0) {
            const missing =
                (Number(operation.vehiclesCount) || 0) -
                Object.keys(operation.vehicleAssignments).length;

            if (missing > 0) {
                unfilledRequirements.push({
                    operationId: operation.id,
                    route: operation.route,
                    time: operation.time,
                    type: operation.type,
                    missingCount: missing,
                    reason: "Stop distribution has not been entered for this operation.",
                });
            }

            return;
        }

        let missingCount = 0;
        const reasons = new Set();

        requestedByStop.forEach(({ stop, requested }) => {
            let remaining =
                requested - getAssignedCountAtStop(operation, stop.id);

            while (remaining > 0) {
                const best = findBestCandidate(operation, stop, reasons);

                if (!best) {
                    missingCount += remaining;
                    break;
                }

                operation.vehicleAssignments[best.vehicle.id] = Number(stop.id);
                operation.driverAssignments[best.vehicle.id] = Number(
                    best.driverOption.driver.id
                );

                const previousLocation = best.previousTrip
                    ? best.previousTrip.endsAt === "company"
                        ? "Company"
                        : best.previousTrip.stopName
                    : "Company";

                proposedAllocations.push({
                    operationId: operation.id,
                    operationType: operation.type,
                    operationRoute: operation.route,
                    operationTime: operation.time,
                    vehicleId: Number(best.vehicle.id),
                    vehicleNumber: best.vehicle.number,
                    vehicleType: best.vehicle.type,
                    stopId: Number(stop.id),
                    stopName: stop.name,
                    driverId: Number(best.driverOption.driver.id),
                    driverName: best.driverOption.driver.name,
                    shiftName: best.driverOption.shiftName,
                    idleBufferMinutes: best.idleBuffer ?? 0,
                    previousLocation,
                    reason: best.previousTrip
                        ? `Vehicle ${best.vehicle.number} comes from ${previousLocation} (after ${best.previousTrip.type}) with driver ${best.driverOption.driver.name}.`
                        : `Vehicle ${best.vehicle.number} starts from the company with driver ${best.driverOption.driver.name}.`,
                });

                remaining--;
            }
        });

        if (missingCount > 0) {
            unfilledRequirements.push({
                operationId: operation.id,
                route: operation.route,
                time: operation.time,
                type: operation.type,
                missingCount,
                reason:
                    reasons.size > 0
                        ? Array.from(reasons).join(" ")
                        : "No available vehicle can take this trip without a conflict.",
            });
        }
    });

    const uniqueVehiclesUsed = new Set(
        proposedAllocations.map((item) => item.vehicleId)
    ).size;

    return {
        date,
        totalProposed: proposedAllocations.length,
        proposedAllocations,
        unfilledRequirements,
        uniqueVehiclesUsed,
        totalActiveVehicles: activeVehicles.length,
        isFullyAllocated: unfilledRequirements.length === 0,
    };
}

/**
 * Apply the approved allocations to the operations state.
 * Saves the vehicle, stop, and the selected driver for each allocation.
 */
export function applyAllocationsToOperations(operations, proposedAllocations) {
    const byOperation = new Map();

    proposedAllocations.forEach((allocation) => {
        const list = byOperation.get(allocation.operationId) || [];
        list.push(allocation);
        byOperation.set(allocation.operationId, list);
    });

    return operations.map((operation) => {
        const allocations = byOperation.get(operation.id);
        if (!allocations) return operation;

        const vehicleAssignments = { ...(operation.vehicleAssignments || {}) };
        const driverAssignments = { ...(operation.driverAssignments || {}) };
        const stopAllocations = (operation.stopAllocations || []).map(
            (item) => ({ ...item })
        );

        allocations.forEach((allocation) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    vehicleAssignments,
                    String(allocation.vehicleId)
                )
            ) {
                return;
            }

            vehicleAssignments[allocation.vehicleId] = Number(allocation.stopId);
            driverAssignments[allocation.vehicleId] = Number(allocation.driverId);

            const entry = stopAllocations.find(
                (item) => Number(item.stopId) === Number(allocation.stopId)
            );

            if (entry) {
                entry.count = (entry.count || 0) + 1;
            } else {
                stopAllocations.push({
                    stopId: Number(allocation.stopId),
                    stopName: allocation.stopName,
                    count: 1,
                });
            }
        });

        const assignedIds = Object.keys(vehicleAssignments).map(Number);
        const required = Number(operation.vehiclesCount) || 0;

        let status = "Pending";
        if (assignedIds.length >= required && required > 0) {
            status = "Distributed";
        } else if (assignedIds.length > 0) {
            status = "Partially Distributed";
        }

        return {
            ...operation,
            vehicleAssignments,
            driverAssignments,
            assignedVehicles: assignedIds,
            stopAllocations,
            status,
        };
    });
}