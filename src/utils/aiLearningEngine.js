/**
 * Cozy Car - AI Operating & Demand Learning Engine
 * 
 * Learns from historical operating data and daily scheduling decisions.
 * Predicts vehicle requirements, identifies recurring patterns, detects
 * capacity bottlenecks, and provides explainable recommendations.
 */

// Local storage key for persistent operational learning metrics
const LEARNING_STORAGE_KEY = "cozy_historical_demand_patterns";

/**
 * Standard recurring slot rules:
 * - Attendance: Moassassa (:15), Maadi (:30), Rehab (:55), Sherouk (:00)
 * - Departure: Operating window 4:30 PM (16:30) to 11:30 PM (23:30)
 */
export const ATTENDANCE_RULES = [
    {
        locationKey: "Moassassa",
        displayName: "Moassassa (المؤسسة)",
        arabicName: "المؤسسة",
        minute: 15,
        defaultRouteKeywords: ["مؤسسة", "المؤسسة", "moassassa"],
    },
    {
        locationKey: "Maadi",
        displayName: "Maadi (المعادي)",
        arabicName: "المعادي",
        minute: 30,
        defaultRouteKeywords: ["معادي", "المعادي", "maadi"],
    },
    {
        locationKey: "Rehab",
        displayName: "Rehab (الرحاب)",
        arabicName: "الرحاب",
        minute: 55,
        defaultRouteKeywords: ["رحاب", "الرحاب", "rehab"],
    },
    {
        locationKey: "Sherouk",
        displayName: "Sherouk / Mostaqbal (الشروق / المستقبل)",
        arabicName: "المستقبل",
        minute: 0,
        defaultRouteKeywords: ["شروق", "الشروق", "مستقبل", "المستقبل", "sherouk", "mostaqbal"],
    },
];

// Attendance operational hours: 05:00 to 22:00
export const ATTENDANCE_HOURS = Array.from({ length: 18 }, (_, i) => i + 5);

// Departure operational window: 4:30 PM (16:30) to 11:30 PM (23:30)
export const DEPARTURE_SLOT_TIMES = [
    "16:30", "17:00", "17:30", "18:00", "18:30",
    "19:00", "19:30", "20:00", "20:30", "21:00",
    "21:30", "22:00", "22:30", "23:00", "23:30"
];

/**
 * Retrieve historical adjustment logs from localStorage
 */
export function getStoredLearningData() {
    try {
        const raw = localStorage.getItem(LEARNING_STORAGE_KEY);
        if (!raw) return { decisions: [], slotStats: {} };
        return JSON.parse(raw);
    } catch {
        return { decisions: [], slotStats: {} };
    }
}

/**
 * Record a scheduling decision to continuously train the system
 */
export function recordSchedulingDecision({
    date,
    type,
    route,
    time,
    vehiclesCount,
    wasManualOverride = false
}) {
    try {
        const store = getStoredLearningData();
        const key = `${type}_${route}_${time}`;
        
        const newDecision = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            date,
            type,
            route,
            time,
            vehiclesCount: Number(vehiclesCount),
            wasManualOverride
        };

        // Keep last 500 decisions
        store.decisions = [newDecision, ...(store.decisions || [])].slice(0, 500);

        // Update slot aggregated stats
        if (!store.slotStats[key]) {
            store.slotStats[key] = {
                history: [],
                lastCount: Number(vehiclesCount),
                updatedAt: new Date().toISOString()
            };
        }
        
        store.slotStats[key].history.push({
            date,
            count: Number(vehiclesCount),
            at: new Date().toISOString()
        });
        
        // Retain only last 30 entries per slot
        if (store.slotStats[key].history.length > 30) {
            store.slotStats[key].history.shift();
        }
        store.slotStats[key].lastCount = Number(vehiclesCount);
        store.slotStats[key].updatedAt = new Date().toISOString();

        localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
        console.warn("Could not save learning decision to localStorage:", e);
    }
}

/**
 * Analyze past operations to build a demand recommendation for a slot.
 *
 * It uses:
 * 1. Historical operations recorded in OperationsContext
 * 2. Stored user adjustment decisions
 * 3. Recent demand trend (is user increasing or decreasing vehicles?)
 */
