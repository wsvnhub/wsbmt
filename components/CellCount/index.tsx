// pages/dashboard.tsx
"use client"
import { useState, useEffect } from "react";
import StatCard from "../StatCard";
import { Select } from "antd";

type Slot = {
    date: string;
    isBooked: boolean;
    branch: string;
};

type CellCount = {
    branches: any[]
}

export default function CellCount({ branches }: CellCount) {
    const [selectedBranch, setSelectedBranch] = useState("Tất cả");
    const [filteredSlots, setFilteredSlots] = useState<Slot[]>([]);
    const [loading, setLoading] = useState(true);

    const slots: Slot[] = [
        { date: "2025-06-02", isBooked: true, branch: "Chi nhánh 1" },
        { date: "2025-06-03", isBooked: true, branch: "Chi nhánh 2" },
        { date: "2025-06-04", isBooked: false, branch: "Chi nhánh 1" },
        { date: "2025-06-05", isBooked: true, branch: "Chi nhánh 3" },
    ];

    const branchOptions = [{ value: 'all', label: "Tất cả" }, ...branches.map((branch: any) => {
        return { value: branch.id, label: branch.name }
    })]

    useEffect(() => {
        setLoading(true);
        const timeout = setTimeout(() => {
            if (selectedBranch === "all") {
                setFilteredSlots(slots);
            } else {
                setFilteredSlots(slots.filter(s => s.branch === selectedBranch));
            }
            setLoading(false);
        }, 300);
        return () => clearTimeout(timeout);
    }, [selectedBranch]);

    const today = new Date().toISOString().split("T")[0];
    const futureCount = filteredSlots.filter(slot => slot.date > today).length;
    const todayBookedCount = filteredSlots.filter(slot => slot.date === today && slot.isBooked).length;

    return (
        <div className="py-6 space-y-4">
            <div>
                <label className="font-medium mr-2">Chi nhánh:</label>
                <Select
                    className="w-1/3"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e)}
                    options={branchOptions}
                />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <StatCard
                    title="Ô tương lai"
                    value={futureCount}
                    loading={loading}
                    colorClass="text-blue-600"
                />
                <StatCard
                    title="Đặt hôm nay"
                    value={todayBookedCount}
                    loading={loading}
                    colorClass="text-green-600"
                />
            </div>
        </div>
    );
}
