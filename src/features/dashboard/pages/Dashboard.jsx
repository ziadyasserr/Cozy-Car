import { Bus, Users, CalendarDays, ClipboardList, CheckCircle, AlertCircle } from "lucide-react";
import { useFleet } from "../../../context/FleetContext";
import { useDrivers } from "../../../context/DriversContext";
import { useOperations } from "../../../context/OperationsContext";
import StatCard from "../../../components/ui/StatCard";
import OperatingAssistant from "../../../components/common/OperatingAssistant";

function Dashboard() {
  const { vehicles, dailyAvailability } = useFleet();
  const { drivers } = useDrivers();
  const { operations } = useOperations();

  const today = new Date().toISOString().split("T")[0];
  const todayAvailability = dailyAvailability[today] || {};

  const availableVehicles = vehicles.filter(
    (v) => todayAvailability[v.id] === "Available"
  ).length;

  const unavailableVehicles = vehicles.filter(
    (v) =>
      todayAvailability[v.id] === "Unavailable" ||
      ["Maintenance", "Inactive"].includes(v.status)
  ).length;

  const activeDrivers = drivers.filter((d) => d.status === "Active").length;
  const todayOps = operations.filter((op) => op.date === today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your fleet operations today &mdash;{" "}
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}.
        </p>
      </div>

      {/* AI Operating Assistant */}
      <OperatingAssistant />

      {/* Fleet Stats */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Fleet</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Vehicles" value={vehicles.length} icon={Bus} color="blue" />
          <StatCard title="Available Today" value={availableVehicles} icon={CheckCircle} color="green" />
          <StatCard title="Unavailable Today" value={unavailableVehicles} icon={AlertCircle} color="red" />
          <StatCard
            title="Not Set Today"
            value={vehicles.length - availableVehicles - unavailableVehicles}
            icon={Bus}
            color="gray"
          />
        </div>
      </div>

      {/* People Stats */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">People</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard title="Total Drivers" value={drivers.length} icon={Users} color="purple" />
          <StatCard title="Active Drivers" value={activeDrivers} icon={Users} color="green" />
          <StatCard title="Inactive Drivers" value={drivers.length - activeDrivers} icon={Users} color="gray" />
        </div>
      </div>

      {/* Operations Stats */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Operations</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Operations" value={operations.length} icon={CalendarDays} color="blue" />
          <StatCard title="Today's Operations" value={todayOps.length} icon={CalendarDays} color="green" />
          <StatCard
            title="Attendance Today"
            value={todayOps.filter((op) => op.type === "Attendance").length}
            icon={ClipboardList}
            color="yellow"
          />
          <StatCard
            title="Departures Today"
            value={todayOps.filter((op) => op.type === "Departure").length}
            icon={ClipboardList}
            color="purple"
          />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;