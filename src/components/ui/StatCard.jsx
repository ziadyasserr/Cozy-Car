function StatCard({ title, value, icon: Icon, color = "blue" }) {
    const colorMap = {
        blue: "text-blue-600 bg-blue-50",
        green: "text-green-600 bg-green-50",
        red: "text-red-600 bg-red-50",
        yellow: "text-yellow-600 bg-yellow-50",
        gray: "text-gray-600 bg-gray-100",
        purple: "text-purple-600 bg-purple-50",
    };

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
            {Icon && (
                <div className={`rounded-lg p-2.5 ${colorMap[color]}`}>
                    <Icon size={20} />
                </div>
            )}
            <div>
                <p className="text-sm text-gray-500">{title}</p>
                <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
            </div>
        </div>
    );
}

export default StatCard;
