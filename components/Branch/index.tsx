import { FacilitiesInfo } from "@/app/page";
import { Checkbox, Radio } from "antd";


export interface ListFacProps {
    type?: "radio" | "checkbox";
    listFac: FacilitiesInfo[];
    handleChangeFacilitiesInfo: (id: string, checked: boolean) => void;
}


const ListFac: React.FC<ListFacProps> = ({ listFac, handleChangeFacilitiesInfo, type = "checkbox" }) => {

    if (type === "radio") {
        return (
            <Radio.Group
                // value={value}
                onChange={(e) => handleChangeFacilitiesInfo(e.target.value || "", e.target.checked)}
                options={listFac.map((f) => {
                    return {
                        value: f.id,
                        label: <p className="text-white text-md">
                            {f.id.split(' ')[1]} = {f.address}
                        </p>
                    }
                })}
            />
        );
    }

    return listFac.map((f) => {
        return (
            <>
                <Checkbox
                    defaultChecked
                    name={f.id}
                    onChange={(e) => handleChangeFacilitiesInfo(e.target.name || "", e.target.checked)}
                >
                    <p className="text-white text-md">
                        {f.id.split(' ')[1]} = {f.address}
                    </p>
                </Checkbox>
                <p />
            </>
        );

    });
}

export default ListFac