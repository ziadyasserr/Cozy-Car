import { createContext, useContext } from "react";
import { initialTravelTimes } from "../data/travelTimes";
import useLocalStorage from "../hooks/useLocalStorage";

const TravelTimesContext = createContext(null);

export function TravelTimesProvider({ children }) {
    const [travelTimes, setTravelTimes] = useLocalStorage("cozy_travel_times", initialTravelTimes);

    return (
        <TravelTimesContext.Provider
            value={{ travelTimes, setTravelTimes }}
        >
            {children}
        </TravelTimesContext.Provider>
    );
}

export function useTravelTimes() {
    const context = useContext(TravelTimesContext);

    if (!context) {
        throw new Error(
            "useTravelTimes must be used inside TravelTimesProvider"
        );
    }

    return context;
}