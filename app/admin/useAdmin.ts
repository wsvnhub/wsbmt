import React from 'react'
import { useRouter } from "next/navigation";
import useSocket from "@/socket/useSocket";
import dayjs, { Dayjs } from "dayjs";
import { FacilitiesInfo } from "../page2";
import clusters from "@/data/clusters.json";

import { groupBy, keyBy } from "lodash";

import _ from "lodash";

import {
    DatePickerProps,
    notification
} from "antd";


export const useAdminTable = () => {

}
const splitArr = ({ data }: any) => {
    return groupBy(data, "timeClusterId");
};

const defaultSelected = {
    totalHours: 0,
    totalPrice: 0,
    details: [],
    facility: {},
    phone: "",
    userName: "",
    email: "",
    dates: [],
    isFixed: false,
    applyDiscount: "",
    transactionCode: "",
}

export default function useAdmin() {
    const { socket, getCourts, getInfo, createSchedules, sendUpdateSchedulesManual } = useSocket();

    const router = useRouter();

    const [api, contextHolder] = notification.useNotification();


    const [isShowModel, setShowModel] = React.useState(false)

    const [rangeDate, setRangeDate] = React.useState({
        startDate: "",
        endDate: "",
    });

    const [specificsDate, setSpecificsDate] = React.useState<string[]>([
        new Date().toDateString(),
    ]);

    const [discountCode, setDiscountCode] = React.useState("");
    const [discountInfo, setDiscountInfo] = React.useState({
        value: 0,
        newPrice: 0,
        discountAmount: 0,
        isApplyDiscount: false,
    });

    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setProcessing] = React.useState(false);
    const [isFixed, setFixed] = React.useState(false);
    const [pricePerHour, setPricePerHour] = React.useState(0);

    const [facilities, setFacilities] = React.useState<any>({});
    const [selected, setSelected] = React.useState<any>(defaultSelected);
    const [selectedTimeSlots, setSelectedTimeSlots] = React.useState<any>({});

    const [selectedFacInfo, setSelectedFacInfo] = React.useState<
        FacilitiesInfo[]
    >([]);

    const [facilitiesInfo, setfacilitiesInfo] = React.useState<{
        [key: string]: FacilitiesInfo;
    }>({});

    const onVerifyCode = async () => {
        setProcessing(true);
        try {
            const response = await fetch("api/verify-code", {
                method: "POST",
                body: JSON.stringify({ code: discountCode, timesSlots: selectedTimeSlots }),
            });
            const res = await response.json();
            if (!res.data && res.status !== 200) {
                return api.error({ message: res.error ? res.error : "Mã không tồn tại hoặc hết hạn!" })
            }
            const percent = res.data.value;
            const discountAmount = pricePerHour - (pricePerHour * percent) / 100;
            setPricePerHour(discountAmount);
            setProcessing(false);
            return setDiscountInfo({
                value: percent,
                discountAmount,
                newPrice: selected.totalHours * discountAmount,
                isApplyDiscount: true,
            });
        } catch (error) {
            console.log(error);
        } finally {
            setProcessing(false);
        }
    };

    const onFormFinishUpdateInfo = async (values: any) => {
        setProcessing(true);
        const { name, phone, password } = values;
        if (!name || !phone || !password) {
            setProcessing(false);
            return api.open({
                message: "Thiếu thông tin",
                description: "Vui lòng điền đầy đủ thông tin",
                duration: 3,
                type: "error"
            });
        }

        if (password !== "a@20172023") {
            setProcessing(false);
            return api.open({
                message: "Mật khẩu không hợp lệ",
                description: "Vui lòng điền mật khẩu được cấp.",
                duration: 3,
                type: "error"
            });
        }
        const timeSlotData = _.flatMap(Object.values(selectedTimeSlots)).map((timeSlots: any) => {
            return {
                ...timeSlots,
                status: "booked",
                isFixed,
                bookedBy: { name, phone },
            };
        });
        console.log(timeSlotData)
        try {
            const res = await sendUpdateSchedulesManual(timeSlotData)
            console.log("res", res)
            setSelectedTimeSlots({});
            setSelected(defaultSelected);
            setShowModel(false)
        } catch (error) {
            console.log(error)
        }
        finally {
            setProcessing(false);
        }


    }

    const onFormFinish = async (values: any) => {
        setProcessing(true);
        const { name, phone, email } = values;
        if (!name || !phone || !email) {
            setProcessing(false);
            return api.open({
                message: "Thiếu thông tin",
                description: "Vui lòng điền đầy đủ thông tin",
                duration: 3,
            });
        }
        // const { isApplyDiscount } = discountInfo;
        const totalPrice = selected.totalHours * pricePerHour;
        const timeSlotData = _.flatMap(Object.values(selectedTimeSlots)).map((timeSlots: any) => {
            return {
                ...timeSlots,
                status: "wait",
                isFixed,
                bookedBy: { name, phone },
            };
        });
        const submitedData = {
            ...selected,
            userName: name,
            phone,
            email,
            timeSlots: timeSlotData,
            applyDiscount: discountCode,
            totalPrice,
            isFixed,
            dates: Object.keys(selectedTimeSlots),
            transactionCode: `WSB${new Date().getTime()}`,
            details: selected.details.join(";"),
        };
        console.log(submitedData);

        try {
            const { data } = await createSchedules(submitedData, timeSlotData);
            setSelectedTimeSlots({});
            setSelected(defaultSelected);
            if (data?.insertedId) {
                router.push(`/admin/${data.insertedId}`);
            }
        } catch (error) {
            console.log(error);
        } finally {
            setProcessing(false);
        }
    };

    const onChange: DatePickerProps<Dayjs[]>["onChange"] = (
        date,
        _dateString
    ) => {
        if (!date) {
            return setSpecificsDate([]);
        }
        return setSpecificsDate(date.map((day) => day.toDate().toDateString()));
    };

    const onChangeInfo = () => setShowModel(true)

    const handleScrollChange = (x: number) => {
        const tableBody = document.getElementsByClassName("ant-table-body");
        for (let index = 0; index < tableBody.length; index++) {
            const element = tableBody[index];
            element.scrollLeft = x;
        }
    };

    const handleChangeFacilitiesInfo = (name: string, checked: boolean) => {
        if (checked) {
            const filtered = Object.values(facilitiesInfo).filter((item) =>
                checked ? item.id === name : item.id !== name
            );
            return setSelectedFacInfo([...selectedFacInfo, filtered[0]]);
        }
        return setSelectedFacInfo(preState => preState.filter(item => item.id !== name));
    };
    const handleNotPendingUpdateCell = ({ cloneSelected, row, detail, currentDate }: any) => {
        cloneSelected.details = cloneSelected.details.filter(
            (item: any) => item !== detail
        );

        const currentDateSlots = selectedTimeSlots[currentDate.toLocaleDateString()] || [];
        const filtered = currentDateSlots.filter(
            (item: any) => item.id !== row.courtId || item.facility !== row.facility
        );

        if (filtered.length > 0) {
            setSelectedTimeSlots({
                ...selectedTimeSlots,
                [currentDate.toLocaleDateString()]: filtered
            });
        } else {
            setSelectedTimeSlots((prevState: any) => {
                const newState = { ...prevState };
                delete newState[currentDate.toLocaleDateString()];
                return newState;
            });
        }

    }
    const handleCellClick = (
        cell: any,
        tableIndex: number,
        columnIndex: number,
        rowIndex: number,
        currentDate: Date,
        cluster: string
    ) => {
        const row = facilities[currentDate.toDateString()][cluster][rowIndex];
        const detail: string = `${row.court} - ${cell.from} đến ${cell.to}`;
        let cloneSelected: any = { ...selected };

        if (cell.status === "pending") {
            cloneSelected.details.push(detail);

            const updatedCell = {
                ...cell,
                id: row.courtId,
                facility: row.facility,
                court: row.court,
                index: {
                    tableIndex,
                    rowIndex,
                    columnIndex,
                    createdAt: row.createdAt,
                    cluster
                }
            };

            setSelectedTimeSlots((prevSlots: any) => ({
                ...prevSlots,
                [currentDate.toLocaleDateString()]: [
                    ...(prevSlots[currentDate.toLocaleDateString()] || []),
                    updatedCell
                ]
            }));
        } else {
            handleNotPendingUpdateCell({ cloneSelected, row, detail, currentDate })
        }

        setFacilities((preState: any) => {
            preState[currentDate.toDateString()][cluster][rowIndex][columnIndex] =
                cell;
            return { ...preState };
        });

        return setSelected((preState: any) => {
            let totalHours = preState.totalHours;
            preState.facility[row.facility] = row.facility;
            totalHours += cell.status === "pending" && totalHours >= 0 ? 1 : -1;
            return { ...preState, totalHours, details: cloneSelected.details };
        });
    };
    const defaultValue = [dayjs()];

    React.useEffect(() => {
        getInfo().then((data) => {
            // setPaymentInfo(data.paymentInfo[0]);
            setfacilitiesInfo(keyBy(data.facilities, "id"));
            setSelectedFacInfo(data.facilities);
            setPricePerHour(data.facilities[0].pricePerHour);
        });
    }, [getInfo]);

    React.useEffect(() => {
        if (selectedFacInfo.length > 0) {
            const rangefilter =
                specificsDate.length > 0 ? { startDate: "", endDate: "" } : rangeDate;
            getCourts(
                selectedFacInfo.map((item) => item.id),
                rangefilter,
                specificsDate
            ).then((data) => {
                console.log("data", data)
                const groupByDate = groupBy(data, "createdAt");
                const mapped = Object.keys(groupByDate).reduce((memo: any, date) => {
                    const timeSlots = selectedTimeSlots[new Date(date).toLocaleDateString()] || []
                    // console.log("timeSlots", timeSlots)
                    memo[date] = splitArr({
                        data: groupByDate[date],
                    });
                    const grouped = memo[date]
                    let i = 0
                    while (i < timeSlots.length) {
                        const item = timeSlots[i];
                        const { index: { cluster, columnIndex } } = item
                        if (grouped[cluster]) {
                            grouped[cluster].forEach((row: any, index: number) => {
                                const status = row[columnIndex].status
                                const facility = row.facility
                                const court = row.court
                                if (status === "empty" && item.facility === facility && court === item.court) {
                                    memo[date][cluster][index][columnIndex] = item
                                }
                            })
                        }
                        i++
                    }
                    return memo;
                }, {});
                setFacilities(mapped);
                setIsLoading(false);
            });
        }
    }, [selectedFacInfo, getCourts, specificsDate, rangeDate]);

    React.useEffect(() => {
        socket.on("schedules:updated", (arg) => {
            return setFacilities((preState: any) => {
                const data = Object.keys(preState).reduce((memo: any, value) => {
                    const stateItems = preState[value] || [];
                    const data = clusters.reduce((memo: any, cluster) => {

                        const items = stateItems[cluster.id] || [];
                        const newState = items.map((item: any) => {
                            if (item) {
                                arg.forEach((cell: any) => {
                                    const { index, facility, id } = cell;
                                    const row = item;
                                    if (
                                        row.facility === facility &&
                                        row.courtId === id &&
                                        row.createdAt === index.createdAt
                                    ) {
                                        item[index.columnIndex] = cell;
                                    }
                                });
                            }
                            return item;
                        });

                        memo[cluster.id] = newState;
                        return memo;
                    }, {});

                    memo[value] = data;
                    return memo;
                }, {});
                return data;
            });
        });
    }, [socket]);
    return {
        isLoading,
        isFixed,
        selected,
        isProcessing,
        isShowModel,
        facilities,
        contextHolder,
        pricePerHour,
        defaultValue,
        discountInfo,
        discountCode,
        onChangeInfo,
        handleCellClick,
        handleScrollChange,
        onFormFinish,
        handleChangeFacilitiesInfo,
        setFixed,
        setRangeDate,
        onChange,
        setDiscountCode,
        onVerifyCode,
        setShowModel,
        onFormFinishUpdateInfo
    }
}
