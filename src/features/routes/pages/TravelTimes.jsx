
import { useState } from "react";
import { Plus, Pencil, Trash2, X, Clock } from "lucide-react";
import { useRoutes } from "../../../context/RoutesContext";
import { useTravelTimes } from "../../../context/TravelTimesContext";

const emptyForm = {
    fromStopId: "",
    toStopId: "",
    duration: "",
};

export default function TravelTimes() {
    const { travelTimes, setTravelTimes } = useTravelTimes();

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(emptyForm);

    const { routes } = useRoutes();

    const stops = routes.flatMap((route) =>
        route.stops.map((stop) => ({
            ...stop,
            routeName: route.name,
        }))
    );

    const getStopName = (stopId) => {
        const stop = stops.find((item) => item.id === Number(stopId));

        return stop
            ? `${stop.name} (${stop.routeName})`
            : "نقطة غير معروفة";
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const fromId = Number(formData.fromStopId);
        const toId = Number(formData.toStopId);
        const duration = Number(formData.duration);

        if (!fromId || !toId || fromId === toId || duration <= 0) {
            alert("راجع بيانات الانتقال");
            return;
        }

        const duplicate = travelTimes.some(
            (item) =>
                item.id !== editingId &&
                item.fromStopId === fromId &&
                item.toStopId === toId
        );

        if (duplicate) {
            alert("الانتقال ده متسجل بالفعل");
            return;
        }

        if (editingId !== null) {
            setTravelTimes((prev) =>
                prev.map((item) =>
                    item.id === editingId
                        ? {
                            ...item,
                            fromStopId: fromId,
                            toStopId: toId,
                            duration,
                        }
                        : item
                )
            );
        } else {
            setTravelTimes((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    fromStopId: fromId,
                    toStopId: toId,
                    duration,
                },
            ]);
        }

        handleCloseForm();
    };

    const handleEdit = (item) => {
        setEditingId(item.id);

        setFormData({
            fromStopId: String(item.fromStopId),
            toStopId: String(item.toStopId),
            duration: String(item.duration),
        });

        setShowForm(true);
    };

    const handleDelete = (id) => {
        if (!window.confirm("هل أنت متأكد من حذف الانتقال؟")) return;

        setTravelTimes((prev) =>
            prev.filter((item) => item.id !== id)
        );
    };

    const handleCloseForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormData(emptyForm);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                        Travel Times
                    </h1>
                    <p className="text-gray-500 mt-1">
                        إدارة أوقات الانتقال بين نقاط التجمع
                    </p>
                </div>

                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700"
                >
                    <Plus size={18} />
                    Add Travel Time
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border rounded-xl p-5">
                    <p className="text-gray-500 text-sm">
                        Total Transfers
                    </p>
                    <h2 className="text-3xl font-bold mt-2">
                        {travelTimes.length}
                    </h2>
                </div>

                <div className="bg-white border rounded-xl p-5">
                    <p className="text-gray-500 text-sm">
                        Available Stops
                    </p>
                    <h2 className="text-3xl font-bold mt-2">
                        {stops.length}
                    </h2>
                </div>
            </div>

            {showForm && (
                <div className="bg-white border rounded-xl p-5">
                    <div className="flex justify-between items-center mb-5">
                        <h2 className="font-bold text-lg">
                            {editingId !== null
                                ? "Edit Travel Time"
                                : "Add Travel Time"}
                        </h2>

                        <button onClick={handleCloseForm}>
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm mb-2">
                                    From Stop
                                </label>

                                <select
                                    name="fromStopId"
                                    value={formData.fromStopId}
                                    onChange={handleChange}
                                    required
                                    className="w-full border rounded-lg p-3"
                                >
                                    <option value="">Choose start point</option>

                                    {stops.map((stop) => (
                                        <option key={stop.id} value={stop.id}>
                                            {stop.name} - {stop.routeName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm mb-2">
                                    To Stop
                                </label>

                                <select
                                    name="toStopId"
                                    value={formData.toStopId}
                                    onChange={handleChange}
                                    required
                                    className="w-full border rounded-lg p-3"
                                >
                                    <option value="">Choose destination</option>

                                    {stops.map((stop) => (
                                        <option key={stop.id} value={stop.id}>
                                            {stop.name} - {stop.routeName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm mb-2">
                                    Duration (Minutes)
                                </label>

                                <input
                                    type="number"
                                    name="duration"
                                    min="1"
                                    value={formData.duration}
                                    onChange={handleChange}
                                    required
                                    placeholder="Example: 25"
                                    className="w-full border rounded-lg p-3"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="submit"
                                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg"
                            >
                                Save
                            </button>

                            <button
                                type="button"
                                onClick={handleCloseForm}
                                className="border px-5 py-2.5 rounded-lg"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white border rounded-xl overflow-hidden">
                <div className="p-5 border-b">
                    <h2 className="font-bold">Transfer List</h2>
                </div>

                {travelTimes.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <Clock size={36} className="mx-auto mb-3 text-gray-400" />
                        <p>No travel times added yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="p-4 text-right">From</th>
                                    <th className="p-4 text-right">To</th>
                                    <th className="p-4 text-right">Duration</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {travelTimes.map((item) => (
                                    <tr key={item.id} className="border-t">
                                        <td className="p-4">
                                            {getStopName(item.fromStopId)}
                                        </td>

                                        <td className="p-4">
                                            {getStopName(item.toStopId)}
                                        </td>

                                        <td className="p-4 font-semibold">
                                            {item.duration} min
                                        </td>

                                        <td className="p-4">
                                            <div className="flex justify-center gap-3">
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-blue-600"
                                                >
                                                    <Pencil size={18} />
                                                </button>

                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-600"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
