import { createContext, useContext } from "react";
import { initialOperations } from "../data/operations";
import useLocalStorage from "../hooks/useLocalStorage";

const OperationsContext = createContext(null);

export function OperationsProvider({ children }) {
    const [operations, setOperations] = useLocalStorage("cozy_operations", initialOperations);

    const value = {
        operations,
        setOperations,
    };

    return (
        <OperationsContext.Provider value={value}>
            {children}
        </OperationsContext.Provider>
    );
}

export function useOperations() {
    const context = useContext(OperationsContext);

    if (!context) {
        throw new Error("useOperations must be used inside OperationsProvider");
    }

    return context;
}