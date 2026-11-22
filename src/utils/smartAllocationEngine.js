/**
 * Cozy Car - Smart Auto-Allocation Engine
 * 
 * Intelligently determines:
 * 1. Which vehicle should handle each operation
 * 2. Which driver is available for that vehicle (Fixed Vehicle Driver / Shift)
 * 3. Whether the vehicle can reach the destination on time (via Travel Times)
 * 4. Whether the driver's shift covers the trip duration
 * 5. Minimizes unnecessary vehicle usage, idle buffer, and deadhead mileage
 */

import { addMinutesToDateTime, dateTimeToMinutes } from "./timeUtils.js";
import { getRequiredTransferTime } from "./allocationUtils.js";

function toAbsoluteMinutes(date, time) {
    return dateTimeToMinutes(date, time);
}

function getShiftInterval(driver, assignment, date) {
    // 1. If explicit assignment exists
    if (assignment && assignment.startTime && assignment.endTime) {
        const start = toAbsoluteMinutes(assignment.date || date, assignment.startTime);
        let end = toAbsoluteMinutes(assignment.date || date, assignment.endTime);
        if (start !== null && end !== null) {
            if (end <= start) end += 1440; // Spans midnight
            return { start, end, shiftName: assignment.shift || "Custom Shift" };
        }
    }

    // 2. Fixed Vehicle Driver standard shifts
    if (driver && driver.fixedShift) {
        if (driver.fixedShift === "12:00-00:00") {
            const start = toAbsoluteMinutes(date, "12:00");
            const end = toAbsoluteMinutes(date, "23:59") + 1;
            return { start, end, shiftName: "Second Shift (12:00 PM - 12:00 AM)" };
        } else {
            const start = toAbsoluteMinutes(date, "00:00");
            const end = toAbsoluteMinutes(date, "12:00");
            return { start, end, shiftName: "First Shift (12:00 AM - 12:00 PM)" };
        }
    }

    // Default full day coverage if not strictly specified
    return {
        start: toAbsoluteMinutes(date, "00:00"),
        end: toAbsoluteMinutes(date, "23:59") + 1,
        shiftName: "Standard Shift"
    };
}

/**
 * Run smart allocation across all pending operations for a given date
 */
