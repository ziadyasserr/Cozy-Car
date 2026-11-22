import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./features/dashboard/pages/Dashboard";
import Fleet from "./features/fleet/pages/Fleet";
import Drivers from "./features/drivers/pages/Drivers";
import RoutesPage from "./features/routes/pages/Routes";
import Operations from "./features/operations/pages/Operations";
import { FleetProvider } from "./context/FleetContext";
import { OperationsProvider } from "./context/OperationsContext";
import VehicleTimeline from "./features/timeline/pages/VehicleTimeline";
import { TravelTimesProvider } from "./context/TravelTimesContext";
import TravelTimes from "./features/routes/pages/TravelTimes";
import Allocation from "./features/allocation/pages/Allocation";
import { DriverAssignmentsProvider } from "./context/DriverAssignmentsContext";
import DriverAssignments from "./features/drivers/pages/DriverAssignments";
import { DriversProvider } from "./context/DriversContext";
import { RoutesProvider } from "./context/RoutesContext";
import Reports from "./features/reports/pages/Reports";
import Settings from "./features/settings/pages/Settings";
import { GPSProvider } from "./context/GPSContext";
import LiveMap from "./features/livemap/pages/LiveMap";

function AppProviders({ children }) {
  return (
    <RoutesProvider>
      <FleetProvider>
        <DriversProvider>
          <OperationsProvider>
            <TravelTimesProvider>
              <DriverAssignmentsProvider>
                <GPSProvider>
                  {children}
                </GPSProvider>
              </DriverAssignmentsProvider>
            </TravelTimesProvider>
          </OperationsProvider>
        </DriversProvider>
      </FleetProvider>
    </RoutesProvider>
  );
}

function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/operations" element={<Operations />} />
            <Route path="/allocation" element={<Allocation />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/fleet" element={<Fleet />} />
            <Route path="/timeline" element={<VehicleTimeline />} />
            <Route path="/travel-times" element={<TravelTimes />} />
            <Route path="/live-map" element={<LiveMap />} />
            <Route
              path="/driver-assignments"
              element={<DriverAssignments />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}

export default App;