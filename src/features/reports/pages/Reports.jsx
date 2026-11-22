import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, TrendingUp, Bus, Users, CalendarDays, MapPin } from "lucide-react";
import { useFleet } from "../../../context/FleetContext";
import { useDrivers } from "../../../context/DriversContext";
import { useOperations } from "../../../context/OperationsContext";
import { useRoutes } from "../../../context/RoutesContext";
import StatCard from "../../../components/ui/StatCard";

function Reports() {
    const { t } = useTranslation();
    const { vehicles } = useFleet();
    const { drivers } = useDrivers();
    const { operations } = useOperations();
    const { routes } = useRoutes();

    const totalStops = useMemo(
        () => routes.reduce((sum, route) => sum + route.stops.length, 0),
        [routes]
    );

    const operationsByType = useMemo(() => {
        const attendance = operations.filter((op) => op.type === "Attendance").length;
        const departure = operations.filter((op) => op.type === "Departure").length;
        return { attendance, departure };
    }, [operations]);

    const operationsByRoute = useMemo(() => {
        const counts = {};
        operations.forEach((op) => {
            counts[op.route] = (counts[op.route] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    }, [operations]);

    const recentOps = useMemo(
        () => [...operations].sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.time || "00:00"}`);
            const dateB = new Date(`${b.date}T${b.time || "00:00"}`);
            return dateB - dateA;
        }).slice(0, 10),
        [operations]
    );

    const activeVehicles = vehicles.filter((v) => v.status === "Active").length;
    const activeDrivers = drivers.filter((d) => d.status === "Active").length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">{t("Reports.title")}</h1>
                <p className="mt-1 text-sm text-gray-500">
                    {t("Reports.subtitle")}
                </p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard title={t("Reports.totalVehicles")} value={vehicles.length} icon={Bus} color="blue" />
                <StatCard title={t("Reports.activeDrivers")} value={activeDrivers} icon={Users} color="green" />
                <StatCard title={t("Reports.totalOperations")} value={operations.length} icon={CalendarDays} color="purple" />
                <StatCard title={t("Reports.totalRoutes")} value={routes.length} icon={MapPin} color="yellow" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Operations by Type */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <h2 className="mb-4 font-semibold text-gray-800">{t("Reports.operationsByType")}</h2>
                    <div className="space-y-3">
                        <div>
                            <div className="mb-1 flex justify-between text-sm">
                                <span className="text-gray-600">{t("Reports.attendance")}</span>
                                <span className="font-medium text-gray-800">{operationsByType.attendance}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                                <div
                                    className="h-2 rounded-full bg-blue-500"
                                    style={{
                                        width: operations.length
                                            ? `${(operationsByType.attendance / operations.length) * 100}%`
                                            : "0%",
                                    }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="mb-1 flex justify-between text-sm">
                                <span className="text-gray-600">{t("Reports.departure")}</span>
                                <span className="font-medium text-gray-800">{operationsByType.departure}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                                <div
                                    className="h-2 rounded-full bg-green-500"
                                    style={{
                                        width: operations.length
                                            ? `${(operationsByType.departure / operations.length) * 100}%`
                                            : "0%",
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Routes */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <h2 className="mb-4 font-semibold text-gray-800">{t("Reports.topRoutes")}</h2>
                    {operationsByRoute.length === 0 ? (
                        <p className="text-sm text-gray-400">{t("Reports.noOperations")}</p>
                    ) : (
                        <div className="space-y-3">
                            {operationsByRoute.map(([route, count]) => (
                                <div key={route}>
                                    <div className="mb-1 flex justify-between text-sm">
                                        <span className="text-gray-600">{route}</span>
                                        <span className="font-medium text-gray-800">{count}</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                                        <div
                                            className="h-2 rounded-full bg-purple-500"
                                            style={{
                                                width: operations.length
                                                    ? `${(count / operations.length) * 100}%`
                                                    : "0%",
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Fleet Summary */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <h2 className="mb-4 font-semibold text-gray-800">{t("Reports.fleetSummary")}</h2>
                    <div className="space-y-3 text-sm">
                        <Row label={t("Reports.totalVehicles")} value={vehicles.length} />
                        <Row label={t("Reports.activeVehicles")} value={activeVehicles} />
                        <Row label={t("Reports.inMaintenance")} value={vehicles.filter((v) => v.status === "Maintenance").length} />
                        <Row label={t("Reports.inactiveVehicles")} value={vehicles.filter((v) => v.status === "Inactive").length} />
                        <Row label={t("Reports.totalBuses")} value={vehicles.filter((v) => v.type === "Bus").length} />
                        <Row label={t("Reports.totalCoasters")} value={vehicles.filter((v) => v.type === "Coaster").length} />
                    </div>
                </div>

                {/* Routes Summary */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <h2 className="mb-4 font-semibold text-gray-800">{t("Reports.routesSummary")}</h2>
                    <div className="space-y-3 text-sm">
                        <Row label={t("Reports.totalRoutes")} value={routes.length} />
                        <Row label={t("Reports.totalStops")} value={totalStops} />
                        {routes.map((route) => (
                            <Row
                                key={route.id}
                                label={route.name}
                                value={t("Reports.stopsCount", { count: route.stops.length })}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Recent Operations */}
            <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 p-5">
                    <h2 className="font-semibold text-gray-800">{t("Reports.recentOperations")}</h2>
                    <p className="mt-1 text-sm text-gray-500">{t("Reports.recentOperationsSubtitle")}</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-5 py-3 font-medium">{t("Reports.thDate")}</th>
                                <th className="px-5 py-3 font-medium">{t("Reports.thType")}</th>
                                <th className="px-5 py-3 font-medium">{t("Reports.thRoute")}</th>
                                <th className="px-5 py-3 font-medium">{t("Reports.thTime")}</th>
                                <th className="px-5 py-3 font-medium">{t("Reports.thVehicles")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {recentOps.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-5 py-8 text-center text-gray-400">
                                        {t("Reports.noOperations")}
                                    </td>
                                </tr>
                            ) : (
                                recentOps.map((op) => (
                                    <tr key={op.id} className="hover:bg-gray-50">
                                        <td className="px-5 py-3 text-gray-700">{op.date}</td>
                                        <td className="px-5 py-3">
                                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                                                op.type === "Attendance"
                                                    ? "bg-blue-100 text-blue-700"
                                                    : "bg-green-100 text-green-700"
                                            }`}>
                                                {op.type === "Attendance" ? t("Reports.attendance") : op.type === "Departure" ? t("Reports.departure") : op.type}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700">{op.route}</td>
                                        <td className="px-5 py-3 text-gray-700">{op.time || "—"}</td>
                                        <td className="px-5 py-3 text-gray-700">{op.vehiclesCount}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value }) {
    return (
        <div className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 last:pb-0">
            <span className="text-gray-500">{label}</span>
            <span className="font-medium text-gray-800">{value}</span>
        </div>
    );
}

export default Reports;
