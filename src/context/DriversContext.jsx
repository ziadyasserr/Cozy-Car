
import { createContext, useContext } from "react";
import { initialDrivers } from "../data/drivers";
import useLocalStorage from "../hooks/useLocalStorage";

const DriversContext = createContext(null);

export function DriversProvider({ children }) {
    const [drivers, setDrivers] = useLocalStorage("cozy_drivers", initialDrivers);

    return (
        <DriversContext.Provider value={{ drivers, setDrivers }}>
            {children}
        </DriversContext.Provider>
    );
}

export function useDrivers() {
    const context = useContext(DriversContext);

    if (!context) {
        throw new Error("useDrivers must be used inside DriversProvider");
    }

    return context;
}
