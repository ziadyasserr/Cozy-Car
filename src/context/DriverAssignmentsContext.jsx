
import { createContext, useContext } from "react";
import { initialDriverAssignments } from "../data/driverAssignments";
import useLocalStorage from "../hooks/useLocalStorage";

const DriverAssignmentsContext = createContext(null);

export function DriverAssignmentsProvider({ children }) {
    const [driverAssignments, setDriverAssignments] = useLocalStorage(
        "cozy_driver_assignments",
        initialDriverAssignments
    );

    const value = {
        driverAssignments,
        setDriverAssignments,
    };

    return (
        <DriverAssignmentsContext.Provider value={value}>
            {children}
        </DriverAssignmentsContext.Provider>
    );
}

export function useDriverAssignments() {
    const context = useContext(DriverAssignmentsContext);

    if (!context) {
        throw new Error(
            "useDriverAssignments must be used inside DriverAssignmentsProvider"
        );
    }

    return context;
}
