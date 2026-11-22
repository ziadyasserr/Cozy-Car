import { useState } from "react";
import { useRoutes } from "../../../context/RoutesContext";
import {
    MapPin,
    Clock,
    Plus,
    Pencil,
    Trash2,
    X,
} from "lucide-react";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import AlertModal from "../../../components/ui/AlertModal";


const emptyForm = {
    name: "",
    attendance: "",
    departure: "",
};

function Routes() {
    const { routes, setRoutes } = useRoutes();
    const [selectedRoute, setSelectedRoute] = useState(1);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(emptyForm);
    const [confirmDelete, setConfirmDelete] = useState({ open: false, stopId: null });
    const [alertModal, setAlertModal] = useState({ open: false, message: "" });

    const activeRoute = routes.find(
        (route) => route.id === selectedRoute
    );

    const resetForm = () => {
        setFormData(emptyForm);
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const name = formData.name.trim();
        const attendance = Number(formData.attendance);
        const departure = Number(formData.departure);

        if (!name || formData.attendance === "" || formData.departure === "") {
            setAlertModal({ open: true, message: "Please fill in all fields." });
            return;
        }

        if (
            !Number.isFinite(attendance) ||
            !Number.isFinite(departure) ||
            attendance <= 0 ||
            departure <= 0
        ) {
            setAlertModal({ open: true, message: "Travel times must be positive numbers." });
            return;
        }

        const duplicate = activeRoute.stops.some(
            (stop) =>
                stop.name.toLowerCase() === name.toLowerCase() &&
                stop.id !== editingId
        );

        if (duplicate) {
            setAlertModal({ open: true, message: "This stop already exists in this route." });
            return;
        }

        setRoutes((prev) =>
            prev.map((route) => {
                if (route.id !== selectedRoute) return route;

                if (editingId) {
                    return {
                        ...route,
                        stops: route.stops.map((stop) =>
                            stop.id === editingId
                                ? { ...stop, name, attendance, departure }
                                : stop
                        ),
                    };
                }

                return {
                    ...route,
                    stops: [
                        ...route.stops,
                        {
                            id: Date.now(),
                            name,
                            attendance,
                            departure,
                        },
                    ],
                };
            })
        );

        resetForm();
    };

    const handleEdit = (stop) => {
        setFormData({
            name: stop.name,
            attendance: String(stop.attendance),
            departure: String(stop.departure),
        });

        setEditingId(stop.id);
        setShowForm(true);
    };

    const handleDelete = (stopId) => {
        setConfirmDelete({ open: true, stopId });
    };

    const confirmDeleteStop = () => {
        setRoutes((prev) =>
            prev.map((route) =>
                route.id === selectedRoute
                    ? {
                        ...route,
                        stops: route.stops.filter((stop) => stop.id !== confirmDelete.stopId),
                    }
                    : route
            )
        );
        setConfirmDelete({ open: false, stopId: null });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">
                    Routes & Stops
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    Manage routes and pickup points
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {routes.map((route) => (
                    <button
                        key={route.id}
                        onClick={() => {
                            setSelectedRoute(route.id);
                            resetForm();
                        }}
                        className={`rounded-xl border p-5 text-left transition ${selectedRoute === route.id
                                ? "border-blue-600 bg-blue-50"
                                : "border-gray-200 bg-white hover:border-blue-300"
                            }`}
                    >
                        <div className="flex items-center justify-between">
                            <MapPin
                                className={
                                    selectedRoute === route.id
                                        ? "text-blue-600"
                                        : "text-gray-400"
                                }
                            />
                            <span className="text-sm text-gray-500">
                                {route.stops.length} Stops
                            </span>
                        </div>
                        <h2 className="mt-4 font-bold text-gray-800">
                            {route.name}
                        </h2>
                    </button>
                ))}
            </div>

            {activeRoute && (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5">
                        <h2 className="text-lg font-bold text-gray-800">
                            {activeRoute.name} - Stops
                        </h2>

                        <button
                            onClick={() => {
                                setEditingId(null);
                                setFormData(emptyForm);
                                setShowForm(true);
                            }}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                        >
                            <Plus size={18} />
                            Add Stop
                        </button>
                    </div>

                    {showForm && (
                        <form
                            onSubmit={handleSubmit}
                            className="grid gap-4 border-b border-gray-200 bg-gray-50 p-5 md:grid-cols-3"
                        >
                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Stop Name
                                </label>
                                <input
                                    required
                                    value={formData.name}
                                    onChange={(e) =>
                                        setFormData({ ...formData, name: e.target.value })
                                    }
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                                    placeholder="Enter stop name"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Attendance (Minutes)
                                </label>
                                <input
                                    required
                                    type="number"
                                    min="1"
                                    value={formData.attendance}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            attendance: e.target.value,
                                        })
                                    }
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                                    placeholder="e.g. 45"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">
                                    Departure (Minutes)
                                </label>
                                <input
                                    required
                                    type="number"
                                    min="1"
                                    value={formData.departure}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            departure: e.target.value,
                                        })
                                    }
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                                    placeholder="e.g. 60"
                                />
                            </div>

                            <div className="flex gap-2 md:col-span-3">
                                <button
                                    type="submit"
                                    className="rounded-lg bg-blue-600 px-5 py-2 text-white"
                                >
                                    {editingId ? "Save Changes" : "Add Stop"}
                                </button>

                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="flex items-center gap-1 rounded-lg bg-gray-200 px-5 py-2 text-gray-700"
                                >
                                    <X size={16} />
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-sm text-gray-600">
                                <tr>
                                    <th className="px-6 py-4">Stop Name</th>
                                    <th className="px-6 py-4">Attendance</th>
                                    <th className="px-6 py-4">Departure</th>
                                    <th className="px-6 py-4">Actions</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-100">
                                {activeRoute.stops.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-10 text-center text-gray-500">
                                            No stops available
                                        </td>
                                    </tr>
                                ) : (
                                    activeRoute.stops.map((stop) => (
                                        <tr key={stop.id} className="text-sm">
                                            <td className="px-6 py-4 font-medium text-gray-800">
                                                <div className="flex items-center gap-2">
                                                    <MapPin size={17} className="text-blue-500" />
                                                    {stop.name}
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 text-gray-600">
                                                <span className="flex items-center gap-2">
                                                    <Clock size={15} />
                                                    {stop.attendance} min
                                                </span>
                                            </td>

                                            <td className="px-6 py-4 text-gray-600">
                                                <span className="flex items-center gap-2">
                                                    <Clock size={15} />
                                                    {stop.departure} min
                                                </span>
                                            </td>

                                            <td className="px-6 py-4">
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => handleEdit(stop)}
                                                        className="text-blue-600"
                                                        aria-label={`Edit ${stop.name}`}
                                                    >
                                                        <Pencil size={17} />
                                                    </button>

                                                    <button
                                                        onClick={() => handleDelete(stop.id)}
                                                        className="text-red-600"
                                                        aria-label={`Delete ${stop.name}`}
                                                    >
                                                        <Trash2 size={17} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmDelete.open}
                title="Delete Stop?"
                message="Are you sure you want to delete this stop?"
                confirmLabel="Delete"
                onConfirm={confirmDeleteStop}
                onCancel={() => setConfirmDelete({ open: false, stopId: null })}
            />

            <AlertModal
                isOpen={alertModal.open}
                title="Validation Error"
                message={alertModal.message}
                type="warning"
                onClose={() => setAlertModal({ open: false, message: "" })}
            />
        </div>
    );
}

export default Routes;
