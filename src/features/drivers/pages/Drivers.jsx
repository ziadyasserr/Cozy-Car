import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, X, Bus } from "lucide-react";
import { useDrivers } from "../../../context/DriversContext";
import { useFleet } from "../../../context/FleetContext";
import StatCard from "../../../components/ui/StatCard";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import AlertModal from "../../../components/ui/AlertModal";

const FIXED_TYPE = "Fixed Vehicle Driver";
const SHIFT_TYPE = "Shift Driver";

const FIRST_SHIFT = "00:00-12:00";
const SECOND_SHIFT = "12:00-00:00";
const FULL_DAY_SHIFT = "00:00-24:00";

const MODE_SINGLE = "single"; // one fixed driver, whole day -> "Fixed"
const MODE_DUAL = "dual"; // two drivers, 12 hours each

const SHIFT_OPTIONS = [
    { value: FIRST_SHIFT, labelKey: "Drivers.shifts.firstShift" },
    { value: SECOND_SHIFT, labelKey: "Drivers.shifts.secondShift" },
];

const SHIFT_LABELS = [
    ...SHIFT_OPTIONS,
    { value: FULL_DAY_SHIFT, labelKey: "Drivers.shifts.fullDay" },
];

const MODE_OPTIONS = [
    { value: MODE_SINGLE, labelKey: "Drivers.modes.single" },
    { value: MODE_DUAL, labelKey: "Drivers.modes.dual" },
];

const emptyForm = {
    name: "",
    phone: "",
    status: "Active",
    driverType: SHIFT_TYPE,
    vehicleId: "",
    fixedMode: MODE_SINGLE,
    fixedShift: FULL_DAY_SHIFT,
};

// Legacy drivers (saved before fixedMode existed) follow the old rule: two drivers per vehicle.
function getDriverMode(driver) {
    return driver.fixedMode || MODE_DUAL;
}

function getDriverShift(driver) {
    if (driver.fixedShift) return driver.fixedShift;
    return getDriverMode(driver) === MODE_SINGLE
        ? FULL_DAY_SHIFT
        : FIRST_SHIFT;
}