export function getSlotRecommendation({
    locationKey,
    routeName,
    time,
    type,
    targetDate,
    allOperations = []
}) {
    // 1. Gather all past operations for this route, time, and type (excluding future dates)
    const matchingHistoricalOps = allOperations.filter((op) => {
        const matchesRoute = op.route === routeName || 
            (locationKey && op.route && op.route.toLowerCase().includes(locationKey.toLowerCase()));
        const matchesType = op.type === type;
        const matchesTime = op.time === time;
        const isPastOrCurrent = !targetDate || op.date <= targetDate;
        return matchesRoute && matchesType && matchesTime && isPastOrCurrent && Number(op.vehiclesCount) > 0;
    });

    // Also check stored decision history
    const learningData = getStoredLearningData();
    const slotKey = `${type}_${routeName}_${time}`;
    const storedHistory = learningData.slotStats?.[slotKey]?.history || [];

    // Combine distinct historical observation points (date -> count)
    const historicalCountsByDate = {};
    matchingHistoricalOps.forEach((op) => {
        historicalCountsByDate[op.date] = Number(op.vehiclesCount);
    });
    storedHistory.forEach((item) => {
        if (!historicalCountsByDate[item.date]) {
            historicalCountsByDate[item.date] = item.count;
        }
    });

    const entries = Object.entries(historicalCountsByDate).sort(([d1], [d2]) => d1.localeCompare(d2));
    const sampleCount = entries.length;

    // Case 1: No sufficient historical data yet
    if (sampleCount === 0) {
        // Honest baseline recommendation: 1 vehicle for standard service
        return {
            recommendedCount: 1,
            confidence: "Initial",
            confidencePercent: 20,
            trend: "Baseline",
            explanation: "Initial baseline: 1 vehicle. System will learn your recurring patterns as you operate.",
            sampleCount: 0,
            isLearned: false,
        };
    }

    const counts = entries.map(([, count]) => count);
    
    // Weighted Average: More recent operating dates receive higher weight
    let weightedSum = 0;
    let weightTotal = 0;
    counts.forEach((count, idx) => {
        const weight = idx + 1; // 1, 2, 3 ... higher weight to recent
        weightedSum += count * weight;
        weightTotal += weight;
    });

    const weightedAvg = weightedSum / weightTotal;
    const roundedRecommendation = Math.max(1, Math.round(weightedAvg));

    // Trend detection (comparing recent decisions vs earlier)
    let trend = "Stable";
    let trendDesc = "Demand pattern is stable.";
    if (counts.length >= 2) {
        const recent = counts[counts.length - 1];
        const previous = counts[counts.length - 2];
        if (recent > previous) {
            trend = "Increasing";
            trendDesc = `Demand trend is increasing (+${recent - previous} vehicles recently).`;
        } else if (recent < previous) {
            trend = "Decreasing";
            trendDesc = `Demand trend is decreasing (-${previous - recent} vehicles recently).`;
        }
    }

    // Confidence level calculation
    let confidence = "Medium";
    let confidencePercent = 60;
    if (sampleCount >= 4) {
        confidence = "High";
        confidencePercent = Math.min(95, 75 + sampleCount * 4);
    } else if (sampleCount <= 1) {
        confidence = "Preliminary";
        confidencePercent = 40;
    }

    return {
        recommendedCount: roundedRecommendation,
        confidence,
        confidencePercent,
        trend,
        explanation: `Learned from ${sampleCount} previous operating ${sampleCount === 1 ? 'day' : 'days'} (avg: ${weightedAvg.toFixed(1)}). ${trendDesc}`,
        sampleCount,
        isLearned: true,
        lastObservedCount: counts[counts.length - 1]
    };
}

/**
 * Capacity and Bottleneck Checker:
 * Evaluates whether total vehicle requirements for a given date exceed available fleet.
 */
export function analyzeScheduleHealth({
    date,
    operations = [],
    vehicles = [],
    dailyAvailability = {},
    drivers = [],
    driverAssignments = []
}) {
    const todayAvailability = dailyAvailability[date] || {};
    
    // Active vehicles available on this date
    const availableVehiclesCount = vehicles.filter(
        (v) => v.status === "Active" && todayAvailability[v.id] === "Available"
    ).length;

    const totalActiveFleet = vehicles.filter((v) => v.status === "Active").length;
    const effectiveCapacity = availableVehiclesCount > 0 ? availableVehiclesCount : totalActiveFleet;

    // Filter operations on this date
    const dateOps = operations.filter((op) => op.date === date);

    // Group vehicle requirements by hour to detect peak concurrent vehicle demand
    const hourlyDemand = {};
    let totalVehiclesDemanded = 0;

    dateOps.forEach((op) => {
        const hour = op.time ? op.time.split(":")[0] : "00";
        const count = Number(op.vehiclesCount) || 0;
        hourlyDemand[hour] = (hourlyDemand[hour] || 0) + count;
        totalVehiclesDemanded += count;
    });

    let peakHour = null;
    let peakDemand = 0;
    const hourlyBottlenecks = [];

    Object.entries(hourlyDemand).forEach(([hour, demand]) => {
        if (demand > peakDemand) {
            peakDemand = demand;
            peakHour = hour;
        }
        if (demand > effectiveCapacity) {
            hourlyBottlenecks.push({
                hour: `${hour}:00`,
                demand,
                capacity: effectiveCapacity,
                deficit: demand - effectiveCapacity
            });
        }
    });

    // Active drivers count
    const activeDrivers = drivers.filter((d) => d.status === "Active").length;

    // Check unallocated operations
    const unallocatedOps = dateOps.filter(
        (op) => !op.vehicleAssignments || Object.keys(op.vehicleAssignments).length === 0
    );

    const hasShortage = hourlyBottlenecks.length > 0;
    const isOverDriverLimit = peakDemand > activeDrivers;

    let healthScore = 100;
    if (hasShortage) healthScore -= 35;
    if (isOverDriverLimit) healthScore -= 25;
    if (unallocatedOps.length > 0) healthScore -= Math.min(20, unallocatedOps.length * 5);
    healthScore = Math.max(10, healthScore);

    return {
        date,
        totalOperations: dateOps.length,
        totalVehiclesDemanded,
        effectiveCapacity,
        peakDemand,
        peakHour: peakHour ? `${peakHour}:00` : "--",
        hourlyDemand,
        hourlyBottlenecks,
        hasShortage,
        isOverDriverLimit,
        activeDrivers,
        unallocatedOpsCount: unallocatedOps.length,
        healthScore,
        status: hasShortage ? "Shortage Detected" : (healthScore > 80 ? "Optimal" : "Attention Needed")
    };
}
