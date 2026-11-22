
const MINUTES_PER_DAY = 24 * 60;
const MILLISECONDS_PER_DAY = 86400000;

// Convert HH:mm to minutes from midnight
export function timeToMinutes(time) {
    if (!time || typeof time !== "string") return null;

    const [hours, minutes] = time.split(":").map(Number);

    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    return hours * 60 + minutes;
}

// Convert HH:mm to 12-hour format for display (e.g. 8:00 AM or 8:00)
export function formatTime12Hour(time, withPeriod = false) {
    const totalMinutes = timeToMinutes(time);

    if (totalMinutes === null) return "";

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;

    const formattedTime = `${displayHours}:${String(minutes).padStart(2, "0")}`;
    return withPeriod ? `${formattedTime} ${period}` : formattedTime;
}

// Convert minutes from midnight to HH:mm
export function minutesToTime(totalMinutes) {
    if (!Number.isFinite(Number(totalMinutes))) return null;

    const normalized =
        ((Number(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
        MINUTES_PER_DAY;

    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Add duration to a time
export function addMinutes(time, duration) {
    const start = timeToMinutes(time);
    const numericDuration = Number(duration);

    if (
        start === null ||
        !Number.isFinite(numericDuration) ||
        numericDuration < 0
    ) {
        return null;
    }

    return minutesToTime(start + numericDuration);
}

// Calculate difference between two times
export function getTimeDifference(startTime, endTime) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    if (start === null || end === null) return null;

    return (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

// Convert date and time into absolute minutes
export function dateTimeToMinutes(date, time) {
    const minutes = timeToMinutes(time);

    if (
        minutes === null ||
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
        return null;
    }

    const timestamp = Date.parse(`${date}T00:00:00Z`);

    if (!Number.isFinite(timestamp)) return null;

    const dateObject = new Date(timestamp);

    if (dateObject.toISOString().slice(0, 10) !== date) {
        return null;
    }

    const days = Math.floor(timestamp / MILLISECONDS_PER_DAY);

    return days * MINUTES_PER_DAY + minutes;
}

// Add minutes to a date and time
export function addMinutesToDateTime(date, time, duration) {
    const start = dateTimeToMinutes(date, time);
    const numericDuration = Number(duration);

    if (
        start === null ||
        !Number.isFinite(numericDuration) ||
        numericDuration < 0
    ) {
        return null;
    }

    const totalMinutes = start + numericDuration;
    const totalDays = Math.floor(totalMinutes / MINUTES_PER_DAY);
    const minutesOfDay = totalMinutes - totalDays * MINUTES_PER_DAY;

    const dateObject = new Date(totalDays * MILLISECONDS_PER_DAY);

    const year = dateObject.getUTCFullYear();
    const month = String(dateObject.getUTCMonth() + 1).padStart(2, "0");
    const day = String(dateObject.getUTCDate()).padStart(2, "0");

    return {
        date: `${year}-${month}-${day}`,
        time: minutesToTime(minutesOfDay),
    };
}

// Calculate difference between two date-time values
export function getDateTimeDifference(
    startDate,
    startTime,
    endDate,
    endTime
) {
    const start = dateTimeToMinutes(startDate, startTime);
    const end = dateTimeToMinutes(endDate, endTime);

    if (start === null || end === null) return null;

    return end - start;
}

// Compare two date-time values
export function isDateTimeBefore(
    firstDate,
    firstTime,
    secondDate,
    secondTime
) {
    const first = dateTimeToMinutes(firstDate, firstTime);
    const second = dateTimeToMinutes(secondDate, secondTime);

    if (first === null || second === null) return null;

    return first < second;
}
