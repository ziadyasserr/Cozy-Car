import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Sparkles,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Bus,
    ChevronRight,
    ArrowUpRight,
    Zap,
    Users
} from "lucide-react";
import { Link } from "react-router-dom";
import { useOperations } from "../../context/OperationsContext";
import { useFleet } from "../../context/FleetContext";
import { useDrivers } from "../../context/DriversContext";
import { useDriverAssignments } from "../../context/DriverAssignmentsContext";
import { analyzeScheduleHealth } from "../../utils/aiLearningEngine";

export default function OperatingAssistant({ targetDate, onOpenScheduler, onOpenAutoAllocation }) {
    const { t } = useTranslation();
    const { operations } = useOperations();
    const { vehicles, dailyAvailability } = useFleet();
    const { drivers } = useDrivers();
    const { driverAssignments } = useDriverAssignments();

    const dateToAnalyze = targetDate || new Date().toISOString().split("T")[0];

    const health = analyzeScheduleHealth({
        date: dateToAnalyze,
        operations,
        vehicles,
        dailyAvailability,
        drivers,
        driverAssignments
    });

    const pendingOpsCount = operations.filter(
        (op) => op.date === dateToAnalyze && op.status !== "Distributed"
    ).length;

    const unallocatedVehiclesNeeded = operations
        .filter((op) => op.date === dateToAnalyze)
        .reduce((sum, op) => {
            const assigned = Object.keys(op.vehicleAssignments || {}).length;
            return sum + Math.max(0, (Number(op.vehiclesCount) || 0) - assigned);
        }, 0);

    return (
        <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-900 via-slate-900 to-blue-950 p-6 text-white shadow-xl relative">
            {/* Background ambient glow */}
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                {/* Assistant Info */}
                <div className="max-w-2xl">
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                            <Sparkles size={16} />
                        </div>
                        <span className="text-xs font-bold tracking-wider uppercase text-indigo-300">
                            {t("OperatingAssistant.title")}
                        </span>
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                            {t("OperatingAssistant.systemActive")}
                        </span>
                    </div>

                    <h2 className="text-xl font-bold text-white tracking-tight">
                        {t("OperatingAssistant.heading")}
                    </h2>

                    <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                        {health.hasShortage
                            ? t("OperatingAssistant.shortageAlert", {
                                peakDemand: health.peakDemand,
                                peakHour: health.peakHour,
                                effectiveCapacity: health.effectiveCapacity
                            })
                            : unallocatedVehiclesNeeded > 0
                            ? t("OperatingAssistant.pendingOpsAlert", {
                                pendingOpsCount,
                                unallocatedVehiclesNeeded,
                                date: dateToAnalyze
                            })
                            : t("OperatingAssistant.scheduleBalanced", {
                                date: dateToAnalyze
                            })}
                    </p>

                    {/* Quick Stats Grid */}
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                            <span className="text-slate-400 block text-[11px]">{t("OperatingAssistant.healthScore")}</span>
                            <span className="text-lg font-bold text-white mt-0.5 block">
                                {health.healthScore}%
                            </span>
                        </div>
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                            <span className="text-slate-400 block text-[11px]">{t("OperatingAssistant.peakDemand")}</span>
                            <span className="text-lg font-bold text-white mt-0.5 block">
                                {health.peakDemand} <span className="text-xs font-normal text-slate-400">{t("OperatingAssistant.vehiclesUnit")}</span>
                            </span>
                        </div>
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                            <span className="text-slate-400 block text-[11px]">{t("OperatingAssistant.availableFleet")}</span>
                            <span className="text-lg font-bold text-white mt-0.5 block">
                                {health.effectiveCapacity} <span className="text-xs font-normal text-slate-400">{t("OperatingAssistant.activeUnit")}</span>
                            </span>
                        </div>
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                            <span className="text-slate-400 block text-[11px]">{t("OperatingAssistant.activeDrivers")}</span>
                            <span className="text-lg font-bold text-white mt-0.5 block">
                                {health.activeDrivers} <span className="text-xs font-normal text-slate-400">{t("OperatingAssistant.onDutyUnit")}</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[220px]">
                    {onOpenScheduler && (
                        <button
                            type="button"
                            onClick={onOpenScheduler}
                            className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 transition active:scale-95"
                        >
                            <span className="flex items-center gap-2">
                                <Clock size={16} />
                                {t("OperatingAssistant.smartDailyScheduler")}
                            </span>
                            <ChevronRight size={16} />
                        </button>
                    )}

                    {onOpenAutoAllocation ? (
                        <button
                            type="button"
                            onClick={onOpenAutoAllocation}
                            className="flex items-center justify-between gap-3 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-xs font-semibold text-white hover:bg-white/20 transition active:scale-95"
                        >
                            <span className="flex items-center gap-2">
                                <Zap size={16} className="text-amber-400" />
                                {t("OperatingAssistant.runSmartAutoAllocation")}
                            </span>
                            <ChevronRight size={16} />
                        </button>
                    ) : (
                        <Link
                            to="/allocation"
                            className="flex items-center justify-between gap-3 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-xs font-semibold text-white hover:bg-white/20 transition active:scale-95"
                        >
                            <span className="flex items-center gap-2">
                                <Zap size={16} className="text-amber-400" />
                                {t("OperatingAssistant.goToSmartAllocation")}
                            </span>
                            <ArrowUpRight size={16} />
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
