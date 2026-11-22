import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, AlertTriangle, RefreshCw, Database } from "lucide-react";
import ConfirmModal from "../../../components/ui/ConfirmModal";

const STORAGE_KEYS = [
    { key: "cozy_vehicles", labelKey: "settings.sections.vehicles" },
    { key: "cozy_daily_availability", labelKey: "settings.sections.dailyAvailability" },
    { key: "cozy_drivers", labelKey: "settings.sections.drivers" },
    { key: "cozy_operations", labelKey: "settings.sections.operations" },
    { key: "cozy_routes", labelKey: "settings.sections.routesAndStops" },
    { key: "cozy_travel_times", labelKey: "settings.sections.travelTimes" },
    { key: "cozy_driver_assignments", labelKey: "settings.sections.driverAssignments" },
];

function Settings() {
    const { t } = useTranslation();
    const [confirmModal, setConfirmModal] = useState({ open: false, key: null, label: "" });
    const [resetAllModal, setResetAllModal] = useState(false);

    function handleClearOne(key, label) {
        setConfirmModal({ open: true, key, label });
    }

    function confirmClearOne() {
        localStorage.removeItem(confirmModal.key);
        setConfirmModal({ open: false, key: null, label: "" });
        window.location.reload();
    }

    function confirmResetAll() {
        STORAGE_KEYS.forEach(({ key }) => localStorage.removeItem(key));
        setResetAllModal(false);
        window.location.reload();
    }

    function getStorageSize(key) {
        const item = localStorage.getItem(key);
        if (!item) return t("settings.empty");
        const bytes = new Blob([item]).size;
        return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">{t("settings.title")}</h1>
                <p className="mt-1 text-sm text-gray-500">
                    {t("settings.description")}
                </p>
            </div>

            {/* Data Management */}
            <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 p-5">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-50 p-2">
                            <Database size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-gray-800">{t("settings.localData")}</h2>
                            <p className="text-sm text-gray-500">
                                {t("settings.localDataDesc")}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="divide-y divide-gray-100">
                    {STORAGE_KEYS.map(({ key, labelKey }) => {
                        const label = t(labelKey);
                        return (
                            <div key={key} className="flex items-center justify-between px-5 py-4">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{label}</p>
                                    <p className="mt-0.5 text-xs text-gray-400">
                                        {t("settings.size", { size: getStorageSize(key) })}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleClearOne(key, label)}
                                    className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 size={13} />
                                    {t("settings.resetToDefault")}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-red-500" />
                    <div className="flex-1">
                        <h2 className="font-semibold text-red-800">{t("settings.dangerZone")}</h2>
                        <p className="mt-1 text-sm text-red-600">
                            {t("settings.dangerZoneDesc")}
                        </p>
                        <button
                            onClick={() => setResetAllModal(true)}
                            className="mt-3 flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                        >
                            <RefreshCw size={15} />
                            {t("settings.resetAllData")}
                        </button>
                    </div>
                </div>
            </div>

            {/* About */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="mb-3 font-semibold text-gray-800">{t("settings.about")}</h2>
                <div className="space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium text-gray-800">{t("settings.app")}</span> {t("settings.appName")}</p>
                    <p><span className="font-medium text-gray-800">{t("settings.stack")}</span> {t("settings.stackDetails")}</p>
                    <p><span className="font-medium text-gray-800">{t("settings.storage")}</span> {t("settings.storageDetails")}</p>
                </div>
            </div>

            {/* Confirm clear one */}
            <ConfirmModal
                isOpen={confirmModal.open}
                title={t("settings.resetOneModalTitle", { label: confirmModal.label })}
                message={t("settings.resetOneModalMessage", { label: confirmModal.label })}
                confirmLabel={t("settings.reset")}
                onConfirm={confirmClearOne}
                onCancel={() => setConfirmModal({ open: false, key: null, label: "" })}
            />

            {/* Confirm reset all */}
            <ConfirmModal
                isOpen={resetAllModal}
                title={t("settings.resetAllModalTitle")}
                message={t("settings.resetAllModalMessage")}
                confirmLabel={t("settings.resetEverything")}
                onConfirm={confirmResetAll}
                onCancel={() => setResetAllModal(false)}
            />
        </div>
    );
}

export default Settings;