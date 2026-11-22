
import { createContext, useContext } from "react";
import { initialVehicles } from "../data/vehicles";
import useLocalStorage from "../hooks/useLocalStorage";

const FleetContext = createContext(null);

export function FleetProvider({ children }) {
    const [vehicles, setVehicles] = useLocalStorage("cozy_vehicles", initialVehicles);
    const [dailyAvailability, setDailyAvailability] = useLocalStorage("cozy_daily_availability", {});

    const value = {
        vehicles,
        setVehicles,
        dailyAvailability,
        setDailyAvailability,
    };

    return (
        <FleetContext.Provider value={value}>
            {children}
        </FleetContext.Provider>
    );
}

export function useFleet() {
    const context = useContext(FleetContext);

    if (!context) {
        throw new Error("useFleet must be used inside FleetProvider");
    }

    return context;
}
