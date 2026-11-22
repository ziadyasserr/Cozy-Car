import { useTranslation } from "react-i18next";
import { Bus, Users, CalendarDays, ClipboardList, CheckCircle, AlertCircle } from "lucide-react";
import { useFleet } from "../../../context/FleetContext";
import { useDrivers } from "../../../context/DriversContext";
import { useOperations } from "../../../context/OperationsContext";
import StatCard from "../../../components/ui/StatCard";
import OperatingAssistant from "../../../components/common/OperatingAssistant";

function Dashboard() {
  const { t, i18n } = useTranslation();
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

  const formattedDate = new Date().toLocaleDateString(
    i18n.language?.startsWith("ar") ? "ar-EG" : "en-GB",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">{t("Dashboard.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t("Dashboard.description", { date: formattedDate })}
        </p>
      </div>

      {/* AI Operating Assistant */}
      <OperatingAssistant />

      {/* Fleet Stats */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {t("Dashboard.fleet")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title={t("Dashboard.totalVehicles")} value={vehicles.length} icon={Bus} color="blue" />
          <StatCard title={t("Dashboard.availableToday")} value={availableVehicles} icon={CheckCircle} color="green" />
          <StatCard title={t("Dashboard.unavailableToday")} value={unavailableVehicles} icon={AlertCircle} color="red" />
          <StatCard
            title={t("Dashboard.notSetToday")}
            value={vehicles.length - availableVehicles - unavailableVehicles}
            icon={Bus}
            color="gray"
          />
        </div>
      </div>

      {/* People Stats */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {t("Dashboard.people")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard title={t("Dashboard.totalDrivers")} value={drivers.length} icon={Users} color="purple" />
          <StatCard title={t("Dashboard.activeDrivers")} value={activeDrivers} icon={Users} color="green" />
          <StatCard title={t("Dashboard.inactiveDrivers")} value={drivers.length - activeDrivers} icon={Users} color="gray" />
        </div>
      </div>

      {/* Operations Stats */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {t("Dashboard.operations")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title={t("Dashboard.totalOperations")} value={operations.length} icon={CalendarDays} color="blue" />
          <StatCard title={t("Dashboard.todayOperations")} value={todayOps.length} icon={CalendarDays} color="green" />
          <StatCard
            title={t("Dashboard.attendanceToday")}
            value={todayOps.filter((op) => op.type === "Attendance").length}
            icon={ClipboardList}
            color="yellow"
          />
          <StatCard
            title={t("Dashboard.departuresToday")}
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
