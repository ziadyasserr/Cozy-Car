import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Users, Bus, Clock } from "lucide-react";
import { useFleet } from "../../../context/FleetContext";
import { useDrivers } from "../../../context/DriversContext";
import { useDriverAssignments } from "../../../context/DriverAssignmentsContext";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import AlertModal from "../../../components/ui/AlertModal";

const FIRST_SHIFT = {
    name: "First Shift",
    startTime: "00:00",
    endTime: "12:00",
};

const SECOND_SHIFT = {
    name: "Second Shift",
    startTime: "12:00",
    endTime: "00:00",
};

// Full day = 00:00 -> 00:00 (next day).
// getAssignmentInterval adds 24 hours when end <= start, so this is a 24h interval.
const FULL_DAY_SHIFT = {
    name: "Full Day",
    startTime: "00:00",
    endTime: "00:00",
};

const SHIFT_TIMES = {
    "First Shift": FIRST_SHIFT,
    "Second Shift": SECOND_SHIFT,
    "Full Day": FULL_DAY_SHIFT,
    "Single Shift": {
        name: "Single Shift",
        startTime: "",
        endTime: "",
    },
};

const emptyForm = {
    vehicleId: "",
    driverId: "",
    shift: "First Shift",
    startTime: FIRST_SHIFT.startTime,
    endTime: FIRST_SHIFT.endTime,
};

function isFullDay(shiftName) {
    return shiftName === FULL_DAY_SHIFT.name;
}

function formatWorkingHours(shiftName, startTime, endTime) {
    if (isFullDay(shiftName)) return "00:00 - 24:00";
    return `${startTime || "--:--"} - ${endTime || "--:--"}`;
}

function endsNextDay(shiftName, startTime, endTime) {
    if (isFullDay(shiftName)) return false;
    if (!startTime || !endTime) return false;
    return endTime <= startTime;
}

function getAssignmentInterval(assignment) {
    if (!assignment.date || !assignment.startTime || !assignment.endTime) {
        return null;
    }

    const start = Date.parse(
        `${assignment.date}T${assignment.startTime}:00Z`
    );

    let end = Date.parse(
        `${assignment.date}T${assignment.endTime}:00Z`
    );

    if (Number.isNaN(start) || Number.isNaN(end)) {
        return null;
    }

    if (end <= start) {
        end += 24 * 60 * 60 * 1000;
    }

    return { start, end };
}

function hasTimeOverlap(first, second) {
    const firstInterval = getAssignmentInterval(first);
    const secondInterval = getAssignmentInterval(second);

    if (!firstInterval || !secondInterval) return false;

    return (
        firstInterval.start < secondInterval.end &&
        secondInterval.start < firstInterval.end
    );
}

function isFixedVehicleDriver(driver) {
    return driver?.driverType === "Fixed Vehicle Driver";
}

function getFixedShift(driver) {
    if (
        driver?.fixedMode === "single" ||
        driver?.fixedShift === "00:00-24:00"
    ) {
        return FULL_DAY_SHIFT;
    }

    return driver?.fixedShift === "12:00-00:00"
        ? SECOND_SHIFT
        : FIRST_SHIFT;
}

