'use client'

import { Checkbox, Radio } from "antd";
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

export interface FacilitiesInfo {
    id: string;
    name: string;
    address: string;
}

export interface ListFacProps {
    type?: "radio" | "checkbox";
    listFac: FacilitiesInfo[];
    handleChangeFacilitiesInfo: (id: string, checked: boolean) => void;
}

const ListFac: React.FC<ListFacProps> = ({ listFac, type = "checkbox", handleChangeFacilitiesInfo }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Parse from query on first load
    useEffect(() => {
        const facParam = searchParams.get("fac");
        if (facParam) {
            const facArray = facParam.split(",");
            setSelectedIds(facArray);
            if (type === "radio") {
                const [id] = facArray
                handleChangeFacilitiesInfo(id, true)
            }
        }
    }, [searchParams]);

    const handleChange = (id: string, checked: boolean) => {
        let newSelected: string[];
        if (type === "radio") {
            newSelected = [id];
        } else {
            newSelected = checked
                ? [...selectedIds, id]
                : selectedIds.filter((item) => item !== id);
        }
        setSelectedIds(newSelected);
        const query = new URLSearchParams(searchParams.toString());
        query.set("fac", newSelected.join(","));
        router.push(`?${query.toString()}`, { scroll: false });
        handleChangeFacilitiesInfo(id, checked)
    };

    if (type === "radio") {
        return (
            <Radio.Group
                value={selectedIds[0] || ""}
                onChange={(e) => handleChange(e.target.value, true)}
                options={listFac.map((f) => ({
                    key: f.id,
                    value: f.id,
                    label: (
                        <p className="text-white text-md">
                            {f.id.split(" ")[1]} = {f.address}
                        </p>
                    )
                }))}
            />
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {listFac.map((f) => (
                <Checkbox
                    key={f.id}
                    checked={selectedIds.includes(f.id)}
                    onChange={(e) => handleChange(f.id, e.target.checked)}
                >
                    <p className="text-white text-md">
                        {f.id.split(" ")[1]} = {f.address}
                    </p>
                </Checkbox>
            ))}
        </div>
    );
};

export default ListFac;
