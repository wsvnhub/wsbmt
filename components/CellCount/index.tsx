// pages/dashboard.tsx
"use client"
import { useState, useEffect } from "react";
import StatCard from "../StatCard";
import { Select } from "antd";
import axios from "axios";
import React from "react";

type Slot = {
    date: string;
    createdAt: string
    branch: string;
    [key: string]: any
};

type CellCount = {
    branches: any[]
}

export default function CellCount({ branches }: CellCount) {
    const [selectedBranch, setSelectedBranch] = useState("Tất cả");
    const [filteredSlots, setFilteredSlots] = useState<Slot[]>([]);
    const [loading, setLoading] = useState(true);

    const branchOptions = [{ value: 'all', label: "Tất cả" }, ...branches.map((branch: any) => {
        return { value: branch.id, label: branch.name }
    })]

    useEffect(() => {
        setLoading(true);
        let url = "/api/time-slots"

        if (selectedBranch !== "all") {
            url = url + `?branchId=${selectedBranch}`
        }

        axios.get(url).then(res => {
            setFilteredSlots(res.data.data);
            setLoading(false);
        })
    }, [selectedBranch]);

    const todayStr = new Date().toDateString();

    const { futureCount, todayBookedCount } = React.useMemo(() => {
        let future = 0;
        let todayBooked = 0;

        for (const slot of filteredSlots) {
            const isToday = slot.createdAt === todayStr;

            for (const [key, value] of Object.entries(slot)) {
                if (!isNaN(Number(key))) {
                    if (value.status === "empty") {
                        future++;
                    }
                    if (isToday && value.status === "booked") {
                        todayBooked++;
                    }
                }
            }
        }

        return { futureCount: future, todayBookedCount: todayBooked };
    }, [filteredSlots, todayStr]);

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
