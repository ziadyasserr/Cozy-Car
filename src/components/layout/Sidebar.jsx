import {
  LayoutDashboard,
  Bus,
  Users,
  MapPin,
  CalendarDays,
  ClipboardList,
  BarChart3,
  Settings,
  UserRoundCog,
  Map,
} from "lucide-react";

import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

const menuItems = [
  { key: "dashboard", path: "/", icon: LayoutDashboard },
  { key: "fleet", path: "/fleet", icon: Bus },
  { key: "drivers", path: "/drivers", icon: Users },
  {
    key: "driverAssignments",
    path: "/driver-assignments",
    icon: UserRoundCog,
  },
  { key: "routesAndStops", path: "/routes", icon: MapPin },
  { key: "dailyOperations", path: "/operations", icon: CalendarDays },
  { key: "allocation", path: "/allocation", icon: ClipboardList },
  { key: "travelTimes", path: "/travel-times", icon: ClipboardList },
  { key: "liveMap", path: "/live-map", icon: Map },
  { key: "reports", path: "/reports", icon: BarChart3 },
  { key: "settings", path: "/settings", icon: Settings },
];

function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="fixed start-0 top-0 flex h-screen w-64 flex-col bg-slate-900 text-white">
      <div className="border-b border-slate-700 px-6 py-5">
        <h1 className="text-2xl font-bold">Cozy</h1>
        <p className="mt-1 text-xs text-slate-400">
          {t("sidebar.fleetManagementSystem")}
        </p>
      </div>

      <nav className="flex-1 space-y-2  px-4 py-6">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon size={20} />
              <span>{t(`sidebar.${item.key}`)}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-700 p-4">
        <p className="text-sm font-medium">{t("sidebar.admin")}</p>
        <p className="text-xs text-slate-400">
          {t("sidebar.operationsManager")}
        </p>
      </div>
    </aside>
  );
}

export default Sidebar;