function Drivers() {
    const { t } = useTranslation();
    const { drivers, setDrivers } = useDrivers();
    const { vehicles } = useFleet();

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [confirmDelete, setConfirmDelete] = useState({
        open: false,
        id: null,
    });

    const [alertModal, setAlertModal] = useState({
        open: false,
        message: "",
    });

    const [formData, setFormData] = useState(emptyForm);

    const isFixedForm = formData.driverType === FIXED_TYPE;
    const isDualForm = formData.fixedMode === MODE_DUAL;

    // Fixed drivers excluding the one currently being edited
    const otherFixedDrivers = drivers.filter(
        (driver) => driver.driverType === FIXED_TYPE && driver.id !== editingId
    );

    const getVehicleFixedDrivers = (vehicleId) =>
        otherFixedDrivers.filter(
            (driver) => Number(driver.vehicleId) === Number(vehicleId)
        );

    const getFreeShifts = (vehicleId) => {
        const takenShifts = getVehicleFixedDrivers(vehicleId).map(
            getDriverShift
        );
        return SHIFT_OPTIONS.filter(
            (option) => !takenShifts.includes(option.value)
        );
    };

    const canSelectVehicle = (vehicleId, mode) => {
        const vehicleDrivers = getVehicleFixedDrivers(vehicleId);

        if (vehicleDrivers.length === 0) return true;

        // Single (Fixed) mode needs a completely free vehicle
        if (mode === MODE_SINGLE) return false;

        // Vehicle already has a full-day fixed driver
        if (
            vehicleDrivers.some(
                (driver) => getDriverMode(driver) === MODE_SINGLE
            )
        ) {
            return false;
        }

        // Dual vehicle: only selectable while one shift is still free
        return vehicleDrivers.length < 2;
    };

    const activeVehicles = vehicles.filter(
        (vehicle) => vehicle.status === "Active"
    );

    const editingDriver = drivers.find((driver) => driver.id === editingId);

    const selectableVehicles = activeVehicles.filter(
        (vehicle) =>
            canSelectVehicle(vehicle.id, formData.fixedMode) ||
            (editingDriver &&
                Number(editingDriver.vehicleId) === Number(vehicle.id) &&
                canSelectVehicle(vehicle.id, formData.fixedMode))
    );

    const availableShiftOptions = formData.vehicleId
        ? getFreeShifts(formData.vehicleId)
        : SHIFT_OPTIONS;

    const resetForm = () => {
        setFormData(emptyForm);
        setEditingId(null);
        setShowForm(false);
    };

    const handleDriverTypeChange = (driverType) => {
        setFormData((prev) => ({
            ...prev,
            driverType,
            vehicleId: driverType === FIXED_TYPE ? prev.vehicleId : "",
            fixedMode: driverType === FIXED_TYPE ? prev.fixedMode : MODE_SINGLE,
            fixedShift:
                driverType === FIXED_TYPE ? prev.fixedShift : FULL_DAY_SHIFT,
        }));
    };

    const handleModeChange = (mode) => {
        setFormData((prev) => ({
            ...prev,
            fixedMode: mode,
            vehicleId: "",
            fixedShift: mode === MODE_SINGLE ? FULL_DAY_SHIFT : FIRST_SHIFT,
        }));
    };

    const handleVehicleChange = (vehicleId) => {
        setFormData((prev) => {
            if (prev.fixedMode === MODE_SINGLE) {
                return { ...prev, vehicleId, fixedShift: FULL_DAY_SHIFT };
            }

            const freeShifts = vehicleId ? getFreeShifts(vehicleId) : [];

            return {
                ...prev,
                vehicleId,
                fixedShift: freeShifts.some(
                    (shift) => shift.value === prev.fixedShift
                )
                    ? prev.fixedShift
                    : freeShifts[0]?.value || FIRST_SHIFT,
            };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const trimmedName = formData.name.trim();

        if (!trimmedName) {
            setAlertModal({
                open: true,
                message: t("Drivers.alerts.nameRequired"),
            });
            return;
        }

        const duplicateName = drivers.some(
            (driver) =>
                driver.name.toLowerCase() === trimmedName.toLowerCase() &&
                driver.id !== editingId
        );

        if (duplicateName) {
            setAlertModal({
                open: true,
                message: t("Drivers.alerts.nameExists"),
            });
            return;
        }

        if (isFixedForm) {
            if (!formData.vehicleId) {
                setAlertModal({
                    open: true,
                    message: t("Drivers.alerts.selectFixedVehicle"),
                });
                return;
            }

            if (!canSelectVehicle(formData.vehicleId, formData.fixedMode)) {
                setAlertModal({
                    open: true,
                    message: t("Drivers.alerts.shiftConflict"),
                });
                return;
            }

            if (isDualForm) {
                const shiftIsFree = getFreeShifts(formData.vehicleId).some(
                    (shift) => shift.value === formData.fixedShift
                );

                if (!shiftIsFree) {
                    setAlertModal({
                        open: true,
                        message: t("Drivers.alerts.shiftTaken"),
                    });
                    return;
                }
            }
        }

        const driverData = {
            ...formData,
            name: trimmedName,
            vehicleId: isFixedForm ? Number(formData.vehicleId) : "",
            fixedMode: isFixedForm ? formData.fixedMode : "",
            fixedShift: isFixedForm
                ? isDualForm
                    ? formData.fixedShift
                    : FULL_DAY_SHIFT
                : "",
        };

        if (editingId !== null) {
            setDrivers((prev) =>
                prev.map((driver) =>
                    driver.id === editingId
                        ? { ...driver, ...driverData }
                        : driver
                )
            );
        } else {
            setDrivers((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    ...driverData,
                },
            ]);
        }

        resetForm();
    };

    const handleEdit = (driver) => {
        const isFixed = driver.driverType === FIXED_TYPE;

        setFormData({
            name: driver.name || "",
            phone: driver.phone || "",
            status: driver.status || "Active",
            driverType: driver.driverType || SHIFT_TYPE,
            vehicleId: driver.vehicleId ? String(driver.vehicleId) : "",
            fixedMode: isFixed ? getDriverMode(driver) : MODE_SINGLE,
            fixedShift: isFixed ? getDriverShift(driver) : FULL_DAY_SHIFT,
        });

        setEditingId(driver.id);
        setShowForm(true);
    };

    const handleDelete = (id) => {
        setConfirmDelete({
            open: true,
            id,
        });
    };

    const confirmDeleteDriver = () => {
        setDrivers((prev) =>
            prev.filter((driver) => driver.id !== confirmDelete.id)
        );

        setConfirmDelete({
            open: false,
            id: null,
        });
    };

    const getVehicle = (vehicleId) =>
        vehicles.find(
            (vehicle) => Number(vehicle.id) === Number(vehicleId)
        );

    const getShiftLabel = (shift) => {
        const option = SHIFT_LABELS.find((opt) => opt.value === shift);
        return option ? t(option.labelKey) : "-";
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {t("Drivers.title")}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {t("Drivers.description")}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setFormData(emptyForm);
                        setEditingId(null);
                        setShowForm(true);
                    }}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                    <Plus size={18} />
                    {t("Drivers.addDriver")}
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard title={t("Drivers.totalDrivers")} value={drivers.length} />

                <StatCard
                    title={t("Drivers.activeDrivers")}
                    value={
                        drivers.filter((driver) => driver.status === "Active")
                            .length
                    }
                />

                <StatCard
                    title={t("Drivers.inactiveDrivers")}
                    value={
                        drivers.filter(
                            (driver) => driver.status === "Inactive"
                        ).length
                    }
                />
            </div>

            {showForm && (
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                    <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-800">
                            {editingId !== null
                                ? t("Drivers.editDriver")
                                : t("Drivers.addNewDriver")}
                        </h2>

                        <button
                            type="button"
                            onClick={resetForm}
                            className="text-gray-500"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                    >
                        <div>
                            <label className="mb-2 block text-sm font-medium">
                                {t("Drivers.driverName")}
                            </label>
                            <input
                                required
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        name: e.target.value,
                                    }))
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                                placeholder={t("Drivers.driverNamePlaceholder")}
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">
                                {t("Drivers.phoneNumber")}
                            </label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        phone: e.target.value,
                                    }))
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                                placeholder={t("Drivers.phoneNumberPlaceholder")}
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">
                                {t("Drivers.driverType")}
                            </label>
                            <select
                                value={formData.driverType}
                                onChange={(e) =>
                                    handleDriverTypeChange(e.target.value)
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                            >
                                <option value={SHIFT_TYPE}>
                                    {t("Drivers.shiftDriver")}
                                </option>
                                <option value={FIXED_TYPE}>
                                    {t("Drivers.fixedVehicleDriver")}
                                </option>
                            </select>
                        </div>

                        {isFixedForm && (
                            <>
                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        {t("Drivers.assignmentType")}
                                    </label>
                                    <select
                                        value={formData.fixedMode}
                                        onChange={(e) =>
                                            handleModeChange(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                                    >
                                        {MODE_OPTIONS.map((mode) => (
                                            <option
                                                key={mode.value}
                                                value={mode.value}
                                            >
                                                {t(mode.labelKey)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        {t("Drivers.fixedVehicle")}
                                    </label>
                                    <select
                                        required
                                        value={formData.vehicleId}
                                        onChange={(e) =>
                                            handleVehicleChange(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                                    >
                                        <option value="">
                                            {t("Drivers.selectFixedVehicle")}
                                        </option>

                                        {selectableVehicles.map((vehicle) => (
                                            <option
                                                key={vehicle.id}
                                                value={vehicle.id}
                                            >
                                                {vehicle.number} - {vehicle.type}
                                            </option>
                                        ))}
                                    </select>

                                    {selectableVehicles.length === 0 && (
                                        <p className="mt-1 text-xs text-amber-600">
                                            {t("Drivers.noVehiclesAvailable")}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        {t("Drivers.fixedShift")}
                                    </label>

                                    {isDualForm ? (
                                        <select
                                            value={formData.fixedShift}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    fixedShift: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                                        >
                                            {availableShiftOptions.map(
                                                (shift) => (
                                                    <option
                                                        key={shift.value}
                                                        value={shift.value}
                                                    >
                                                        {t(shift.labelKey)}
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    ) : (
                                        <input
                                            disabled
                                            value={getShiftLabel(
                                                FULL_DAY_SHIFT
                                            )}
                                            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
                                        />
                                    )}
                                </div>
                            </>
                        )}

                        <div>
                            <label className="mb-2 block text-sm font-medium">
                                {t("Drivers.status")}
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        status: e.target.value,
                                    }))
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                            >
                                <option value="Active">{t("Drivers.statusActive")}</option>
                                <option value="Inactive">{t("Drivers.statusInactive")}</option>
                            </select>
                        </div>

                        <div className="flex gap-2 md:col-span-2 lg:col-span-3">
                            <button
                                type="submit"
                                className="rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
                            >
                                {editingId !== null
                                    ? t("Drivers.saveChanges")
                                    : t("Drivers.addDriver")}
                            </button>

                            <button
                                type="button"
                                onClick={resetForm}
                                className="rounded-lg bg-gray-100 px-5 py-2 text-gray-700"
                            >
                                {t("Drivers.cancel")}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-sm text-gray-600">
                            <tr>
                                <th className="px-6 py-4">{t("Drivers.thDriverName")}</th>
                                <th className="px-6 py-4">{t("Drivers.thPhone")}</th>
                                <th className="px-6 py-4">{t("Drivers.thDriverType")}</th>
                                <th className="px-6 py-4">{t("Drivers.thFixedVehicle")}</th>
                                <th className="px-6 py-4">{t("Drivers.thFixedShift")}</th>
                                <th className="px-6 py-4">{t("Drivers.thStatus")}</th>
                                <th className="px-6 py-4">{t("Drivers.thActions")}</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {drivers.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="7"
                                        className="px-6 py-10 text-center text-gray-500"
                                    >
                                        {t("Drivers.noDriversAdded")}
                                    </td>
                                </tr>
                            ) : (
                                drivers.map((driver) => {
                                    const isFixed =
                                        driver.driverType === FIXED_TYPE;

                                    const vehicle = isFixed
                                        ? getVehicle(driver.vehicleId)
                                        : null;

                                    const isSingle =
                                        isFixed &&
                                        getDriverMode(driver) === MODE_SINGLE;

                                    return (
                                        <tr
                                            key={driver.id}
                                            className="text-sm"
                                        >
                                            <td className="px-6 py-4 font-medium text-gray-800">
                                                {driver.name}
                                            </td>

                                            <td className="px-6 py-4 text-gray-600">
                                                {driver.phone || "-"}
                                            </td>

                                            <td className="px-6 py-4">
                                                <span
                                                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                                                        isFixed
                                                            ? "bg-blue-100 text-blue-700"
                                                            : "bg-purple-100 text-purple-700"
                                                    }`}
                                                >
                                                    {isFixed
                                                        ? t("Drivers.fixedVehicleBadge")
                                                        : t("Drivers.shiftDriverBadge")}
                                                </span>
                                            </td>

                                            <td className="px-6 py-4 text-gray-600">
                                                {isFixed ? (
                                                    <div className="flex items-center gap-2">
                                                        <Bus size={16} />
                                                        {vehicle?.number ||
                                                            t("Drivers.unknownVehicle")}
                                                        <span
                                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                                isSingle
                                                                    ? "bg-emerald-100 text-emerald-700"
                                                                    : "bg-amber-100 text-amber-700"
                                                            }`}
                                                        >
                                                            {isSingle
                                                                ? t("Drivers.fixedBadge")
                                                                : t("Drivers.dualBadge")}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    "-"
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-gray-600">
                                                {isFixed
                                                    ? getShiftLabel(
                                                        getDriverShift(driver)
                                                    )
                                                    : "-"}
                                            </td>

                                            <td className="px-6 py-4">
                                                <span
                                                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                                                        driver.status ===
                                                        "Active"
                                                            ? "bg-green-100 text-green-700"
                                                            : "bg-gray-100 text-gray-600"
                                                    }`}
                                                >
                                                    {driver.status === "Active"
                                                        ? t("Drivers.statusActive")
                                                        : t("Drivers.statusInactive")}
                                                </span>
                                            </td>

                                            <td className="px-6 py-4">
                                                <div className="flex gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleEdit(driver)
                                                        }
                                                        className="text-blue-600 hover:text-blue-800"
                                                        aria-label={t("Drivers.editDriverAria", { name: driver.name })}
                                                    >
                                                        <Pencil size={17} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleDelete(
                                                                driver.id
                                                            )
                                                        }
                                                        className="text-red-600 hover:text-red-800"
                                                        aria-label={t("Drivers.deleteDriverAria", { name: driver.name })}
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

            <ConfirmModal
                isOpen={confirmDelete.open}
                title={t("Drivers.deleteModalTitle")}
                message={t("Drivers.deleteModalMessage")}
                confirmLabel={t("Drivers.deleteModalConfirm")}
                onConfirm={confirmDeleteDriver}
                onCancel={() =>
                    setConfirmDelete({ open: false, id: null })
                }
            />

            <AlertModal
                isOpen={alertModal.open}
                title={t("Drivers.validationErrorTitle")}
                message={alertModal.message}
                type="warning"
                onClose={() =>
                    setAlertModal({ open: false, message: "" })
                }
            />
        </div>
    );
}

export default Drivers;
