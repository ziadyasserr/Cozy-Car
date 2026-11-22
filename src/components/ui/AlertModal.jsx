import { Info, CheckCircle, AlertTriangle } from "lucide-react";

function AlertModal({ isOpen, title, message, type = "info", onClose }) {
    if (!isOpen) return null;

    const styles = {
        info: { icon: Info, iconClass: "text-blue-600", bgClass: "bg-blue-100" },
        success: { icon: CheckCircle, iconClass: "text-green-600", bgClass: "bg-green-100" },
        warning: { icon: AlertTriangle, iconClass: "text-yellow-600", bgClass: "bg-yellow-100" },
    };

    const { icon: Icon, iconClass, bgClass } = styles[type] || styles.info;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 rounded-full p-2 ${bgClass}`}>
                        <Icon size={22} className={iconClass} />
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
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AlertModal;
