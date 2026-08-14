import React from 'react'
import { useRouter } from "next/navigation";
import useSocket from "@/socket/useSocket";
import { buildGridByDate } from "@/utils/buildGrid";
import dayjs, { Dayjs } from "dayjs";
import { FacilitiesInfo } from "../page";
import clusters from "@/data/clusters.json";

import { groupBy, keyBy } from "lodash";

import _ from "lodash";

import {
    DatePickerProps,
    FormProps,
    notification
} from "antd";
import { generateTransactionCode } from '@/utils';


export const useAdminTable = () => {

}
const splitArr = ({ data }: any) => {
    return groupBy(data, "timeClusterId");
};

const defaultSelected = {
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
    applyDiscount: "",
    transactionCode: "",
}

export default function useAdmin() {
    const { socket, getCourts, getInfo, createSchedules, sendUpdateSchedulesManual, sendUpdateFixedSchedulesManual, authenticateAdmin } = useSocket();

    /**
     * Xác thực mật khẩu admin ở phía server.
     *
     * Bản cũ so sánh mật khẩu với một literal hardcode ngay tại đây, tức mật
     * khẩu nằm trong JS bundle gửi cho mọi khách truy cập, còn server thì nhận
     * `schedules:manual` từ bất kỳ ai mà không kiểm tra gì. Giờ mật khẩu chỉ
     * được so sánh ở server và quyền được đánh dấu trên chính socket đó.
     *
     * @returns true nếu hợp lệ; nếu không, đã hiện thông báo lỗi và trả false.
     */
    const requireAdmin = async (password: string) => {
        const res = await authenticateAdmin(password);
        if (!res?.success) {
            api.open({
                message: "Mật khẩu không hợp lệ",
                description: res?.error || "Vui lòng điền mật khẩu được cấp.",
                duration: 3,
                type: "error"
            });
            return false;
        }
        return true;
    };

    const router = useRouter();

    const [api, contextHolder] = notification.useNotification();


    const [isShowModel, setShowModel] = React.useState(false)
    const [isShowSetFixedModel, setShowSetFixedModel] = React.useState(false)

    const [rangeDate, setRangeDate] = React.useState({
        startDate: "",
        endDate: "",
    });

    const [specificsDate, setSpecificsDate] = React.useState<string[]>([
        new Date().toDateString(),
    ]);

    const [listFac, setListFac] = React.useState<FacilitiesInfo[]>([])

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
    const [selectedBookedTimeSlots, setSelectedBookedTimeSlots] = React.useState<any>({});

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

    const onFinishSetFixed: FormProps<any>['onFinish'] = async (values) => {
        try {
            await sendUpdateFixedSchedulesManual({ data: values })
        } catch (error) {
            console.log("error", error)
        }
    };

    const onFinishFailed: FormProps<any>['onFinishFailed'] = (errorInfo) => {
        console.log('Failed:', errorInfo);
    };

    const onFormUnlockSubmit = async (values: any) => {
        const { password } = values;
        if (!(await requireAdmin(password))) {
            setProcessing(false);
            return;
        }
        const timeSlotData = _.flatMap(Object.values(selectedBookedTimeSlots)).map((timeSlots: any) => {
            return {
                ...timeSlots,
                status: "empty",
                bookedBy: { name: "", phone: "" },
                isChange: false
            };
        });
        try {
            await sendUpdateSchedulesManual({
                data: {
                    ...selected,
                    dates: Object.keys(selectedTimeSlots),
                    totalPrice: 0
                },
                timeSlotData
            }, "update")

            setSelectedBookedTimeSlots({});
        } catch (error) {
            console.log("error", error)
        }

    }

    const onFormPassSubmit = async (values: any) => {
        const { password } = values;
        if (!(await requireAdmin(password))) {
            setProcessing(false);
            return;
        }
        const timeSlotData = _.flatMap(Object.values(selectedBookedTimeSlots)).map((timeSlots: any) => {
            return {
                ...timeSlots,
                status: "pass",
                isChange: false
            };
        });
        try {
            await sendUpdateSchedulesManual({
                data: {},
                timeSlotData
            }, "update")
            setSelectedBookedTimeSlots({});
        } catch (error) {
            console.log("error", error)
        }

    }

    const onFormEditSubmit = async (values: any) => {
        const { name, phone, password } = values;
        if (!name || !phone || !password) {

            return api.open({
                message: "Thiếu thông tin",
                description: "Vui lòng điền đầy đủ thông tin",
                duration: 3,
                type: "error"
            });
        }
        if (!(await requireAdmin(password))) {
            return;
        }
        const timeSlotData = _.flatMap(Object.values(selectedBookedTimeSlots)).map((timeSlots: any) => {
            return {
                ...timeSlots,
                bookedBy: { name, phone },
                isChange: false,
                status: "booked"
            };
        });

        try {
            const totalPrice = selected.totalHours * pricePerHour;
            await sendUpdateSchedulesManual({
                data: {
                    ...selected,
                    dates: Object.keys(selectedTimeSlots),
                    totalPrice
                },
                timeSlotData
            }, "update")

            setSelectedBookedTimeSlots({});
        } catch (error) {
            console.log("error", error)
        }

        // setSelected(defaultSelected);

    }

    const onFormFinishUpdateInfo = async (values: any) => {
        setProcessing(true);
        const { name, phone, password, status } = values;
        if (!name || !phone || !password) {
            setProcessing(false);
            return api.open({
                message: "Thiếu thông tin",
                description: "Vui lòng điền đầy đủ thông tin",
                duration: 3,
                type: "error"
            });
        }

        if (!(await requireAdmin(password))) {
            setProcessing(false);
            return;
        }
        const timeSlotData = _.flatMap(Object.values(selectedTimeSlots)).map((timeSlots: any) => {
            return {
                ...timeSlots,
                status,
                isFixed,
                bookedBy: { name, phone },
            };
        });
        try {
            const totalPrice = selected.totalHours * pricePerHour;
            const address = Object.keys(selected.facility)?.map((key) => (facilitiesInfo[key].id))

            await sendUpdateSchedulesManual({
                data: {
                    ...selected,
                    dates: Object.keys(selectedTimeSlots),
                    totalPrice,
                    address
                },
                timeSlotData,
            }, status === "booked" ? "add" : "fixed")

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
            transactionCode: generateTransactionCode(),
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
    const handleNotPendingUpdateCell = ({ cloneSelected, row, detail, currentDate, formateddetail }: any) => {
        cloneSelected.details = cloneSelected.details.filter(
            (item: any) => item !== detail
        );
        cloneSelected.formateddetails = cloneSelected.formateddetails.filter(
            (item: any) => item !== formateddetail
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
        if (cell.status === "booked" || cell.status === "pass" || cell.status === "fixed") {

            if (cell.isChange) {
                return setSelectedBookedTimeSlots((prevSlots: any) => ({
                    ...prevSlots,
                    [currentDate.toLocaleDateString()]: [
                        ...(prevSlots[currentDate.toLocaleDateString()] || []),
                        cell
                    ]
                }));
            }
            return setSelectedBookedTimeSlots((prevState: any) => {
                const newState = { ...prevState };
                delete newState[currentDate.toLocaleDateString()];
                return newState;
            });
        }
        const row = facilities[currentDate.toDateString()][cluster][rowIndex];
        const detail: string = `${row.court} - ${cell.from} đến ${cell.to}`;
        const formateddetail: string = `${row.court} - ${cell.from} đến ${cell.to} (${new Intl.DateTimeFormat('en-GB').format(new Date(currentDate))} - ${row.facility})`;
        let cloneSelected: any = { ...selected };

        if (cell.status === "pending") {
            cloneSelected.details.push(detail);
            cloneSelected.formateddetails.push(formateddetail);

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
            handleNotPendingUpdateCell({ cloneSelected, row, detail, currentDate, formateddetail })
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
            return {
                ...preState, totalHours,
                details: cloneSelected.details,
                formateddetails: cloneSelected.formateddetails
            };
        });
    };
    const defaultValue = [dayjs()];

    React.useEffect(() => {
        getInfo({ isAdmin: true, selectedDate: new Date() }).then((data) => {
            // setPaymentInfo(data.paymentInfo[0]);
            setfacilitiesInfo(keyBy(data.facilities, "id"));
            setSelectedFacInfo(data.facilities);
            setListFac(data.facilities)
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
            ).then((res) => {
                // Server chỉ gửi bộ khung sân + ô đã bị chiếm; 22 ô mỗi sân được
                // dựng ở client từ data/timeSlots.json. Nhờ vậy một range 30
                // ngày không còn kéo về ~2MB document nữa.
                const mapped = buildGridByDate(res.courts || [], res.occupied || [], res.dates || []);

                // Khôi phục các ô admin đang chọn (trạng thái chỉ có ở client).
                for (const date of Object.keys(mapped)) {
                    const pending = selectedTimeSlots[new Date(date).toLocaleDateString()] || [];
                    for (const item of pending) {
                        const { cluster, columnIndex } = item.index || {};
                        const rows = mapped[date]?.[cluster];
                        if (!rows) continue;

                        for (const row of rows) {
                            if (row.facility !== item.facility || row.court !== item.court) continue;
                            // Chỉ khôi phục nếu ô vẫn trống — nếu có người khác
                            // đã đặt thì phải hiện trạng thái thật.
                            if (row[columnIndex]?.status === "empty") {
                                row[columnIndex] = item;
                            }
                        }
                    }
                }

                setFacilities(mapped);
                setIsLoading(false);
            });
        }
    }, [selectedFacInfo, getCourts, specificsDate, rangeDate]);

    React.useEffect(() => {
        // Có cleanup: bản cũ không gọi socket.off nên handler tích luỹ vô hạn
        // qua mỗi lần điều hướng (socket là singleton, dep không bao giờ đổi).
        const onUpdated = (arg: any[]) => {
            setFacilities((preState: any) => {
                const next: any = {};

                for (const date of Object.keys(preState)) {
                    const byCluster = preState[date] || {};
                    next[date] = {};

                    for (const cluster of clusters) {
                        const rows = byCluster[cluster.id] || [];
                        next[date][cluster.id] = rows.map((row: any) => {
                            const patches = arg.filter(
                                (cell) =>
                                    row.facility === cell.facility &&
                                    row.courtId === cell.id &&
                                    row.createdAt === cell.index?.createdAt
                            );
                            if (patches.length === 0) return row;

                            // Clone thay vì mutate state cũ tại chỗ.
                            const clone = { ...row };
                            for (const cell of patches) clone[cell.index.columnIndex] = cell;
                            return clone;
                        });
                    }
                }
                return next;
            });
        };

        socket.on("schedules:updated", onUpdated);
        return () => {
            socket.off("schedules:updated", onUpdated);
        };
    }, [socket]);
    return {
        isLoading,
        isFixed,
        selected,
        listFac,
        isProcessing,
        isShowSetFixedModel,
        isShowModel,
        facilities,
        contextHolder,
        pricePerHour,
        defaultValue,
        discountInfo,
        discountCode,
        selectedBookedTimeSlots,
        onFinishSetFixed,
        onFinishFailed,

        onFormEditSubmit,
        onFormUnlockSubmit,
        onFormPassSubmit,
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
        setShowSetFixedModel,
        onFormFinishUpdateInfo
    }
}
