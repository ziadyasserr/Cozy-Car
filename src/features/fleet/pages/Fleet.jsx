
import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useFleet } from "../../../context/FleetContext";
import StatCard from "../../../components/ui/StatCard";
import FormField from "../../../components/ui/FormField";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import AlertModal from "../../../components/ui/AlertModal";

const emptyForm = {
    number: "",
    type: "Bus",
    status: "Active",
};

function Fleet() {
    const { t } = useTranslation();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(emptyForm);
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split("T")[0]
    );
    const [confirmDelete, setConfirmDelete] = useState({
        open: false,
        id: null,
    });
    const [alertModal, setAlertModal] = useState({
        open: false,
        message: "",
    });

    const {
        vehicles,
        setVehicles,
        dailyAvailability,
        setDailyAvailability,
    } = useFleet();

    const totalBuses = vehicles.filter(
        (vehicle) => vehicle.type === "Bus"
    ).length;

    const totalCoasters = vehicles.filter(
        (vehicle) => vehicle.type === "Coaster"
    ).length;

    const todayAvailability = dailyAvailability[selectedDate] || {};

    // Active vehicles are available by default unless manually marked unavailable.
    const isVehicleAvailable = (vehicle) => {
        if (vehicle.status !== "Active") return false;

        return todayAvailability[vehicle.id] !== "Unavailable";
    };

    const availableVehicles = vehicles.filter(
        isVehicleAvailable
    ).length;

    const unavailableVehicles = vehicles.length - availableVehicles;

    function handleChange(event) {
        const { name, value } = event.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    }

    function handleSubmit(event) {
        event.preventDefault();

        const vehicleNumber = formData.number.trim();

        if (!vehicleNumber) return;

        const isDuplicate = vehicles.some(
            (vehicle) =>
                vehicle.number.toLowerCase() === vehicleNumber.toLowerCase() &&
                vehicle.id !== editingId
        );

        if (isDuplicate) {
            setAlertModal({
                open: true,
                message: t("Fleet.alerts.duplicateVehicle"),
            });
            return;
        }

        if (editingId !== null) {
            setVehicles((prev) =>
                prev.map((vehicle) =>
                    vehicle.id === editingId
                        ? { ...vehicle, ...formData, number: vehicleNumber }
                        : vehicle
                )
            );

            // A vehicle under maintenance or inactive cannot be available.
            if (
                formData.status === "Maintenance" ||
                formData.status === "Inactive"
            ) {
                setDailyAvailability((prev) => {
                    const updated = { ...prev };

                    Object.keys(updated).forEach((date) => {
                        updated[date] = { ...updated[date] };
                        delete updated[date][editingId];
                    });

                    return updated;
                });
            }
        } else {
            setVehicles((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    ...formData,
                    number: vehicleNumber,
                },
            ]);
        }

        closeForm();
    }

    function handleEdit(vehicle) {
        setFormData({
            number: vehicle.number,
            type: vehicle.type,
            status: vehicle.status,
        });

        setEditingId(vehicle.id);
        setShowForm(true);
    }

    function handleDelete(id) {
        setConfirmDelete({ open: true, id });
    }

    function confirmDeleteVehicle() {
        const id = confirmDelete.id;

        setVehicles((prev) =>
            prev.filter((vehicle) => vehicle.id !== id)
        );

        setDailyAvailability((prev) => {
            const updated = { ...prev };

            Object.keys(updated).forEach((date) => {
                updated[date] = { ...updated[date] };
                delete updated[date][id];
            });

            return updated;
        });

        setConfirmDelete({ open: false, id: null });
    }

    function handleAvailabilityChange(vehicleId, value) {
        setDailyAvailability((prev) => {
            const updatedDate = { ...prev[selectedDate] };

            if (value === "Available") {
                // Remove the override and return to the default available state.
                delete updatedDate[vehicleId];
            } else {
                updatedDate[vehicleId] = "Unavailable";
            }

            return {
                ...prev,
                [selectedDate]: updatedDate,
            };
        });
    }

    function closeForm() {
        setShowForm(false);
        setEditingId(null);
        setFormData(emptyForm);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {t("Fleet.title")}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {t("Fleet.description")}
                    </p>
                </div>

                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus size={18} />
                    {t("Fleet.addVehicle")}
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard title={t("Fleet.totalVehicles")} value={vehicles.length} />
                <StatCard title={t("Fleet.totalBuses")} value={totalBuses} />
                <StatCard title={t("Fleet.totalCoasters")} value={totalCoasters} />
            </div>

            {showForm && (
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                    <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-800">
                            {editingId !== null ? t("Fleet.editVehicle") : t("Fleet.addNewVehicle")}
                        </h2>

                        <button
                            onClick={closeForm}
                            className="text-gray-500 hover:text-gray-800"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className="grid gap-4 sm:grid-cols-3"
                    >
                        <FormField label={t("Fleet.vehicleNumberLabel")}>
                            <input
                                name="number"
                                value={formData.number}
                                onChange={handleChange}
                                placeholder={t("Fleet.vehicleNumberPlaceholder")}
                                className="form-input"
                                required
                            />
                        </FormField>

                        <FormField label={t("Fleet.vehicleTypeLabel")}>
                            <select
                                name="type"
                                value={formData.type}
                                onChange={handleChange}
                                className="form-input"
                            >
                                <option value="Bus">{t("Fleet.types.bus")}</option>
                                <option value="Coaster">{t("Fleet.types.coaster")}</option>
                            </select>
                        </FormField>

                        <FormField label={t("Fleet.generalStatusLabel")}>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="form-input"
                            >
                                <option value="Active">{t("Fleet.statuses.active")}</option>
                                <option value="Maintenance">{t("Fleet.statuses.maintenance")}</option>
                                <option value="Inactive">{t("Fleet.statuses.inactive")}</option>
                            </select>
                        </FormField>

                        <div className="flex gap-2 sm:col-span-3">
                            <button
                                type="submit"
                                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                {editingId !== null ? t("Fleet.saveChanges") : t("Fleet.addVehicle")}
                            </button>

                            <button
                                type="button"
                                onClick={closeForm}
                                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
                            >
                                {t("Fleet.cancel")}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">
                            {t("Fleet.dailyAvailability")}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {t("Fleet.dailyAvailabilityDesc")}
                        </p>
                    </div>

                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2"
                    />
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <StatCard title={t("Fleet.available")} value={availableVehicles} />
                    <StatCard title={t("Fleet.unavailable")} value={unavailableVehicles} />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-4 py-3 font-medium">{t("Fleet.thVehicle")}</th>
                                <th className="px-4 py-3 font-medium">{t("Fleet.thType")}</th>
                                <th className="px-4 py-3 font-medium">{t("Fleet.thAvailability")}</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {vehicles.map((vehicle) => {
                                const isDisabled =
                                    vehicle.status !== "Active";

                                const availability = isVehicleAvailable(vehicle)
                                    ? "Available"
                                    : "Unavailable";

                                return (
                                    <tr key={vehicle.id}>
                                        <td className="px-4 py-3 font-medium text-gray-800">
                                            {vehicle.number}
                                        </td>

                                        <td className="px-4 py-3 text-gray-500">
                                            {vehicle.type === "Bus"
                                                ? t("Fleet.types.bus")
                                                : vehicle.type === "Coaster"
                                                    ? t("Fleet.types.coaster")
                                                    : vehicle.type}
                                        </td>

                                        <td className="px-4 py-3">
                                            <select
                                                value={availability}
                                                disabled={isDisabled}
                                                onChange={(event) =>
                                                    handleAvailabilityChange(
                                                        vehicle.id,
                                                        event.target.value
                                                    )
                                                }
                                                className="rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                                            >
                                                <option value="Available">
                                                    {t("Fleet.available")}
                                                </option>
                                                <option value="Unavailable">
                                                    {t("Fleet.unavailable")}
                                                </option>
                                            </select>

                                            {isDisabled && (
                                                <p className="mt-1 text-xs text-red-500">
                                                    {t("Fleet.vehicleIsStatus", {
                                                        status:
                                                            vehicle.status === "Active"
                                                                ? t("Fleet.statuses.active")
                                                                : vehicle.status === "Maintenance"
                                                                    ? t("Fleet.statuses.maintenance")
                                                                    : vehicle.status === "Inactive"
                                                                        ? t("Fleet.statuses.inactive")
                                                                        : vehicle.status,
                                                    })}
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}

                            {vehicles.length === 0 && (
                                <tr>
                                    <td
                                        colSpan="3"
                                        className="px-4 py-8 text-center text-gray-500"
                                    >
                                        {t("Fleet.noVehiclesFound")}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 p-5">
                    <h2 className="font-semibold text-gray-800">
                        {t("Fleet.allVehicles")}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                        {t("Fleet.registeredVehiclesCount", { count: vehicles.length })}
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-5 py-4 font-medium">{t("Fleet.thIndex")}</th>
                                <th className="px-5 py-4 font-medium">{t("Fleet.thVehicle")}</th>
                                <th className="px-5 py-4 font-medium">{t("Fleet.thType")}</th>
                                <th className="px-5 py-4 font-medium">{t("Fleet.thStatus")}</th>
                                <th className="px-5 py-4 font-medium">{t("Fleet.thActions")}</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {vehicles.map((vehicle, index) => (
                                <tr key={vehicle.id} className="hover:bg-gray-50">
                                    <td className="px-5 py-4 text-gray-500">
                                        {index + 1}
                                    </td>

                                    <td className="px-5 py-4 font-semibold text-gray-800">
                                        {vehicle.number}
                                    </td>

                                    <td className="px-5 py-4 text-gray-600">
                                        {vehicle.type === "Bus"
                                            ? t("Fleet.types.bus")
                                            : vehicle.type === "Coaster"
                                                ? t("Fleet.types.coaster")
                                                : vehicle.type}
                                    </td>

                                    <td className="px-5 py-4 text-gray-600">
                                        {vehicle.status === "Active"
                                            ? t("Fleet.statuses.active")
                                            : vehicle.status === "Maintenance"
                                                ? t("Fleet.statuses.maintenance")
                                                : vehicle.status === "Inactive"
                                                    ? t("Fleet.statuses.inactive")
                                                    : vehicle.status}
                                    </td>

                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => handleEdit(vehicle)}
                                                className="text-blue-600 hover:text-blue-800"
                                                title={t("Fleet.editTooltip")}
                                            >
                                                <Pencil size={17} />
                                            </button>

                                            <button
                                                onClick={() => handleDelete(vehicle.id)}
                                                className="text-red-500 hover:text-red-700"
                                                title={t("Fleet.deleteTooltip")}
                                            >
                                                <Trash2 size={17} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {vehicles.length === 0 && (
                                <tr>
                                    <td
                                        colSpan="5"
                                        className="px-5 py-10 text-center text-gray-500"
                                    >
                                        {t("Fleet.noVehiclesFound")}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmDelete.open}
                title={t("Fleet.deleteModalTitle")}
                message={t("Fleet.deleteModalMessage")}
                confirmLabel={t("Fleet.deleteModalConfirm")}
                onConfirm={confirmDeleteVehicle}
                onCancel={() => setConfirmDelete({ open: false, id: null })}
            />

            <AlertModal
                isOpen={alertModal.open}
                title={t("Fleet.duplicateAlertTitle")}
                message={alertModal.message}
                type="warning"
                onClose={() => setAlertModal({ open: false, message: "" })}
            />
        </div>
    );
}

export default Fleet;

