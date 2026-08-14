import React, { useState } from "react";

import useSocket from "@/socket/useSocket";
import { groupBy, keyBy } from "lodash";
// import { formatDate } from "@/utils";
import clusters from "@/data/clusters.json";
import _ from "lodash";

import { notification } from "antd";
import { FacilitiesInfo } from "@/app/page";
import { generateTransactionCode } from "@/utils";
import { buildGridByCluster } from "@/utils/buildGrid";

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
                [selectedDate.toISOString()]
            ).then((res) => {
                // Server chỉ gửi bộ khung sân + những ô ĐÃ BỊ CHIẾM. 22 ô mỗi sân
                // được dựng ở client từ data/timeSlots.json — ô trống không tồn
                // tại trong DB và cũng không đi qua mạng.
                const date = res.dates?.[0];
                if (!date) {
                    setIsLoading(false);
                    return;
                }

                const grouped = buildGridByCluster(res.courts || [], res.occupied || [], date);

                // Giữ lại các ô người dùng đang chọn (trạng thái "pending" chỉ
                // tồn tại ở client) khi lưới được dựng lại.
                const pending = selectedTimeSlots[selectedDate.toLocaleDateString()] || [];
                for (const item of pending) {
                    const { cluster, columnIndex } = item.index || {};
                    const rows = grouped[cluster];
                    if (!rows) continue;

                    for (const row of rows) {
                        if (row.facility !== item.facility || row.court !== item.court) continue;
                        // Chỉ khôi phục lựa chọn nếu ô vẫn còn trống; nếu trong
                        // lúc đó có người khác đặt mất thì phải để nguyên trạng
                        // thái thật, không được vẽ đè lên.
                        if (row[columnIndex]?.status === "empty") {
                            row[columnIndex] = item;
                        }
                    }
                }

                setFacilities(grouped);
                setIsLoading(false);
            });
        }
    }, [selectedFacInfo, getCourts, selectedDate]);

    React.useEffect(() => {
        /**
         * Bản cũ đăng ký handler này mà KHÔNG có socket.off, trong khi `socket`
         * là singleton ở module scope nên dep [socket] không bao giờ đổi và
         * handler tích luỹ mãi qua mỗi lần StrictMode double-mount hay điều
         * hướng. Reducer cũ cũng mutate state cũ tại chỗ.
         */
        const onUpdated = (arg: any[]) => {
            setFacilities((preState: any) => {
                const next: any = {};

                for (const cluster of clusters) {
                    const rows = preState[cluster.id] || [];
                    next[cluster.id] = rows.map((row: any) => {
                        const patches = arg.filter(
                            (cell) =>
                                row.facility === cell.facility &&
                                row.courtId === cell.id &&
                                row.createdAt === cell.index?.createdAt
                        );
                        if (patches.length === 0) return row;

                        // Clone thay vì mutate: handler cũ sửa thẳng object của
                        // state trước đó nên thứ tự merge trở nên bất định.
                        const clone = { ...row };
                        for (const cell of patches) clone[cell.index.columnIndex] = cell;
                        return clone;
                    });
                }
                return next;
            });
        };

        socket.on("schedules:updated", onUpdated);
        return () => {
            socket.off("schedules:updated", onUpdated);
        };
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
        if (cell.status === "pass") {
            return
        }
        const row = facilities[cluster][rowIndex];

        let isCanDelete = false
        console.log(" row.createdAt", row.createdAt)
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
            return { ...preState, key: `${rowIndex}-${columnIndex}` };
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
        const filtered = Object.values(facilitiesInfo).filter((item) => item.id === id);

        return setSelectedFacInfo(filtered);
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
            console.log("selected", selected)
            console.log("Object.values(selectedTimeSlots)", Object.values(selectedTimeSlots))
            console.log("_.flatMap(Object.values(selectedTimeSlots))", _.flatMap(Object.values(selectedTimeSlots)))

            setSelected((pre: any) => ({
                ...pre,
                dates: Object.keys(selectedTimeSlots),
                timeSlots: _.flatMap(Object.values(selectedTimeSlots)),
                totalPrice: selected.totalHours * Number(pricePerHour),
            }));

        }
        if (isConfirm) {
            newState.transactionCode = generateTransactionCode();
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
            console.log("isConfirm selected", selected)
            console.log("Data to be sent to backend", timeSlotData)

            try {
                api.open({
                    type: "info",
                    message: "Đang tạo đơn!",
                });

                const res = await createSchedules(newState, timeSlotData);
                if (!res.success) {
                    return api.open({
                        // Server trả về danh sách ô bị chiếm (res.conflicts) để
                        // báo đúng ô nào lỗi thay vì một thông báo chung.
                        message: res.conflicts?.length
                            ? `Ô giờ đã có người đặt: ${res.conflicts.join(", ")}. Vui lòng chọn ô khác.`
                            : "Ô giờ lỗi, để đặt ô giờ này, hãy gọi 0889555559 để được hỗ trợ",
                        description: "Gọi 0889555559 để được hỗ trợ",
                        duration: 3000,
                        type: "error",
                    });
                }

                api.open({
                    type: "success",
                    message: "Tạo đơn thành công!",
                });
                newState.schedulesId = res.schedulesId
                // lockId là thứ duy nhất định danh quyền sở hữu hold; Wait.tsx
                // cần nó để huỷ đơn khi hết đồng hồ đếm ngược.
                newState.lockId = res.lockId
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