function getLocalDate() {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export default function DriverAssignments() {
    const { t } = useTranslation();
    const { vehicles } = useFleet();
    const { drivers } = useDrivers();

    const { driverAssignments, setDriverAssignments } =
        useDriverAssignments();

    const [date, setDate] = useState(getLocalDate);
    const [form, setForm] = useState(emptyForm);

    const [confirmDelete, setConfirmDelete] = useState({
        open: false,
        id: null,
    });

    const [alertModal, setAlertModal] = useState({
        open: false,
        message: "",
    });

    const selectedDayStart = Date.parse(`${date}T00:00:00Z`);
    const selectedDayEnd = selectedDayStart + 24 * 60 * 60 * 1000;

    const todayAssignments = driverAssignments.filter((item) => {
        const interval = getAssignmentInterval(item);

        if (!interval) return false;

        return (
            interval.start < selectedDayEnd &&
            interval.end > selectedDayStart
        );
    });

    const availableVehicles = vehicles.filter(
        (vehicle) => vehicle.status === "Active"
    );

    const activeDrivers = drivers.filter(
        (driver) => driver.status === "Active"
    );

    const availableDrivers = activeDrivers.filter((driver) => {
        if (!form.vehicleId) {
            return !isFixedVehicleDriver(driver);
        }

        if (isFixedVehicleDriver(driver)) {
            return Number(driver.vehicleId) === Number(form.vehicleId);
        }

        return true;
    });

    const selectedDriver = activeDrivers.find(
        (driver) => Number(driver.id) === Number(form.driverId)
    );

    const isSelectedDriverFixed = isFixedVehicleDriver(selectedDriver);

    const handleVehicleChange = (vehicleId) => {
        setForm({
            ...emptyForm,
            vehicleId,
        });
    };

    const handleDriverChange = (driverId) => {
        const driver = activeDrivers.find(
            (item) => Number(item.id) === Number(driverId)
        );

        if (!driver) {
            setForm((prev) => ({
                ...prev,
                driverId: "",
            }));
            return;
        }

        if (isFixedVehicleDriver(driver)) {
            const fixedShift = getFixedShift(driver);

            setForm((prev) => ({
                ...prev,
                driverId,
                shift: fixedShift.name,
                startTime: fixedShift.startTime,
                endTime: fixedShift.endTime,
            }));

            return;
        }

        setForm((prev) => ({
            ...prev,
            driverId,
            shift: "First Shift",
            startTime: FIRST_SHIFT.startTime,
            endTime: FIRST_SHIFT.endTime,
        }));
    };

    const handleShiftChange = (shift) => {
        const shiftData = SHIFT_TIMES[shift];

        setForm((prev) => ({
            ...prev,
            shift,
            startTime: shiftData.startTime,
            endTime: shiftData.endTime,
        }));
    };

    const handleAssign = (e) => {
        e.preventDefault();

        if (!form.vehicleId || !form.driverId) {
            setAlertModal({
                open: true,
                message: t("DriverAssignments.alerts.selectVehicleAndDriver"),
            });
            return;
        }

        if (!date) {
            setAlertModal({
                open: true,
                message: t("DriverAssignments.alerts.selectOperatingDate"),
            });
            return;
        }

        const driver = activeDrivers.find(
            (item) => Number(item.id) === Number(form.driverId)
        );

        if (!driver) {
            setAlertModal({
                open: true,
                message: t("DriverAssignments.alerts.driverNotAvailable"),
            });
            return;
        }

        let assignmentShift = form.shift;
        let startTime = form.startTime;
        let endTime = form.endTime;

        if (isFixedVehicleDriver(driver)) {
            if (Number(driver.vehicleId) !== Number(form.vehicleId)) {
                setAlertModal({
                    open: true,
                    message: t("DriverAssignments.alerts.driverPermanentlyAssigned"),
                });
                return;
            }

            const fixedShift = getFixedShift(driver);

            assignmentShift = fixedShift.name;
            startTime = fixedShift.startTime;
            endTime = fixedShift.endTime;
        }

        if (!startTime || !endTime) {
            setAlertModal({
                open: true,
                message: t("DriverAssignments.alerts.enterShiftTimes"),
            });
            return;
        }

        // Full Day is stored as 00:00 -> 00:00 (24 hours), so equal times are valid for it.
        if (startTime === endTime && !isFullDay(assignmentShift)) {
            setAlertModal({
                open: true,
                message: t("DriverAssignments.alerts.sameStartEndTime"),
            });
            return;
        }

        const newAssignment = {
            id: Date.now(),
            date,
            vehicleId: Number(form.vehicleId),
            driverId: Number(form.driverId),
            shift: assignmentShift,
            startTime,
            endTime,
        };

        const vehicleConflict = driverAssignments.some(
            (item) =>
                Number(item.vehicleId) === newAssignment.vehicleId &&
                hasTimeOverlap(item, newAssignment)
        );

        if (vehicleConflict) {
            setAlertModal({
                open: true,
                message: t("DriverAssignments.alerts.vehicleTimeConflict"),
            });
            return;
        }

        const driverConflict = driverAssignments.some(
            (item) =>
                Number(item.driverId) === newAssignment.driverId &&
                hasTimeOverlap(item, newAssignment)
        );

        if (driverConflict) {
            setAlertModal({
                open: true,
                message: t("DriverAssignments.alerts.driverTimeConflict"),
            });
            return;
        }

        setDriverAssignments((prev) => [
            ...prev,
            newAssignment,
        ]);

        setForm({
            ...emptyForm,
            vehicleId: form.vehicleId,
        });
    };

    const handleDelete = (id) => {
        setConfirmDelete({
            open: true,
            id,
        });
    };

    const confirmDeleteAssignment = () => {
        setDriverAssignments((prev) =>
            prev.filter((item) => item.id !== confirmDelete.id)
        );

        setConfirmDelete({
            open: false,
            id: null,
        });
    };

    const getVehicle = (id) =>
        vehicles.find(
            (vehicle) => Number(vehicle.id) === Number(id)
        );

    const getDriver = (id) =>
        drivers.find(
            (driver) => Number(driver.id) === Number(id)
        );

    const formatShiftName = (shiftName) => {
        if (shiftName === "First Shift") return t("DriverAssignments.firstShift");
        if (shiftName === "Second Shift") return t("DriverAssignments.secondShift");
        if (shiftName === "Single Shift") return t("DriverAssignments.singleShift");
        return shiftName;
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">
                    {t("DriverAssignments.title")}
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                    {t("DriverAssignments.description")}
                </p>
            </div>

            {/* Operating Date */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                    {t("DriverAssignments.operatingDate")}
                </label>

                <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
            </div>

            {/* Shift Information */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Clock size={18} />
                        {t("DriverAssignments.firstShift")}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                        {t("DriverAssignments.firstShiftTime")}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Clock size={18} />
                        {t("DriverAssignments.secondShift")}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                        {t("DriverAssignments.secondShiftTime")}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Clock size={18} />
                        {t("DriverAssignments.fullDay")}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                        {t("DriverAssignments.fullDayTime")}
                    </p>
                </div>
            </div>

            {/* Assignment Form */}
            <form
                onSubmit={handleAssign}
                className="rounded-xl border border-slate-200 bg-white p-5"
            >
                <h2 className="mb-5 text-lg font-semibold text-slate-800">
                    {t("DriverAssignments.assignDriver")}
                </h2>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {/* Vehicle */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">
                            {t("DriverAssignments.vehicle")}
                        </label>

                        <select
                            value={form.vehicleId}
                            onChange={(e) =>
                                handleVehicleChange(e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 p-3"
                            required
                        >
                            <option value="">{t("DriverAssignments.selectVehicle")}</option>

                            {availableVehicles.map((vehicle) => (
                                <option
                                    key={vehicle.id}
                                    value={vehicle.id}
                                >
                                    {vehicle.number} - {vehicle.type}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Driver */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">
                            {t("DriverAssignments.driver")}
                        </label>

                        <select
                            value={form.driverId}
                            onChange={(e) =>
                                handleDriverChange(e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 p-3"
                            required
                            disabled={!form.vehicleId}
                        >
                            <option value="">
                                {form.vehicleId
                                    ? t("DriverAssignments.selectDriver")
                                    : t("DriverAssignments.selectVehicleFirst")}
                            </option>

                            {availableDrivers.map((driver) => (
                                <option
                                    key={driver.id}
                                    value={driver.id}
                                >
                                    {driver.name}
                                    {isFixedVehicleDriver(driver)
                                        ? t("DriverAssignments.fixedSuffix", { shift: formatShiftName(getFixedShift(driver).name) })
                                        : t("DriverAssignments.shiftSuffix")}
                                </option>
                            ))}
                        </select>

                        {form.vehicleId && availableDrivers.length === 0 && (
                            <p className="mt-2 text-xs text-amber-600">
                                {t("DriverAssignments.noActiveDrivers")}
                            </p>
                        )}
                    </div>

                    {/* Shift */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">
                            {t("DriverAssignments.shift")}
                        </label>

                        <select
                            value={form.shift}
                            onChange={(e) =>
                                handleShiftChange(e.target.value)
                            }
                            disabled={isSelectedDriverFixed}
                            className="w-full rounded-lg border border-slate-300 p-3 disabled:bg-slate-100 disabled:text-slate-500"
                        >
                            <option value="First Shift">
                                {t("DriverAssignments.firstShiftOption")}
                            </option>

                            <option value="Second Shift">
                                {t("DriverAssignments.secondShiftOption")}
                            </option>

                            {/* Only shown for fixed single drivers (selected automatically) */}
                            {isFullDay(form.shift) && (
                                <option value="Full Day">
                                    {t("DriverAssignments.fullDayOption")}
                                </option>
                            )}

                            <option value="Single Shift">
                                {t("DriverAssignments.singleShiftOption")}
                            </option>
                        </select>
                    </div>

                    {/* Custom Shift Times */}
                    {form.shift === "Single Shift" &&
                        !isSelectedDriverFixed && (
                            <>
                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        {t("DriverAssignments.startTime")}
                                    </label>

                                    <input
                                        type="time"
                                        value={form.startTime}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                startTime: e.target.value,
                                            }))
                                        }
                                        required
                                        className="w-full rounded-lg border border-slate-300 p-3"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        {t("DriverAssignments.endTime")}
                                    </label>

                                    <input
                                        type="time"
                                        value={form.endTime}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                endTime: e.target.value,
                                            }))
                                        }
                                        required
                                        className="w-full rounded-lg border border-slate-300 p-3"
                                    />
                                </div>
                            </>
                        )}
                </div>

                {/* Shift Information */}
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                    <Clock size={16} />

                    {formatWorkingHours(
                        form.shift,
                        form.startTime,
                        form.endTime
                    )}

                    {endsNextDay(
                        form.shift,
                        form.startTime,
                        form.endTime
                    ) && (
                        <span className="text-blue-600">
                            {t("DriverAssignments.endsNextDay")}
                        </span>
                    )}

                    {isSelectedDriverFixed && (
                        <span className="text-blue-600">
                            {t("DriverAssignments.fixedDriverShift")}
                        </span>
                    )}
                </div>

                <button
                    type="submit"
                    className="mt-5 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700"
                >
                    <Plus size={18} />
                    {t("DriverAssignments.assignDriverBtn")}
                </button>
            </form>

            {/* Daily Assignments */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 p-5">
                    <h2 className="font-semibold text-slate-800">
                        {t("DriverAssignments.dailyAssignments")}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                        {t("DriverAssignments.assignmentsCount", { count: todayAssignments.length, date })}
                    </p>
                </div>

                {todayAssignments.length === 0 ? (
                    <div className="p-10 text-center text-slate-500">
                        {t("DriverAssignments.noAssignments")}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-600">
                                <tr>
                                    <th className="p-4">{t("DriverAssignments.thVehicle")}</th>
                                    <th className="p-4">{t("DriverAssignments.thDriver")}</th>
                                    <th className="p-4">{t("DriverAssignments.thShift")}</th>
                                    <th className="p-4">{t("DriverAssignments.thWorkingHours")}</th>
                                    <th className="p-4">{t("DriverAssignments.thAction")}</th>
                                </tr>
                            </thead>

                            <tbody>
                                {todayAssignments.map((item) => {
                                    const vehicle = getVehicle(item.vehicleId);
                                    const driver = getDriver(item.driverId);

                                    return (
                                        <tr
                                            key={item.id}
                                            className="border-t border-slate-100"
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <Bus size={17} />
                                                    {vehicle?.number || t("DriverAssignments.unknown")}
                                                </div>
                                            </td>

                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <Users size={17} />
                                                    {driver?.name || t("DriverAssignments.unknown")}
                                                </div>
                                            </td>

                                            <td className="p-4">
                                                {formatShiftName(item.shift)}
                                            </td>

                                            <td className="p-4">
                                                {formatWorkingHours(
                                                    item.shift,
                                                    item.startTime,
                                                    item.endTime
                                                )}

                                                {endsNextDay(
                                                    item.shift,
                                                    item.startTime,
                                                    item.endTime
                                                ) && (
                                                    <span className="ml-2 text-xs text-blue-600">
                                                        {t("DriverAssignments.nextDay")}
                                                    </span>
                                                )}
                                            </td>

                                            <td className="p-4">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleDelete(item.id)
                                                    }
                                                    aria-label={t("DriverAssignments.deleteAssignmentAria")}
                                                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                                                >
                                                    <Trash2 size={17} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmDelete.open}
                title={t("DriverAssignments.deleteModalTitle")}
                message={t("DriverAssignments.deleteModalMessage")}
                confirmLabel={t("DriverAssignments.deleteModalConfirm")}
                onConfirm={confirmDeleteAssignment}
                onCancel={() =>
                    setConfirmDelete({ open: false, id: null })
                }
            />

            <AlertModal
                isOpen={alertModal.open}
                title={t("DriverAssignments.validationErrorTitle")}
                message={alertModal.message}
                type="warning"
                onClose={() =>
                    setAlertModal({ open: false, message: "" })
                }
            />
        </div>
    );
}