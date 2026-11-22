import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Plus, Trash2, Pencil, X, Clock, Sparkles } from "lucide-react";

import { useFleet } from "../../../context/FleetContext";
import { useOperations } from "../../../context/OperationsContext";
import { useRoutes } from "../../../context/RoutesContext";
import { useTravelTimes } from "../../../context/TravelTimesContext";
import RecurringScheduleModal from "../components/RecurringScheduleModal";
import OperatingAssistant from "../../../components/common/OperatingAssistant";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import AlertModal from "../../../components/ui/AlertModal";
import { checkVehicleConflict } from "../../../utils/allocationUtils";
import { formatTime12Hour } from "../../../utils/timeUtils";

const emptyForm = {
    date: new Date().toISOString().split("T")[0],
    type: "Attendance",
    route: "المؤسسة",
    time: "",
    vehiclesCount: "",
};

function Operations() {
    const { t } = useTranslation();
    const { operations, setOperations } = useOperations();
    const { vehicles, dailyAvailability } = useFleet();
    const { routes } = useRoutes();
    const { travelTimes } = useTravelTimes();

    const [showForm, setShowForm] = useState(false);
    const [showRecurringModal, setShowRecurringModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [filter, setFilter] = useState("All");
    const [formData, setFormData] = useState(emptyForm);

    const [showDistribution, setShowDistribution] = useState(false);
    const [selectedOperation, setSelectedOperation] = useState(null);
    const [vehicleAssignments, setVehicleAssignments] = useState({});
    const [requestedStopAllocations, setRequestedStopAllocations] =
        useState({});

    const [confirmDelete, setConfirmDelete] = useState({
        open: false,
        id: null,
    });

    // Pending edit that would clear the saved distribution.
    const [confirmEdit, setConfirmEdit] = useState({
        open: false,
        operationData: null,
    });

    const [alertModal, setAlertModal] = useState({
        open: false,
        message: "",
        title: t("Operations.validationErrorTitle"),
    });

    const showAlert = (message, title) => {
        setAlertModal({ open: true, message, title: title || t("Operations.validationErrorTitle") });
    };

    const selectedRoute = selectedOperation
        ? routes.find(
            (route) => route.name === selectedOperation.route
        )
        : null;

    const selectedDateAvailability = selectedOperation
        ? dailyAvailability[selectedOperation.date] || {}
        : {};

    // Active vehicles are available by default unless marked "Unavailable" for that date.
    const availableVehicles = selectedOperation
        ? vehicles.filter(
            (vehicle) =>
                vehicle.status === "Active" &&
                selectedDateAvailability[vehicle.id] !== "Unavailable"
        )
        : [];

    const allocatedVehicles = Object.values(vehicleAssignments).filter(
        Boolean
    ).length;

    const requestedTotal = Object.values(requestedStopAllocations).reduce(
        (total, count) => total + (Number(count) || 0),
        0
    );

    const resetForm = () => {
        setFormData(emptyForm);
        setEditingId(null);
        setShowForm(false);
    };

    const hasSavedDistribution = (operation) =>
        Object.keys(operation.vehicleAssignments || {}).length > 0 ||
        Object.keys(operation.requestedStopAllocations || {}).length > 0;

    const applyOperationEdit = (operationData, clearDistribution) => {
        setOperations((prev) =>
            prev.map((operation) => {
                if (operation.id !== editingId) return operation;

                if (!clearDistribution) {
                    return { ...operation, ...operationData };
                }

                return {
                    ...operation,
                    ...operationData,
                    status: "Pending",
                    requestedStopAllocations: {},
                    vehicleAssignments: {},
                    driverAssignments: {},
                    assignedVehicles: [],
                    stopAllocations: [],
                };
            })
        );

        if (clearDistribution && selectedOperation?.id === editingId) {
            handleCloseDistribution();
        }

        resetForm();
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const vehiclesCount = Number(formData.vehiclesCount);

        if (
            !formData.date ||
            !formData.time ||
            !formData.route ||
            !Number.isInteger(vehiclesCount) ||
            vehiclesCount <= 0
        ) {
            showAlert(t("Operations.alerts.completeFields"));
            return;
        }

        const operationData = {
            ...formData,
            vehiclesCount,
        };

        if (editingId) {
            const original = operations.find(
                (operation) => operation.id === editingId
            );

            if (!original) {
                resetForm();
                return;
            }

            const scheduleChanged =
                original.date !== operationData.date ||
                original.type !== operationData.type ||
                original.route !== operationData.route ||
                original.time !== operationData.time;

            if (scheduleChanged && hasSavedDistribution(original)) {
                setConfirmEdit({ open: true, operationData });
                return;
            }

            if (
                vehiclesCount <
                Object.keys(original.vehicleAssignments || {}).length
            ) {
                showAlert(
                    t("Operations.alerts.requiredVehiclesLessThanAssigned")
                );
                return;
            }

            applyOperationEdit(operationData, false);
            return;
        }

        setOperations((prev) => [
            ...prev,
            {
                id: Date.now(),
                ...operationData,
                status: "Pending",
                requestedStopAllocations: {},
                vehicleAssignments: {},
                driverAssignments: {},
                assignedVehicles: [],
                stopAllocations: [],
            },
        ]);

        resetForm();
    };

    const confirmEditAndClear = () => {
        applyOperationEdit(confirmEdit.operationData, true);
        setConfirmEdit({ open: false, operationData: null });
    };

    const handleEdit = (operation) => {
        setFormData({
            date: operation.date,
            type: operation.type,
            route: operation.route,
            time: operation.time,
            vehiclesCount: String(operation.vehiclesCount),
        });

        setEditingId(operation.id);
        setShowForm(true);
    };

    const handleDelete = (id) => {
        setConfirmDelete({ open: true, id });
    };

    const confirmDeleteOperation = () => {
        const id = confirmDelete.id;

        setOperations((prev) =>
            prev.filter((operation) => operation.id !== id)
        );

        if (selectedOperation?.id === id) {
            handleCloseDistribution();
        }

        setConfirmDelete({ open: false, id: null });
    };

    const handleOpenDistribution = (operation) => {
        const route = routes.find(
            (item) => item.name === operation.route
        );

        if (!route) {
            showAlert(t("Operations.alerts.routeNotFound"));
            return;
        }

        setSelectedOperation(operation);
        setVehicleAssignments(operation.vehicleAssignments || {});

        const savedDemand = operation.requestedStopAllocations || {};
        const initialDemand = {};

        route.stops.forEach((stop) => {
            initialDemand[stop.id] =
                savedDemand[stop.id] ?? "";
        });

        setRequestedStopAllocations(initialDemand);
        setShowDistribution(true);
    };

    const handleCloseDistribution = () => {
        setShowDistribution(false);
        setSelectedOperation(null);
        setVehicleAssignments({});
        setRequestedStopAllocations({});
    };

    const handleVehicleStopChange = (vehicleId, stopId) => {
        setVehicleAssignments((prev) => {
            const updated = { ...prev };

            if (!stopId) {
                delete updated[vehicleId];
            } else {
                updated[vehicleId] = Number(stopId);
            }

            return updated;
        });
    };

    const handleRequestedCountChange = (stopId, value) => {
        setRequestedStopAllocations((prev) => ({
            ...prev,
            [stopId]: value,
        }));
    };

    const handleSaveDistribution = () => {
        if (!selectedOperation || !selectedRoute) return;

        const demandEntries = selectedRoute.stops.map((stop) => ({
            stopId: stop.id,
            count: Number(requestedStopAllocations[stop.id]) || 0,
        }));

        const hasInvalidDemand = demandEntries.some(
            (item) =>
                !Number.isInteger(item.count) ||
                item.count < 0
        );

        if (hasInvalidDemand) {
            showAlert(t("Operations.alerts.enterValidStopCounts"));
            return;
        }

        const totalDemand = demandEntries.reduce(
            (total, item) => total + item.count,
            0
        );

        if (totalDemand !== selectedOperation.vehiclesCount) {
            showAlert(
                t("Operations.alerts.stopDistributionMustEqual", {
                    count: selectedOperation.vehiclesCount,
                    current: totalDemand,
                })
            );
            return;
        }

        const assignments = Object.entries(vehicleAssignments)
            .filter(([, stopId]) => Boolean(stopId))
            .map(([vehicleId, stopId]) => ({
                vehicleId: Number(vehicleId),
                stopId: Number(stopId),
            }));

        if (assignments.length > selectedOperation.vehiclesCount) {
            showAlert(t("Operations.alerts.assignedExceedRequired"));
            return;
        }

        const availableVehicleIds = new Set(
            availableVehicles.map((vehicle) => Number(vehicle.id))
        );

        const allVehiclesAvailable = assignments.every((assignment) =>
            availableVehicleIds.has(assignment.vehicleId)
        );

        if (!allVehiclesAvailable) {
            showAlert(t("Operations.alerts.vehiclesNoLongerAvailable"));
            return;
        }

        const validStopIds = new Set(
            selectedRoute.stops.map((stop) => Number(stop.id))
        );

        const allStopsValid = assignments.every((assignment) =>
            validStopIds.has(assignment.stopId)
        );

        if (!allStopsValid) {
            showAlert(t("Operations.alerts.selectValidStop"));
            return;
        }

        const actualCounts = {};

        selectedRoute.stops.forEach((stop) => {
            actualCounts[stop.id] = assignments.filter(
                (item) => item.stopId === Number(stop.id)
            ).length;
        });

        const exceedsDemand = selectedRoute.stops.some(
            (stop) =>
                actualCounts[stop.id] >
                (Number(requestedStopAllocations[stop.id]) || 0)
        );

        if (exceedsDemand) {
            showAlert(
                t("Operations.alerts.assignedExceedRequested")
            );
            return;
        }

        // Check every assigned vehicle against its other operations
        // (travel times, overlaps, midnight crossings).
        // Only vehicles whose stop changed are checked, so existing valid
        // assignments are never blocked by unrelated data.
        const previousAssignments = selectedOperation.vehicleAssignments || {};

        for (const assignment of assignments) {
            const unchanged =
                Number(previousAssignments[assignment.vehicleId]) ===
                assignment.stopId;

            if (unchanged) continue;

            const conflict = checkVehicleConflict({
                vehicleId: assignment.vehicleId,
                targetOperation: {
                    ...selectedOperation,
                    stopId: assignment.stopId,
                },
                operations,
                travelTimes,
                routes,
            });

            if (conflict.hasConflict) {
                const vehicle = vehicles.find(
                    (item) => Number(item.id) === assignment.vehicleId
                );

                showAlert(
                    t("Operations.alerts.vehicleConflict", { vehicle: vehicle?.number || assignment.vehicleId, reason: conflict.reason }),
                    t("Operations.vehicleConflictTitle")
                );
                return;
            }
        }

        const allocations = selectedRoute.stops.map((stop) => ({
            stopId: stop.id,
            stopName: stop.name,
            count: actualCounts[stop.id],
        }));

        const requestedAllocations = selectedRoute.stops.map((stop) => ({
            stopId: stop.id,
            stopName: stop.name,
            count: Number(requestedStopAllocations[stop.id]) || 0,
        }));

        let status = "Pending";

        if (assignments.length === selectedOperation.vehiclesCount) {
            status = "Distributed";
        } else if (assignments.length > 0) {
            status = "Partially Distributed";
        }

        const normalizedAssignments = Object.fromEntries(
            assignments.map((item) => [
                item.vehicleId,
                item.stopId,
            ])
        );

        // Keep the selected driver only for vehicles still assigned
        // to the same stop; drop drivers of removed or moved vehicles.
        const previousDriverAssignments =
            selectedOperation.driverAssignments || {};

        const normalizedDriverAssignments = Object.fromEntries(
            Object.entries(previousDriverAssignments).filter(
                ([vehicleId]) =>
                    Number(previousAssignments[vehicleId]) ===
                    Number(normalizedAssignments[vehicleId])
            )
        );

        setOperations((prev) =>
            prev.map((operation) =>
                operation.id === selectedOperation.id
                    ? {
                        ...operation,
                        requestedStopAllocations: Object.fromEntries(
                            requestedAllocations.map((item) => [
                                item.stopId,
                                item.count,
                            ])
                        ),
                        vehicleAssignments: normalizedAssignments,
                        driverAssignments: normalizedDriverAssignments,
                        assignedVehicles: assignments.map(
                            (item) => item.vehicleId
                        ),
                        stopAllocations: allocations,
                        status,
                    }
                    : operation
            )
        );

        handleCloseDistribution();
    };

    const filteredOperations = operations.filter((operation) => {
        return filter === "All" || operation.type === filter;
    });

    const totalVehicles = filteredOperations.reduce(
        (total, operation) => total + operation.vehiclesCount,
        0
    );

    const getStatusStyle = (status) => {
        if (status === "Distributed") {
            return "bg-green-100 text-green-700";
        }

        if (status === "Partially Distributed") {
            return "bg-blue-100 text-blue-700";
        }

        return "bg-yellow-100 text-yellow-700";
    };

    const getStatusLabel = (status) => {
        if (status === "Distributed") {
            return t("Operations.statusDistributed");
        }

        if (status === "Partially Distributed") {
            return t("Operations.statusPartiallyDistributed");
        }

        return t("Operations.statusPending");
    };

    const getTypeLabel = (type) => {
        if (type === "Attendance") {
            return t("Operations.attendance");
        }

        if (type === "Departure") {
            return t("Operations.departure");
        }

        return type;
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-gray-800">
                            {t("Operations.title")}
                        </h1>
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                            {t("Operations.aiGuided")}
                        </span>
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                        {t("Operations.description")}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowRecurringModal(true)}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 transition active:scale-95"
                    >
                        <Sparkles size={16} className="text-amber-300" />
                        {t("Operations.intelligentDailyScheduler")}
                    </button>

                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-95"
                    >
                        <Plus size={18} />
                        {t("Operations.addOperation")}
                    </button>
                </div>
            </div>

            {/* AI Operating Assistant Health Panel */}
            <OperatingAssistant
                onOpenScheduler={() => setShowRecurringModal(true)}
            />

            {/* Statistics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title={t("Operations.totalOperations")}
                    value={filteredOperations.length}
                />

                <StatCard
                    title={t("Operations.requiredVehicles")}
                    value={totalVehicles}
                />

                <StatCard
                    title={t("Operations.pendingDistribution")}
                    value={
                        filteredOperations.filter(
                            (operation) => operation.status !== "Distributed"
                        ).length
                    }
                />
            </div>

            {/* Add / Edit Operation Form */}
            {showForm && (
                <form
                    onSubmit={handleSubmit}
                    className="rounded-xl border border-gray-200 bg-white p-6"
                >
                    <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-800">
                            {editingId ? t("Operations.editOperation") : t("Operations.addNewOperation")}
                        </h2>

                        <button type="button" onClick={resetForm}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <FormField label={t("Operations.operationDate")}>
                            <input
                                type="date"
                                required
                                value={formData.date}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        date: e.target.value,
                                    })
                                }
                                className="form-input"
                            />
                        </FormField>

                        <FormField label={t("Operations.operationType")}>
                            <select
                                value={formData.type}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        type: e.target.value,
                                    })
                                }
                                className="form-input"
                            >
                                <option value="Attendance">{t("Operations.attendance")}</option>
                                <option value="Departure">{t("Operations.departure")}</option>
                            </select>
                        </FormField>

                        <FormField label={t("Operations.route")}>
                            <select
                                value={formData.route}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        route: e.target.value,
                                    })
                                }
                                className="form-input"
                            >
                                {routes.map((route) => (
                                    <option key={route.id} value={route.name}>
                                        {route.name}
                                    </option>
                                ))}
                            </select>
                        </FormField>

                        <FormField label={t("Operations.scheduledTime")}>
                            <input
                                type="time"
                                required
                                value={formData.time}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        time: e.target.value,
                                    })
                                }
                                className="form-input"
                            />

                            <p className="mt-1 text-xs text-gray-500">
                                {formData.type === "Attendance"
                                    ? t("Operations.attendanceTimeHelp")
                                    : t("Operations.departureTimeHelp")}
                            </p>
                        </FormField>

                        <FormField label={t("Operations.requiredVehicles")}>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                required
                                value={formData.vehiclesCount}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        vehiclesCount: e.target.value,
                                    })
                                }
                                className="form-input"
                                placeholder={t("Operations.vehiclesPlaceholder")}
                            />
                        </FormField>
                    </div>

                    <div className="mt-5 flex gap-2">
                        <button
                            type="submit"
                            className="rounded-lg bg-blue-600 px-5 py-2 text-white"
                        >
                            {editingId ? t("Operations.saveChanges") : t("Operations.addOperation")}
                        </button>

                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded-lg bg-gray-100 px-5 py-2 text-gray-700"
                        >
                            {t("Operations.cancel")}
                        </button>
                    </div>
                </form>
            )}

            {/* Distribution Panel */}
            {showDistribution && selectedOperation && (
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">
                                {t("Operations.distributionTitle")}
                            </h2>

                            <p className="mt-1 text-sm text-gray-500">
                                {selectedOperation.route} -{" "}
                                {getTypeLabel(selectedOperation.type)}
                            </p>
                        </div>

                        <button
                            onClick={handleCloseDistribution}
                            className="text-gray-500 hover:text-gray-800"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Summary Cards */}
                    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-lg bg-blue-50 p-4">
                            <p className="text-sm text-gray-500">
                                {t("Operations.requiredVehicles")}
                            </p>
                            <p className="mt-1 text-2xl font-bold text-blue-700">
                                {selectedOperation.vehiclesCount}
                            </p>
                        </div>

                        <div className="rounded-lg bg-green-50 p-4">
                            <p className="text-sm text-gray-500">
                                {t("Operations.assignedVehicles")}
                            </p>
                            <p className="mt-1 text-2xl font-bold text-green-700">
                                {allocatedVehicles}
                            </p>
                        </div>

                        <div className="rounded-lg bg-orange-50 p-4">
                            <p className="text-sm text-gray-500">
                                {t("Operations.remainingVehicles")}
                            </p>
                            <p className="mt-1 text-2xl font-bold text-orange-700">
                                {selectedOperation.vehiclesCount - allocatedVehicles}
                            </p>
                        </div>
                    </div>

                    {/* Requested Distribution */}
                    <div className="mb-8">
                        <h3 className="font-semibold text-gray-800">
                            {t("Operations.requestedDistributionTitle")}
                        </h3>

                        <p className="mb-4 mt-1 text-sm text-gray-500">
                            {t("Operations.requestedDistributionDesc")}
                        </p>

                        <div className="space-y-3">
                            {selectedRoute?.stops.map((stop) => {
                                const requested =
                                    Number(requestedStopAllocations[stop.id]) || 0;

                                const assigned = Object.values(
                                    vehicleAssignments
                                ).filter(
                                    (stopId) =>
                                        Number(stopId) === Number(stop.id)
                                ).length;

                                return (
                                    <div
                                        key={stop.id}
                                        className="grid grid-cols-1 items-center gap-3 rounded-lg border border-gray-200 p-4 sm:grid-cols-3"
                                    >
                                        <div>
                                            <p className="font-medium text-gray-800">
                                                {stop.name}
                                            </p>
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs text-gray-500">
                                                {t("Operations.requiredVehicles")}
                                            </label>

                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={requestedStopAllocations[stop.id]}
                                                onChange={(e) =>
                                                    handleRequestedCountChange(
                                                        stop.id,
                                                        e.target.value
                                                    )
                                                }
                                                className="w-full rounded-lg border border-gray-300 p-2"
                                            />
                                        </div>

                                        <div className="text-sm">
                                            <p className="text-gray-500">
                                                <Trans
                                                    i18nKey="Operations.assignedCount"
                                                    values={{ count: assigned }}
                                                    components={{
                                                        strong: <strong className="text-gray-800" />
                                                    }}
                                                />
                                            </p>

                                            <p className="text-gray-500">
                                                <Trans
                                                    i18nKey="Operations.remainingCount"
                                                    values={{ count: Math.max(requested - assigned, 0) }}
                                                    components={{
                                                        strong: <strong className="text-orange-600" />
                                                    }}
                                                />
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-4">
                            <span className="font-medium text-gray-700">
                                {t("Operations.requestedTotal")}
                            </span>

                            <span
                                className={`font-bold ${
                                    requestedTotal === selectedOperation.vehiclesCount
                                        ? "text-green-600"
                                        : "text-red-600"
                                }`}
                            >
                                {requestedTotal} / {selectedOperation.vehiclesCount}
                            </span>
                        </div>
                    </div>

                    {/* Actual Vehicle Assignments */}
                    <div>
                        <h3 className="font-semibold text-gray-800">
                            {t("Operations.actualAssignmentsTitle")}
                        </h3>

                        <p className="mb-4 mt-1 text-sm text-gray-500">
                            {t("Operations.actualAssignmentsDesc")}
                        </p>

                        {availableVehicles.length === 0 ? (
                            <p className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700">
                                {t("Operations.noVehiclesAvailable")}
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {availableVehicles.map((vehicle) => (
                                    <div
                                        key={vehicle.id}
                                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4"
                                    >
                                        <div>
                                            <p className="font-semibold text-gray-800">
                                                {vehicle.number || vehicle.name}
                                            </p>

                                            <p className="text-xs text-gray-500">
                                                {vehicle.type}
                                            </p>
                                        </div>

                                        <select
                                            value={vehicleAssignments[vehicle.id] || ""}
                                            onChange={(e) =>
                                                handleVehicleStopChange(
                                                    vehicle.id,
                                                    e.target.value
                                                )
                                            }
                                            className="min-w-48 rounded-lg border border-gray-300 px-3 py-2"
                                        >
                                            <option value="">
                                                {t("Operations.notAssigned")}
                                            </option>

                                            {selectedRoute?.stops.map((stop) => {
                                                const requested =
                                                    Number(requestedStopAllocations[stop.id]) || 0;

                                                const assignedToStop = Object.entries(
                                                    vehicleAssignments
                                                ).filter(
                                                    ([assignedVehicleId, stopId]) =>
                                                        Number(stopId) === Number(stop.id) &&
                                                        Number(assignedVehicleId) !== Number(vehicle.id)
                                                ).length;

                                                const currentStop = Number(
                                                    vehicleAssignments[vehicle.id]
                                                );

                                                const isCurrentStop =
                                                    currentStop === Number(stop.id);

                                                const isFull =
                                                    assignedToStop >= requested;

                                                return (
                                                    <option
                                                        key={stop.id}
                                                        value={stop.id}
                                                        disabled={isFull && !isCurrentStop}
                                                    >
                                                        {stop.name} (
                                                        {assignedToStop + (isCurrentStop ? 1 : 0)}
                                                        /{requested})
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Final Summary */}
                    <div className="mt-6 space-y-2 rounded-lg bg-gray-50 p-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">
                                {t("Operations.requestedVehicles")}
                            </span>
                            <strong>{requestedTotal}</strong>
                        </div>

                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">
                                {t("Operations.assignedVehicles")}
                            </span>
                            <strong>{allocatedVehicles}</strong>
                        </div>

                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">
                                {t("Operations.notAssignedYet")}
                            </span>
                            <strong className="text-orange-600">
                                {Math.max(
                                    selectedOperation.vehiclesCount - allocatedVehicles,
                                    0
                                )}
                            </strong>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-gray-500">
                            {t("Operations.saveDistributionHint")}
                        </p>

                        <button
                            onClick={handleSaveDistribution}
                            className="rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
                        >
                            {t("Operations.saveDistribution")}
                        </button>
                    </div>
                </div>
            )}

            {/* Operations Schedule */}
            <div className="rounded-xl border border-gray-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5">
                    <h2 className="font-bold text-gray-800">
                        {t("Operations.scheduleTitle")}
                    </h2>

                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="All">{t("Operations.allOperations")}</option>
                        <option value="Attendance">{t("Operations.attendance")}</option>
                        <option value="Departure">{t("Operations.departure")}</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-sm text-gray-600">
                            <tr>
                                <th className="px-5 py-4">{t("Operations.thDate")}</th>
                                <th className="px-5 py-4">{t("Operations.thType")}</th>
                                <th className="px-5 py-4">{t("Operations.thRoute")}</th>
                                <th className="px-5 py-4">{t("Operations.thTime")}</th>
                                <th className="px-5 py-4">{t("Operations.thRequestedAssigned")}</th>
                                <th className="px-5 py-4">{t("Operations.thStatus")}</th>
                                <th className="px-5 py-4">{t("Operations.thActions")}</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {filteredOperations.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="7"
                                        className="py-10 text-center text-gray-500"
                                    >
                                        {t("Operations.noOperations")}
                                    </td>
                                </tr>
                            ) : (
                                filteredOperations.map((operation) => {
                                    const assignedCount =
                                        operation.assignedVehicles?.length || 0;

                                    const operationRoute = routes.find(
                                        (route) => route.name === operation.route
                                    );

                                    return (
                                        <tr
                                            key={operation.id}
                                            className="text-sm"
                                        >
                                            <td className="px-5 py-4">
                                                {operation.date}
                                            </td>

                                            <td className="px-5 py-4">
                                                {getTypeLabel(operation.type)}
                                            </td>

                                            <td className="px-5 py-4 font-medium">
                                                {operation.route}
                                            </td>

                                            <td className="px-5 py-4">
                                                {formatTime12Hour(operation.time) || operation.time}
                                            </td>

                                            <td className="px-5 py-4">
                                                <p className="font-semibold">
                                                    {assignedCount} / {operation.vehiclesCount}
                                                </p>

                                                {operation.requestedStopAllocations &&
                                                    Object.keys(
                                                        operation.requestedStopAllocations
                                                    ).length > 0 && (
                                                        <div className="mt-2 space-y-1">
                                                            {operationRoute?.stops.map((stop) => {
                                                                const requested =
                                                                    Number(
                                                                        operation.requestedStopAllocations[stop.id]
                                                                    ) || 0;

                                                                const assigned =
                                                                    Object.values(
                                                                        operation.vehicleAssignments || {}
                                                                    ).filter(
                                                                        (stopId) =>
                                                                            Number(stopId) === Number(stop.id)
                                                                    ).length;

                                                                if (requested === 0) return null;

                                                                return (
                                                                    <p
                                                                        key={stop.id}
                                                                        className="text-xs text-gray-500"
                                                                    >
                                                                        {stop.name}: {assigned}/{requested}
                                                                    </p>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                {operation.assignedVehicles?.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {operation.assignedVehicles.map((vehicleId) => {
                                                            const vehicle = vehicles.find(
                                                                (item) =>
                                                                    Number(item.id) === Number(vehicleId)
                                                            );

                                                            return vehicle ? (
                                                                <span
                                                                    key={vehicleId}
                                                                    className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700"
                                                                >
                                                                    {vehicle.number || vehicle.name}
                                                                </span>
                                                            ) : null;
                                                        })}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-5 py-4">
                                                <span
                                                    className={`rounded-full px-3 py-1 text-xs ${getStatusStyle(
                                                        operation.status
                                                    )}`}
                                                >
                                                    {getStatusLabel(operation.status)}
                                                </span>
                                            </td>

                                            <td className="px-5 py-4">
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() =>
                                                            handleOpenDistribution(operation)
                                                        }
                                                        className="text-sm font-medium text-green-600 hover:text-green-700"
                                                    >
                                                        {t("Operations.distribute")}
                                                    </button>

                                                    <button
                                                        onClick={() => handleEdit(operation)}
                                                        className="text-blue-600"
                                                        aria-label={t("Operations.editOperationAria")}
                                                    >
                                                        <Pencil size={17} />
                                                    </button>

                                                    <button
                                                        onClick={() => handleDelete(operation.id)}
                                                        className="text-red-600"
                                                        aria-label={t("Operations.deleteOperationAria")}
                                                    >
                                                        <Trash2 size={17} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <RecurringScheduleModal
                isOpen={showRecurringModal}
                onClose={() => setShowRecurringModal(false)}
            />

            <ConfirmModal
                isOpen={confirmDelete.open}
                title={t("Operations.deleteModalTitle")}
                message={t("Operations.deleteModalMessage")}
                confirmLabel={t("Operations.deleteModalConfirm")}
                onConfirm={confirmDeleteOperation}
                onCancel={() => setConfirmDelete({ open: false, id: null })}
            />

            <ConfirmModal
                isOpen={confirmEdit.open}
                title={t("Operations.clearDistributionTitle")}
                message={t("Operations.clearDistributionMessage")}
                confirmLabel={t("Operations.clearDistributionConfirm")}
                onConfirm={confirmEditAndClear}
                onCancel={() =>
                    setConfirmEdit({ open: false, operationData: null })
                }
            />

            <AlertModal
                isOpen={alertModal.open}
                title={alertModal.title}
                message={alertModal.message}
                type="warning"
                onClose={() =>
                    setAlertModal({
                        open: false,
                        message: "",
                        title: t("Operations.validationErrorTitle"),
                    })
                }
            />
        </div>
    );
}

function StatCard({ title, value }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-2 text-2xl font-bold text-gray-800">
                {value}
            </p>
        </div>
    );
}

function FormField({ label, children }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
                {label}
            </label>
            {children}
        </div>
    );
}

export default Operations;