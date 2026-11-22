
import { useState } from "react";
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

const SHIFT_TIMES = {
    "First Shift": FIRST_SHIFT,
    "Second Shift": SECOND_SHIFT,
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
                message: "Please select a vehicle and a driver.",
            });
            return;
        }

        if (!date) {
            setAlertModal({
                open: true,
                message: "Please select an operating date.",
            });
            return;
        }

        const driver = activeDrivers.find(
            (item) => Number(item.id) === Number(form.driverId)
        );

        if (!driver) {
            setAlertModal({
                open: true,
                message: "The selected driver is not available.",
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
                    message:
                        "This driver is permanently assigned to another vehicle.",
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
                message: "Please enter the shift start and end times.",
            });
            return;
        }

        if (startTime === endTime) {
            setAlertModal({
                open: true,
                message: "Start time and end time cannot be the same.",
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
                message:
                    "This vehicle already has a driver assigned during this time.",
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
                message:
                    "This driver already has an assignment during this time.",
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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">
                    Driver Assignments
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                    Assign drivers to vehicles for each operating day.
                </p>
            </div>

            {/* Operating Date */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                    Operating Date
                </label>

                <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
            </div>

            {/* Shift Information */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Clock size={18} />
                        First Shift
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                        12:00 AM - 12:00 PM
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Clock size={18} />
                        Second Shift
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                        12:00 PM - 12:00 AM
                    </p>
                </div>
            </div>

            {/* Assignment Form */}
            <form
                onSubmit={handleAssign}
                className="rounded-xl border border-slate-200 bg-white p-5"
            >
                <h2 className="mb-5 text-lg font-semibold text-slate-800">
                    Assign Driver
                </h2>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {/* Vehicle */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">
                            Vehicle
                        </label>

                        <select
                            value={form.vehicleId}
                            onChange={(e) =>
                                handleVehicleChange(e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 p-3"
                            required
                        >
                            <option value="">Select Vehicle</option>

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
                            Driver
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
                                    ? "Select Driver"
                                    : "Select Vehicle First"}
                            </option>

                            {availableDrivers.map((driver) => (
                                <option
                                    key={driver.id}
                                    value={driver.id}
                                >
                                    {driver.name}
                                    {isFixedVehicleDriver(driver)
                                        ? ` (Fixed - ${getFixedShift(driver).name})`
                                        : " (Shift)"}
                                </option>
                            ))}
                        </select>

                        {form.vehicleId && availableDrivers.length === 0 && (
                            <p className="mt-2 text-xs text-amber-600">
                                No active drivers available for this vehicle.
                            </p>
                        )}
                    </div>

                    {/* Shift */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">
                            Shift
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
                                First Shift (12 AM - 12 PM)
                            </option>

                            <option value="Second Shift">
                                Second Shift (12 PM - 12 AM)
                            </option>

                            <option value="Single Shift">
                                Single Shift
                            </option>
                        </select>
                    </div>

                    {/* Custom Shift Times */}
                    {form.shift === "Single Shift" &&
                        !isSelectedDriverFixed && (
                            <>
                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        Start Time
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
                                        End Time
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

                    {form.shift === "Single Shift"
                        ? `${form.startTime || "--:--"} - ${form.endTime || "--:--"}`
                        : `${form.startTime} - ${form.endTime}`}

                    {form.endTime <= form.startTime && (
                        <span className="text-blue-600">
                            (Ends next day)
                        </span>
                    )}

                    {isSelectedDriverFixed && (
                        <span className="text-blue-600">
                            (Fixed driver shift)
                        </span>
                    )}
                </div>

                <button
                    type="submit"
                    className="mt-5 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700"
                >
                    <Plus size={18} />
                    Assign Driver
                </button>
            </form>

            {/* Daily Assignments */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 p-5">
                    <h2 className="font-semibold text-slate-800">
                        Daily Assignments
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                        {todayAssignments.length} assignments for {date}
                    </p>
                </div>

                {todayAssignments.length === 0 ? (
                    <div className="p-10 text-center text-slate-500">
                        No driver assignments for this date.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-600">
                                <tr>
                                    <th className="p-4">Vehicle</th>
                                    <th className="p-4">Driver</th>
                                    <th className="p-4">Shift</th>
                                    <th className="p-4">Working Hours</th>
                                    <th className="p-4">Action</th>
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
                                                    {vehicle?.number || "Unknown"}
                                                </div>
                                            </td>

                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <Users size={17} />
                                                    {driver?.name || "Unknown"}
                                                </div>
                                            </td>

                                            <td className="p-4">
                                                {item.shift}
                                            </td>

                                            <td className="p-4">
                                                {item.startTime} - {item.endTime}

                                                {item.endTime <= item.startTime && (
                                                    <span className="ml-2 text-xs text-blue-600">
                                                        Next day
                                                    </span>
                                                )}
                                            </td>

                                            <td className="p-4">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleDelete(item.id)
                                                    }
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
                title="Delete Assignment?"
                message="Are you sure you want to delete this driver assignment?"
                confirmLabel="Delete"
                onConfirm={confirmDeleteAssignment}
                onCancel={() =>
                    setConfirmDelete({ open: false, id: null })
                }
            />

            <AlertModal
                isOpen={alertModal.open}
                title="Validation Error"
                message={alertModal.message}
                type="warning"
                onClose={() =>
                    setAlertModal({ open: false, message: "" })
                }
            />
        </div>
    );
}
