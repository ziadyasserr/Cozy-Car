import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    Sparkles,
    CheckCircle2,
    AlertCircle,
    Clock,
    Bus,
    UserCheck,
    Zap,
    X,
    ArrowRight,
    ShieldAlert
} from "lucide-react";
import { useOperations } from "../../../context/OperationsContext";
import { useFleet } from "../../../context/FleetContext";
import { useDrivers } from "../../../context/DriversContext";
import { useDriverAssignments } from "../../../context/DriverAssignmentsContext";
import { useTravelTimes } from "../../../context/TravelTimesContext";
import { useRoutes } from "../../../context/RoutesContext";
import {
    runSmartAllocation,
    applyAllocationsToOperations
} from "../../../utils/smartAllocationEngine";

export default function SmartAutoAllocationModal({ isOpen, onClose, targetDate }) {
    const { t } = useTranslation();
    const { operations, setOperations } = useOperations();
    const { vehicles, dailyAvailability } = useFleet();
    const { drivers } = useDrivers();
    const { driverAssignments } = useDriverAssignments();
    const { travelTimes } = useTravelTimes();
    const { routes } = useRoutes();

    const [selectedDate, setSelectedDate] = useState(() => {
        return targetDate || new Date().toISOString().split("T")[0];
    });

    const [appliedNotice, setAppliedNotice] = useState(false);

    // Run the Smart Allocation optimization engine
    const allocationResult = useMemo(() => {
        return runSmartAllocation({
            date: selectedDate,
            operations,
            vehicles,
            dailyAvailability,
            drivers,
            driverAssignments,
            travelTimes,
            routes
        });
    }, [
        selectedDate,
        operations,
        vehicles,
        dailyAvailability,
        drivers,
        driverAssignments,
        travelTimes,
        routes
    ]);

    if (!isOpen) return null;

    const handleApply = () => {
        if (!allocationResult.proposedAllocations.length) return;

        setOperations((prev) =>
            applyAllocationsToOperations(prev, allocationResult.proposedAllocations)
        );

        setAppliedNotice(true);
        setTimeout(() => {
            setAppliedNotice(false);
            onClose();
        }, 1800);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/50 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20">
                            <Zap size={22} className="text-amber-300" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-slate-800">
                                    {t("SmartAutoAllocationModal.title")}
                                </h2>
                                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                                    {t("SmartAutoAllocationModal.badge")}
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                                {t("SmartAutoAllocationModal.subtitle")}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        title={t("SmartAutoAllocationModal.close")}
                        aria-label={t("SmartAutoAllocationModal.close")}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Operating Date Selector & KPI Strip */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-b border-slate-100 bg-slate-50/70 p-5">
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                            {t("SmartAutoAllocationModal.targetOperatingDate")}
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
                        <span className="text-[11px] font-semibold uppercase text-slate-400">{t("SmartAutoAllocationModal.proposedAllocations")}</span>
                        <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-xl font-bold text-indigo-700">
                                {allocationResult.proposedAllocations.length}
                            </span>
                            <span className="text-xs text-slate-500">{t("SmartAutoAllocationModal.tripsFilled")}</span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
                        <span className="text-[11px] font-semibold uppercase text-slate-400">{t("SmartAutoAllocationModal.fleetEfficiency")}</span>
                        <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-xl font-bold text-emerald-600">
                                {allocationResult.uniqueVehiclesUsed}
                            </span>
                            <span className="text-xs text-slate-500">
                                {t("SmartAutoAllocationModal.activeVehiclesCount", { count: allocationResult.totalActiveVehicles })}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
                        <span className="text-[11px] font-semibold uppercase text-slate-400">{t("SmartAutoAllocationModal.coverageStatus")}</span>
                        <div className="mt-1 flex items-center gap-1.5">
                            {allocationResult.isFullyAllocated ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                    <CheckCircle2 size={16} /> {t("SmartAutoAllocationModal.demandMet")}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                                    <ShieldAlert size={16} /> {t("SmartAutoAllocationModal.unfilledCount", { count: allocationResult.unfilledRequirements.length })}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Proposed Assignments Table */}
                <div className="flex-1 overflow-y-auto p-5">
                    {appliedNotice && (
                        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={18} className="text-emerald-600" />
                            {t("SmartAutoAllocationModal.appliedNotice")}
                        </div>
                    )}

                    {allocationResult.unfilledRequirements.length > 0 && (
                        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                            <div className="flex items-center gap-2 font-semibold text-amber-900 text-xs uppercase tracking-wide">
                                <AlertCircle size={16} className="text-amber-600" />
                                {t("SmartAutoAllocationModal.unfulfilledShortages")}
                            </div>
                            <ul className="mt-2 space-y-1.5 text-xs text-amber-800">
                                {allocationResult.unfilledRequirements.map((unfilled, idx) => (
                                    <li key={idx} className="flex items-center justify-between">
                                        <span>
                                            {t("SmartAutoAllocationModal.unfilledItem", {
                                                type: unfilled.type === "Attendance" ? t("SmartAutoAllocationModal.table.attendance") : (unfilled.type === "Departure" ? t("SmartAutoAllocationModal.table.departure") : unfilled.type),
                                                route: unfilled.route,
                                                time: unfilled.time,
                                                count: unfilled.missingCount
                                            })}
                                        </span>
                                        <span className="text-amber-700 italic">{unfilled.reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {allocationResult.proposedAllocations.length === 0 ? (
                        <div className="py-16 text-center text-slate-500">
                            <Bus size={40} className="mx-auto mb-2 text-slate-300" />
                            <p className="font-semibold text-slate-700">{t("SmartAutoAllocationModal.noPendingOperations")}</p>
                            <p className="text-xs text-slate-400 mt-1">
                                {t("SmartAutoAllocationModal.allOperationsDistributed", { date: selectedDate })}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
                                    <tr>
                                        <th className="px-4 py-3">{t("SmartAutoAllocationModal.table.operation")}</th>
                                        <th className="px-4 py-3">{t("SmartAutoAllocationModal.table.vehicleAndType")}</th>
                                        <th className="px-4 py-3">{t("SmartAutoAllocationModal.table.driverAndShift")}</th>
                                        <th className="px-4 py-3">{t("SmartAutoAllocationModal.table.assignedStop")}</th>
                                        <th className="px-4 py-3">{t("SmartAutoAllocationModal.table.bufferTransit")}</th>
                                        <th className="px-4 py-3">{t("SmartAutoAllocationModal.table.optimizationReason")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {allocationResult.proposedAllocations.map((alloc, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition">
                                            <td className="px-4 py-3 font-semibold text-slate-800">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                                        alloc.operationType === "Attendance"
                                                            ? "bg-amber-100 text-amber-800"
                                                            : "bg-purple-100 text-purple-800"
                                                    }`}>
                                                        {alloc.operationType === "Attendance"
                                                            ? t("SmartAutoAllocationModal.table.attendance")
                                                            : (alloc.operationType === "Departure" ? t("SmartAutoAllocationModal.table.departure") : alloc.operationType)}
                                                    </span>
                                                    <span>{alloc.operationRoute}</span>
                                                    <span className="font-mono text-slate-500">({alloc.operationTime})</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                                    <Bus size={14} className="text-blue-600" />
                                                    {alloc.vehicleNumber}
                                                    <span className="text-[10px] font-normal text-slate-400">
                                                        ({alloc.vehicleType})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                                                        <UserCheck size={12} className="text-emerald-600" />
                                                        {alloc.driverName}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">
                                                        {alloc.shiftName}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-700">
                                                {alloc.stopName}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="rounded bg-slate-100 px-2 py-1 font-mono text-slate-700">
                                                    {t("SmartAutoAllocationModal.table.idleBuffer", { minutes: alloc.idleBufferMinutes })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 italic text-[11px]">
                                                {alloc.reason}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/60 transition"
                    >
                        {t("SmartAutoAllocationModal.close")}
                    </button>

                    <button
                        type="button"
                        disabled={allocationResult.proposedAllocations.length === 0}
                        onClick={handleApply}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 transition active:scale-95"
                    >
                        <Zap size={16} className="text-amber-300" />
                        {t("SmartAutoAllocationModal.applyButton", { count: allocationResult.proposedAllocations.length })}
                    </button>
                </div>
            </div>
        </div>
    );
}
