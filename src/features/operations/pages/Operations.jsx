
import { useState } from "react";
import { Plus, Trash2, Pencil, X, Clock, Sparkles } from "lucide-react";

import { useFleet } from "../../../context/FleetContext";
import { useOperations } from "../../../context/OperationsContext";
import { useRoutes } from "../../../context/RoutesContext";
import RecurringScheduleModal from "../components/RecurringScheduleModal";
import OperatingAssistant from "../../../components/common/OperatingAssistant";

const emptyForm = {
    date: new Date().toISOString().split("T")[0],
    type: "Attendance",
    route: "المؤسسة",
    time: "",
    vehiclesCount: "",
};

function Operations() {
    const { operations, setOperations } = useOperations();
    const { vehicles, dailyAvailability } = useFleet();
    const { routes } = useRoutes();

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

    const selectedRoute = selectedOperation
        ? routes.find(
            (route) => route.name === selectedOperation.route
        )
        : null;

    const selectedDateAvailability = selectedOperation
        ? dailyAvailability[selectedOperation.date] || {}
        : {};

    const availableVehicles = selectedOperation
        ? vehicles.filter(
            (vehicle) =>
                vehicle.status === "Active" &&
                selectedDateAvailability[vehicle.id] === "Available"
        )
        : [];

    const currentRoute = routes.find(
        (route) => route.name === formData.route
    );

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
            alert("Please complete all fields correctly.");
            return;
        }

        const operationData = {
            ...formData,
            vehiclesCount,
        };

        if (editingId) {
            setOperations((prev) =>
                prev.map((operation) =>
                    operation.id === editingId
                        ? {
                            ...operation,
                            ...operationData,
                        }
                        : operation
                )
            );
        } else {
            setOperations((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    ...operationData,
                    status: "Pending",
                    requestedStopAllocations: {},
                    vehicleAssignments: {},
                    assignedVehicles: [],
                    stopAllocations: [],
                },
            ]);
        }

        resetForm();
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
        if (!window.confirm("Delete this operation?")) return;

        setOperations((prev) =>
            prev.filter((operation) => operation.id !== id)
        );

        if (selectedOperation?.id === id) {
            handleCloseDistribution();
        }
    };

    const handleOpenDistribution = (operation) => {
        const route = routes.find(
            (item) => item.name === operation.route
        );

        if (!route) {
            alert("Route not found.");
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
            alert("Please enter valid vehicle counts for every stop.");
            return;
        }

        const totalDemand = demandEntries.reduce(
            (total, item) => total + item.count,
            0
        );

        if (totalDemand !== selectedOperation.vehiclesCount) {
            alert(
                `The stop distribution must equal ${selectedOperation.vehiclesCount} vehicles. Currently: ${totalDemand}.`
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
            alert("Assigned vehicles cannot exceed required vehicles.");
            return;
        }

        const availableVehicleIds = new Set(
            availableVehicles.map((vehicle) => Number(vehicle.id))
        );

        const allVehiclesAvailable = assignments.every((assignment) =>
            availableVehicleIds.has(assignment.vehicleId)
        );

        if (!allVehiclesAvailable) {
            alert("Some selected vehicles are no longer available.");
            return;
        }

        const validStopIds = new Set(
            selectedRoute.stops.map((stop) => Number(stop.id))
        );

        const allStopsValid = assignments.every((assignment) =>
            validStopIds.has(assignment.stopId)
        );

        if (!allStopsValid) {
            alert("Please select a valid stop for every vehicle.");
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
            alert(
                "Assigned vehicles cannot exceed the requested vehicles for a stop."
            );
            return;
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

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-gray-800">
                            Daily Operations
                        </h1>
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                            AI Guided
                        </span>
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                        Manage daily attendance and departure requests with smart recommendations
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowRecurringModal(true)}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 transition active:scale-95"
                    >
                        <Sparkles size={16} className="text-amber-300" />
                        Intelligent Daily Scheduler
                    </button>

                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-95"
                    >
                        <Plus size={18} />
                        Add Operation
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
                    title="Total Operations"
                    value={filteredOperations.length}
                />

                <StatCard
                    title="Required Vehicles"
                    value={totalVehicles}
                />

                <StatCard
                    title="Pending Distribution"
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
                            {editingId ? "Edit Operation" : "Add New Operation"}
                        </h2>

                        <button type="button" onClick={resetForm}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <FormField label="Operation Date">
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

                        <FormField label="Operation Type">
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
                                <option value="Attendance">Attendance</option>
                                <option value="Departure">Departure</option>
                            </select>
                        </FormField>

                        <FormField label="Route">
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

                        <FormField label="Scheduled Time">
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
                                    ? "Time when the vehicle should be at the stop."
                                    : "Time when the vehicle leaves the company."}
                            </p>
                        </FormField>

                        <FormField label="Required Vehicles">
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
                                placeholder="Enter number of vehicles"
                            />
                        </FormField>
                    </div>

                    <div className="mt-5 flex gap-2">
                        <button
                            type="submit"
                            className="rounded-lg bg-blue-600 px-5 py-2 text-white"
                        >
                            {editingId ? "Save Changes" : "Add Operation"}
                        </button>

                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded-lg bg-gray-100 px-5 py-2 text-gray-700"
                        >
                            Cancel
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
                                Operation Distribution
                            </h2>

                            <p className="mt-1 text-sm text-gray-500">
                                {selectedOperation.route} -{" "}
                                {selectedOperation.type}
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
                                Required Vehicles
                            </p>
                            <p className="mt-1 text-2xl font-bold text-blue-700">
                                {selectedOperation.vehiclesCount}
                            </p>
                        </div>

                        <div className="rounded-lg bg-green-50 p-4">
                            <p className="text-sm text-gray-500">
                                Assigned Vehicles
                            </p>
                            <p className="mt-1 text-2xl font-bold text-green-700">
                                {allocatedVehicles}
                            </p>
                        </div>

                        <div className="rounded-lg bg-orange-50 p-4">
                            <p className="text-sm text-gray-500">
                                Remaining Vehicles
                            </p>
                            <p className="mt-1 text-2xl font-bold text-orange-700">
                                {selectedOperation.vehiclesCount - allocatedVehicles}
                            </p>
                        </div>
                    </div>

                    {/* Requested Distribution */}
                    <div className="mb-8">
                        <h3 className="font-semibold text-gray-800">
                            1. Requested Distribution
                        </h3>

                        <p className="mb-4 mt-1 text-sm text-gray-500">
                            Enter how many vehicles are required at each stop.
                            The total must equal the operation request.
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
                                                Required vehicles
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
                                                Assigned:{" "}
                                                <strong className="text-gray-800">
                                                    {assigned}
                                                </strong>
                                            </p>

                                            <p className="text-gray-500">
                                                Remaining:{" "}
                                                <strong className="text-orange-600">
                                                    {Math.max(requested - assigned, 0)}
                                                </strong>
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-4">
                            <span className="font-medium text-gray-700">
                                Requested total
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
                            2. Actual Vehicle Assignments
                        </h3>

                        <p className="mb-4 mt-1 text-sm text-gray-500">
                            Assign available vehicles to the requested stops.
                            You can save a partial distribution.
                        </p>

                        {availableVehicles.length === 0 ? (
                            <p className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700">
                                No vehicles available for this date.
                                Check Daily Availability in Fleet.
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
                                                Not Assigned
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
                                Requested vehicles
                            </span>
                            <strong>{requestedTotal}</strong>
                        </div>

                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">
                                Assigned vehicles
                            </span>
                            <strong>{allocatedVehicles}</strong>
                        </div>

                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">
                                Not assigned yet
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
                            You can save the requested distribution even if
                            some vehicles are not assigned yet.
                        </p>

                        <button
                            onClick={handleSaveDistribution}
                            className="rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
                        >
                            Save Distribution
                        </button>
                    </div>
                </div>
            )}

            {/* Operations Schedule */}
            <div className="rounded-xl border border-gray-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5">
                    <h2 className="font-bold text-gray-800">
                        Operations Schedule
                    </h2>

                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="All">All Operations</option>
                        <option value="Attendance">Attendance</option>
                        <option value="Departure">Departure</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-sm text-gray-600">
                            <tr>
                                <th className="px-5 py-4">Date</th>
                                <th className="px-5 py-4">Type</th>
                                <th className="px-5 py-4">Route</th>
                                <th className="px-5 py-4">Time</th>
                                <th className="px-5 py-4">Requested / Assigned</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {filteredOperations.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="7"
                                        className="py-10 text-center text-gray-500"
                                    >
                                        No operations added yet
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
                                                {operation.type}
                                            </td>

                                            <td className="px-5 py-4 font-medium">
                                                {operation.route}
                                            </td>

                                            <td className="px-5 py-4">
                                                {operation.time}
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
                                                    {operation.status}
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
                                                        Distribute
                                                    </button>

                                                    <button
                                                        onClick={() => handleEdit(operation)}
                                                        className="text-blue-600"
                                                        aria-label="Edit operation"
                                                    >
                                                        <Pencil size={17} />
                                                    </button>

                                                    <button
                                                        onClick={() => handleDelete(operation.id)}
                                                        className="text-red-600"
                                                        aria-label="Delete operation"
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
