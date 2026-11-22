/**
 * Google Maps Routes API Utility — Cozy Car
 *
 * Uses the Distance Matrix and Routes API to compute:
 *   - Real-road distance between two points
 *   - Actual traffic-aware ETA (not dead-reckoning)
 *
 * API key comes from VITE_GOOGLE_MAPS_API_KEY environment variable.
 */

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/**
 * Compute the driving distance (metres) and ETA (seconds) between
 * an origin and destination using the Google Distance Matrix API.
 *
 * Returns null if the API key is missing or the request fails.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ distanceMetres: number, durationSeconds: number, durationText: string, distanceText: string } | null>}
 */
export async function computeETA(origin, destination) {
    if (!MAPS_API_KEY) {
        console.warn("[Maps] VITE_GOOGLE_MAPS_API_KEY is not set. ETA unavailable.");
        return null;
    }

    if (
        !origin?.lat || !origin?.lng ||
        !destination?.lat || !destination?.lng
    ) {
        return null;
    }

    const params = new URLSearchParams({
        origins:      `${origin.lat},${origin.lng}`,
        destinations: `${destination.lat},${destination.lng}`,
        mode:         "driving",
        departure_time: "now",        // Enables live traffic data
        traffic_model:  "best_guess",
        key:          MAPS_API_KEY,
    });

    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== "OK") {
            console.warn("[Maps] Distance Matrix status:", data.status, data.error_message);
            return null;
        }

        const element = data.rows?.[0]?.elements?.[0];
        if (!element || element.status !== "OK") {
            return null;
        }

        // If traffic-aware duration_in_traffic is available, prefer it
        const duration = element.duration_in_traffic || element.duration;

        return {
            distanceMetres:  element.distance.value,
            distanceText:    element.distance.text,
            durationSeconds: duration.value,
            durationText:    duration.text,
        };
    } catch (err) {
        console.error("[Maps] ETA computation failed:", err);
        return null;
    }
}

/**
 * Compute ETA from a vehicle's current GPS position to a named stop.
 * This is the main integration point between GPS tracking and Smart Allocation.
 *
 * @param {{ lat: number, lng: number }} vehiclePosition  Current GPS fix
 * @param {{ lat: number, lng: number }} stopPosition     Target stop coordinates
 * @param {string} vehicleLabel  Used for logging
 * @returns {Promise<ETAResult | null>}
 */
export async function getVehicleETA(vehiclePosition, stopPosition, vehicleLabel = "") {
    const result = await computeETA(vehiclePosition, stopPosition);
    if (!result) return null;

    return {
        ...result,
        vehicleLabel,
        computedAt: new Date().toISOString(),
        arrivalTime: new Date(Date.now() + result.durationSeconds * 1000).toISOString(),
    };
}

/**
 * Load the Google Maps JavaScript API into the page dynamically.
 * Safe to call multiple times — only injects the script once.
 *
 * @returns {Promise<void>}
 */
let _mapLoaderPromise = null;

export function loadGoogleMapsScript() {
    if (_mapLoaderPromise) return _mapLoaderPromise;

    _mapLoaderPromise = new Promise((resolve, reject) => {
        // Already loaded
        if (window.google?.maps) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=marker`;
        script.async = true;
        script.defer = true;
        script.onload  = resolve;
        script.onerror = () => reject(new Error("Failed to load Google Maps script"));
        document.head.appendChild(script);
    });

    return _mapLoaderPromise;
}

/**
 * Returns true if a Google Maps API key is configured.
 */
export function hasMapsApiKey() {
    return Boolean(MAPS_API_KEY) && MAPS_API_KEY !== "YOUR_GOOGLE_MAPS_API_KEY_HERE";
}
