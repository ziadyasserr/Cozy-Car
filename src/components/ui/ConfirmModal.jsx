import { AlertTriangle } from "lucide-react";

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel = "Delete", confirmColor = "red" }) {
    if (!isOpen) return null;

    const colorMap = {
        red: "bg-red-600 hover:bg-red-700",
        blue: "bg-blue-600 hover:bg-blue-700",
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onCancel}
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 rounded-full bg-red-100 p-2">
                        <AlertTriangle size={22} className="text-red-600" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-gray-900">
                            {title}
                        </h3>
                        <p className="mt-1.5 text-sm text-gray-500">
                            {message}
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${colorMap[confirmColor]}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmModal;
