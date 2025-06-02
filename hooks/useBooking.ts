import React, { useState } from "react";

import useSocket from "@/socket/useSocket";
import { groupBy, keyBy } from "lodash";
// import { formatDate } from "@/utils";
import clusters from "@/data/clusters.json";
import _ from "lodash";

import { notification } from "antd";
import { FacilitiesInfo } from "@/app/page";

interface PageState {
    state: "schedule" | "confirm" | "info" | "result";
}

const nextPages = {
    schedule: "confirm",
    confirm: "info",
    info: "result",
    result: "schedule",
};

const minWidth = 60;


export default function useBooking() {
    const { getInfo, getCourts, socket, createSchedules, sendUpdateSchedules, updateSchedules } =
        useSocket();
    const [page, setPage] = useState<PageState>({ state: "schedule" });

    const [api, contextHolder] = notification.useNotification();

    const [isLoading, setIsLoading] = useState(true);
    const [slotWidth, setSlotWidth] = useState(minWidth);
    const [pricePerHour, setPricePerHour] = useState(0);

    const [facilities, setFacilities] = useState<any>({});
    const [paymentInfo, setPaymentInfo] = useState({});
    const [facilitiesInfo, setfacilitiesInfo] = useState<{
        [key: string]: FacilitiesInfo;
    }>({});
    const [listFac, setListFac] = React.useState<FacilitiesInfo[]>([])
    const [selectedFacInfo, setSelectedFacInfo] = useState<FacilitiesInfo[]>([]);

    const [selectedDate, setSelectedDate] = useState(new Date());

    const [selected, setSelected] = useState<any>({
        totalHours: 0,
        totalPrice: 0,
        details: [],
        formateddetails: [],
        facility: {},
        phone: "",
        userName: "",
        email: "",
        dates: [],
        isFixed: false,
        applyDiscount: false,
        transactionCode: "",
    });
    const [selectedTimeSlots, setSelectedTimeSlots] = useState<any>({});

    const isSchedule = page.state === "schedule";
    const isConfirm = page.state === "confirm";
    const isShowInfo = page.state === "info";
    const isShowResult = page.state === "result";
    const headerPadding = isSchedule ? "lg:px-6 lg:py-4 p-2" : "px-6 py-2";

    /**
     * @getdata
     * @paymentInfo
     * @facilities
     * @AddGlobalPricePerHour
     */
    React.useEffect(() => {
        getInfo({ selectedDate }).then((data) => {
            setfacilitiesInfo(keyBy(data.facilities, "id"));
            setListFac(data.facilities)
            setSelectedFacInfo(data.facilities);
            setPaymentInfo(data.paymentInfo[0]);
            setPricePerHour(data.facilities[0]?.pricePerHour);
        });
    }, [getInfo]);

    React.useEffect(() => {
        if (selectedFacInfo.length > 0) {
            getCourts(
                selectedFacInfo.map((item) => item.id),
                {
                    startDate: "",
                    endDate: "",
                },
                [selectedDate.toDateString()]
            ).then((data) => {

                const grouped = groupBy(data, "timeClusterId")
                if (grouped) {
                    let i = 0
                    const timeSlots = selectedTimeSlots[selectedDate.toLocaleDateString()] || []
                    while (i < timeSlots.length) {
                        const item = timeSlots[i];
                        const { index: { cluster, rowIndex, columnIndex } } = item
                        if (grouped[cluster]) {
                            grouped[cluster].forEach((row, index) => {
                                const status = row[columnIndex].status
                                const facility = row.facility
                                const court = row.court
                                if (status === "empty" && item.facility === facility && court === item.court) {
                                    grouped[cluster][index][columnIndex] = item
                                }
                            })
                        }
                        i++
                    }
                    setFacilities(grouped);
                    setIsLoading(false);
                }

            });
        }
    }, [selectedFacInfo, getCourts, selectedDate]);
    React.useEffect(() => {
        socket.on("schedules:updated", (arg) => {
            return setFacilities((preState: any) => {
                const data = clusters.reduce((memo: any, cluster) => {
                    const items = preState[cluster.id] || [];
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

                return data;
            });
        });
    }, [socket]);


    /**
     * @handleEvent
     * @CellClick
     * @Scroll
     * @ChangePage
     */
    const handleScrollChange = (x: number) => {
        const tableBody = document.getElementsByClassName("ant-table-body");
        for (let index = 0; index < tableBody.length; index++) {
            const element = tableBody[index];
            element.scrollLeft = x;
        }
    };
    const handleCellClick = (
        cell: any,
        tableIndex: number,
        columnIndex: number,
        rowIndex: number,
        date: Date,
        cluster: string
    ) => {
        const row = facilities[cluster][rowIndex];

        let isCanDelete = false

        const detail: string = `${row.court} - ${cell.from} đến ${cell.to}`;
        const formateddetail: string = `${row.court} - ${cell.from} đến ${cell.to} (${new Intl.DateTimeFormat('en-GB').format(new Date(date))} - ${row.facility})`;
        let cloneSelected: any = { ...selected };

        if (cell.status === "pending") {
            cloneSelected.details.push(detail);
            cloneSelected.formateddetails.push(formateddetail)

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
                [date.toLocaleDateString()]: [
                    ...(prevSlots[date.toLocaleDateString()] || []),
                    updatedCell
                ]
            }));
        } else {
            cloneSelected.details = cloneSelected.details.filter(
                (item: any) => item !== detail
            );

            cloneSelected.formateddetails = cloneSelected.formateddetails.filter(
                (item: any) => item !== formateddetail
            );

            const currentDateSlots = selectedTimeSlots[selectedDate.toLocaleDateString()] || [];
            const filtered = currentDateSlots.filter(
                (item: any) => item.id !== row.courtId || item.facility !== row.facility
            );

            isCanDelete = filtered.filter((s: any) => s.facility === row.facility).length === 0

            if (filtered.length > 0) {
                setSelectedTimeSlots({
                    ...selectedTimeSlots,
                    [selectedDate.toLocaleDateString()]: filtered
                });
            } else {
                const newSelectedTimeSlots = { ...selectedTimeSlots };
                delete newSelectedTimeSlots[selectedDate.toLocaleDateString()];
                setSelectedTimeSlots(newSelectedTimeSlots);
            }
        }
        setFacilities((preState: any) => {
            preState[cluster][rowIndex][columnIndex] = cell;
            return { ...preState };
        });

        return setSelected((preState: any) => {
            let totalHours = preState.totalHours;

            if (cell.status === "pending") {
                preState.facility[row.facility] = row.facility;
            } else {
                if (isCanDelete) {
                    delete selected.facility[row.facility];
                }
            }

            totalHours += cell.status === "pending" && totalHours >= 0 ? 1 : -1;
            return {
                ...preState,
                totalHours,
                details: cloneSelected.details,
                formateddetails: cloneSelected.formateddetails
            };
        });
    };

    const handleRadioSelectBranch = (id: string) => {
        return setSelectedFacInfo(preState => preState.filter(item => item.id === id));
    }

    const handleChangeFacilitiesInfo = (name: string, checked: boolean) => {
        if (checked) {
            const filtered = Object.values(facilitiesInfo).filter((item) =>
                checked ? item.id === name : item.id !== name
            );
            return setSelectedFacInfo([...selectedFacInfo, filtered[0]]);
        }
        return setSelectedFacInfo(preState => preState.filter(item => item.id !== name));
    };
    const handleChangePage = async (newState: any) => {
        if (isSchedule) {

            setSelected((pre: any) => ({
                ...pre,
                dates: Object.keys(selectedTimeSlots),
                timeSlots: _.flatMap(Object.values(selectedTimeSlots)),
                totalPrice: selected.totalHours * Number(pricePerHour),
            }));
        }
        if (isConfirm) {
            newState.transactionCode = `WSB${Math.floor(Date.now() / 1000)}`;
            newState.details =
                typeof newState.details === "string"
                    ? newState.details
                    : newState.details.join(";");
            newState.formateddetails =
                typeof newState.formateddetails === "string"
                    ? newState.formateddetails
                    : newState.formateddetails.join(";");

            const timeSlotData = _.flatMap(Object.values(selectedTimeSlots)).map((timeSlots: any) => {
                timeSlots.bookedBy = { name: newState.userName, phone: newState.phone };
                timeSlots.status = "wait";
                timeSlots.isFixed = newState.isFixed;
                return timeSlots;
            });
            try {
                api.open({
                    type: "info",
                    message: "Đang tạo đơn!",
                });

                const res = await createSchedules(newState, timeSlotData);
                if (!res.success) {
                    return api.open({
                        message: "Ô giờ lỗi, để đặt ô giờ này, hãy gọi 0389145575 để được hỗ trợ",
                        description: "Gọi 0389145575 để được hỗ trợ",
                        duration: 3000,
                        type: "error",
                    });
                }

                api.open({
                    type: "success",
                    message: "Tạo đơn thành công!",
                });
                newState.schedulesId = res.schedulesId
                setSelected(newState);

            } catch (error) {
                console.log(error);
            }
        }

        if (isShowInfo) {
            await updateSchedules(selected.transactionCode)
            await sendUpdateSchedules(newState.data);
        }
        if (isShowResult) {
            setSelected({});
        }

        return setPage({ state: nextPages[page.state] as PageState["state"] });
    };

    const handleResize = (value: number) => {
        return setSlotWidth(value);
    };


    return {
        isSchedule,
        isLoading,
        slotWidth,
        listFac,
        facilities,
        isConfirm,
        selected,
        page,
        selectedTimeSlots,
        pricePerHour,
        isShowResult,
        isShowInfo,
        facilitiesInfo,
        selectedDate,
        contextHolder,
        paymentInfo,
        headerPadding,
        setSelectedDate,
        handleResize,
        handleChangePage,
        handleScrollChange,
        handleCellClick,
        handleRadioSelectBranch,
        handleChangeFacilitiesInfo
    }
}