export function runSmartAllocation({
    date,
    operations = [],
    vehicles = [],
    dailyAvailability = {},
    drivers = [],
    driverAssignments = [],
    travelTimes = [],
    routes = []
}) {
    const todayAvailability = dailyAvailability[date] || {};

    // 1. Gather active vehicles available today
    const activeVehicles = vehicles.filter((v) => {
        if (v.status !== "Active") return false;
        // If availability is explicitly set to Unavailable, exclude
        if (todayAvailability[v.id] === "Unavailable") return false;
        return true;
    });

    // 2. Map vehicle -> permanent driver & shift info
    const vehicleDriverMap = {};
    activeVehicles.forEach((vehicle) => {
        // Daily assignment check first
        const dailyAssign = driverAssignments.find(
            (da) => Number(da.vehicleId) === Number(vehicle.id) && da.date === date
        );

        let driver = null;
        if (dailyAssign) {
            driver = drivers.find((d) => Number(d.id) === Number(dailyAssign.driverId) && d.status === "Active");
        }

        // Fallback: Fixed Vehicle Driver permanently assigned
        if (!driver) {
            driver = drivers.find(
                (d) => d.status === "Active" &&
                       d.driverType === "Fixed Vehicle Driver" &&
                       Number(d.vehicleId) === Number(vehicle.id)
            );
        }

        const shiftInfo = getShiftInterval(driver, dailyAssign, date);

        vehicleDriverMap[vehicle.id] = {
            vehicle,
            driver,
            driverName: driver ? driver.name : "Unassigned Driver",
            hasDriver: !!driver,
            shiftInfo,
        };
    });

    // 3. Find operations on this date that require allocation
    const targetOps = operations
        .filter((op) => op.date === date)
        .sort((a, b) => {
            // Sort chronologically by time
            return (a.time || "").localeCompare(b.time || "");
        });

    // Track vehicle trip schedules: vehicleId -> array of { start, end, stopId, stopName, type, routeName }
    const vehicleTripSchedules = {};
    activeVehicles.forEach((v) => {
        vehicleTripSchedules[v.id] = [];
    });

    // Pre-populate with already assigned operations for this vehicle
    targetOps.forEach((op) => {
        const assignments = op.vehicleAssignments || {};
        const route = routes.find((r) => r.name === op.route);
        if (!route) return;

        Object.entries(assignments).forEach(([vId, stopId]) => {
            const stop = route.stops.find((s) => Number(s.id) === Number(stopId));
            if (!stop || !vehicleTripSchedules[vId]) return;

            const scheduledMinutes = toAbsoluteMinutes(op.date, op.time);
            const duration = Number(op.type === "Departure" ? stop.departure : stop.attendance) || 45;
            
            let start, end;
            if (op.type === "Departure") {
                start = scheduledMinutes;
                end = start + duration;
            } else {
                end = scheduledMinutes;
                start = end - duration;
            }

            vehicleTripSchedules[vId].push({
                operationId: op.id,
                type: op.type,
                routeName: route.name,
                stopId: Number(stop.id),
                stopName: stop.name,
                start,
                end,
                duration,
                stopToCompanyDuration: Number(stop.departure) || 45
            });
        });
    });

    // Sort existing trips chronologically
    Object.keys(vehicleTripSchedules).forEach((vId) => {
        vehicleTripSchedules[vId].sort((a, b) => a.start - b.start);
    });

    const proposedAllocations = [];
    const unfilledRequirements = [];

    // 4. Process each operation requiring vehicles
    targetOps.forEach((op) => {
        const route = routes.find((r) => r.name === op.route);
        if (!route || !route.stops || route.stops.length === 0) return;

        const currentAssignments = { ...(op.vehicleAssignments || {}) };
        const assignedVehicleIds = new Set(Object.keys(currentAssignments).map(Number));
        const neededCount = Number(op.vehiclesCount) || 1;
        const alreadyAssignedCount = assignedVehicleIds.size;
        const remainingToAllocate = Math.max(0, neededCount - alreadyAssignedCount);

        if (remainingToAllocate === 0) {
            return; // Fully allocated already
        }

        // Determine target stop (from requestedStopAllocations or first available stop)
        let targetStop = route.stops[0];
        if (op.requestedStopAllocations) {
            const stopEntry = Object.entries(op.requestedStopAllocations).find(([, count]) => Number(count) > 0);
            if (stopEntry) {
                const found = route.stops.find((s) => Number(s.id) === Number(stopEntry[0]));
                if (found) targetStop = found;
            }
        }

        const scheduledMinutes = toAbsoluteMinutes(op.date, op.time);
        const duration = Number(op.type === "Departure" ? targetStop.departure : targetStop.attendance) || 45;

        let opStart, opEnd;
        if (op.type === "Departure") {
            opStart = scheduledMinutes;
            opEnd = opStart + duration;
        } else {
            opEnd = scheduledMinutes;
            opStart = opEnd - duration;
        }

        let allocatedForThisOp = 0;

        // Score every candidate vehicle to find the optimal match
        const candidateScores = [];

        activeVehicles.forEach((vehicle) => {
            const vId = Number(vehicle.id);
            if (assignedVehicleIds.has(vId)) return; // Already in this op

            const driverData = vehicleDriverMap[vId];
            if (!driverData) return;

            // Check Driver Shift Window
            const shift = driverData.shiftInfo;
            if (shift) {
                // Trip must be covered within driver shift
                if (opStart < shift.start || opEnd > shift.end) {
                    return; // Driver off duty
                }
            }

            // Check Vehicle Schedule for Conflicts
            const existingTrips = vehicleTripSchedules[vId] || [];
            let hasConflict = false;
            let idleBufferBefore = 9999;
            let transferDurationNeeded = 0;
            let prevStopName = "Company Base";

            // Find immediate previous trip and immediate next trip
            let prevTrip = null;
            let nextTrip = null;

            for (let i = 0; i < existingTrips.length; i++) {
                const trip = existingTrips[i];
                if (trip.end <= opStart) {
                    prevTrip = trip;
                } else if (trip.start >= opEnd && !nextTrip) {
                    nextTrip = trip;
                    break;
                } else {
                    // Overlaps directly
                    hasConflict = true;
                    break;
                }
            }

            if (hasConflict) return;

            // Check travel time from prevTrip to this operation
            if (prevTrip) {
                prevStopName = prevTrip.stopName;
                const reqTransfer = getRequiredTransferTime(
                    prevTrip,
                    { type: op.type, stopId: targetStop.id },
                    travelTimes
                );

                transferDurationNeeded = reqTransfer ?? 30; // fallback to 30 min if unmapped
                const availableGap = opStart - prevTrip.end;

                if (availableGap < transferDurationNeeded) {
                    return; // Can't reach in time!
                }
                idleBufferBefore = availableGap - transferDurationNeeded;
            }

            // Check travel time from this operation to nextTrip
            if (nextTrip) {
                const currentAsTrip = {
                    type: op.type,
                    stopId: targetStop.id,
                    stopToCompanyDuration: Number(targetStop.departure) || 45
                };
                const reqTransferToNext = getRequiredTransferTime(
                    currentAsTrip,
                    nextTrip,
                    travelTimes
                );
                const nextTransferDuration = reqTransferToNext ?? 30;
                const availableGapToNext = nextTrip.start - opEnd;

                if (availableGapToNext < nextTransferDuration) {
                    return; // Can't reach next trip in time!
                }
            }

            // Scoring:
            // 1. Prefer vehicles with active permanent driver
            // 2. Prefer moderate idle buffer (15-60 mins) to minimize deadhead/waiting
            // 3. Prefer vehicles already stationed nearby or at company base
            let score = 100;
            if (driverData.hasDriver) score += 50;
            if (idleBufferBefore <= 60) score += 30;
            else if (idleBufferBefore > 180) score -= 20;

            candidateScores.push({
                vehicle,
                driverData,
                score,
                idleBufferBefore,
                transferDurationNeeded,
                prevStopName,
                opStart,
                opEnd,
                targetStop
            });
        });

        // Sort candidates best score first
        candidateScores.sort((a, b) => b.score - a.score);

        // Assign top candidates up to remaining needed count
        for (let i = 0; i < candidateScores.length && allocatedForThisOp < remainingToAllocate; i++) {
            const candidate = candidateScores[i];
            const vId = Number(candidate.vehicle.id);

            proposedAllocations.push({
                operationId: op.id,
                operationType: op.type,
                operationRoute: op.route,
                operationTime: op.time,
                vehicleId: vId,
                vehicleNumber: candidate.vehicle.number,
                vehicleType: candidate.vehicle.type,
                stopId: candidate.targetStop.id,
                stopName: candidate.targetStop.name,
                driverName: candidate.driverData.driverName,
                shiftName: candidate.driverData.shiftInfo.shiftName,
                idleBufferMinutes: candidate.idleBufferBefore === 9999 ? 0 : candidate.idleBufferBefore,
                transferDurationMinutes: candidate.transferDurationNeeded,
                previousLocation: candidate.prevStopName,
                reason: `Vehicle ${candidate.vehicle.number} with driver ${candidate.driverData.driverName} is on shift. Feasible transfer with ${candidate.idleBufferBefore === 9999 ? 'ready start' : candidate.idleBufferBefore + 'm idle buffer'}.`
            });

            // Update in-memory schedule for this vehicle
            vehicleTripSchedules[vId].push({
                operationId: op.id,
                type: op.type,
                routeName: op.route,
                stopId: Number(candidate.targetStop.id),
                stopName: candidate.targetStop.name,
                start: candidate.opStart,
                end: candidate.opEnd,
                duration,
                stopToCompanyDuration: Number(candidate.targetStop.departure) || 45
            });
            vehicleTripSchedules[vId].sort((a, b) => a.start - b.start);

            allocatedForThisOp++;
        }

        if (allocatedForThisOp < remainingToAllocate) {
            unfilledRequirements.push({
                operationId: op.id,
                route: op.route,
                time: op.time,
                type: op.type,
                missingCount: remainingToAllocate - allocatedForThisOp,
                reason: "Insufficient available vehicles or active drivers covering this time slot."
            });
        }
    });

    const uniqueVehiclesUsed = new Set(proposedAllocations.map((a) => a.vehicleId)).size;

    return {
        date,
        totalProposed: proposedAllocations.length,
        proposedAllocations,
        unfilledRequirements,
        uniqueVehiclesUsed,
        totalActiveVehicles: activeVehicles.length,
        isFullyAllocated: unfilledRequirements.length === 0
    };
}

/**
 * Apply proposed allocations to operations state
 */
export function applyAllocationsToOperations(operations, proposedAllocations) {
    const updatedOps = [...operations];

    proposedAllocations.forEach((alloc) => {
        const opIndex = updatedOps.findIndex((op) => op.id === alloc.operationId);
        if (opIndex < 0) return;

        const op = updatedOps[opIndex];
        const newVehicleAssignments = { ...(op.vehicleAssignments || {}) };
        newVehicleAssignments[alloc.vehicleId] = alloc.stopId;

        const assignedIds = Object.keys(newVehicleAssignments).map(Number);
        let status = op.status;
        if (assignedIds.length >= op.vehiclesCount) {
            status = "Distributed";
        } else if (assignedIds.length > 0) {
            status = "Partially Distributed";
        }

        // Update stop allocations
        const stopAllocations = (op.stopAllocations || []).map((sa) => {
            if (Number(sa.stopId) === Number(alloc.stopId)) {
                return { ...sa, count: (sa.count || 0) + 1 };
            }
            return sa;
        });

        updatedOps[opIndex] = {
            ...op,
            vehicleAssignments: newVehicleAssignments,
            assignedVehicles: assignedIds,
            stopAllocations,
            status
        };
    });

    return updatedOps;
}
