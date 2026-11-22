import { createContext, useContext } from "react";
import { initialRoutes } from "../data/routes";
import useLocalStorage from "../hooks/useLocalStorage";

const RoutesContext = createContext(null);

export function RoutesProvider({ children }) {
    const [routes, setRoutes] = useLocalStorage("cozy_routes", initialRoutes);

    return (
        <RoutesContext.Provider value={{ routes, setRoutes }}>
            {children}
        </RoutesContext.Provider>
    );
}

export function useRoutes() {
    const context = useContext(RoutesContext);

    if (!context) {
        throw new Error("useRoutes must be used inside RoutesProvider");
    }

    return context;
}