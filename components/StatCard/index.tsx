// components/stats/StatCard.tsx
type StatCardProps = {
    title: string;
    value: number;
    loading?: boolean;
    colorClass?: string; // eg: text-blue-600
};

const StatCard = ({ title, value, loading = false, colorClass = "text-blue-600" }: StatCardProps) => {
    return (
        <div className="rounded-2xl shadow-md p-4 bg-gray-50">
            <h3 className="text-xl font-semibold text-gray-700 mb-2">{title}</h3>
            {loading ? (
                <div className="animate-pulse text-gray-400 text-4xl font-bold">...</div>
            ) : (
                <p className={`text-4xl font-bold ${colorClass}`}>{value}</p>
            )}
        </div>
    );
};

export default StatCard;
