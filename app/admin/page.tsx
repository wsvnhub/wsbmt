"use client";
import React from "react";
import {
  Button,
  Checkbox,
  DatePicker,
  DatePickerProps,
  Form,
  Input,
  notification,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import useSocket from "@/socket/useSocket";
import ScheduleTable from "@/components/ScheduleTable";
import { FacilitiesInfo } from "../page2";
import { groupBy, keyBy } from "lodash";
import Loader from "@/components/Loader";
import { useRouter } from "next/navigation";
import { VND } from "@/utils";
import clusters from "@/data/clusters.json";
import _ from "lodash";

const splitArr = ({ data }: any) => {
  return groupBy(data, "timeClusterId");
};

const bgColor = [
  "bg-emerald-200",
  "bg-zinc-200",
  "bg-zinc-300",
  "bg-lime-400",
  "bg-lime-300",
  "bg-green-300",
  "bg-green-600",
  "bg-emerald-500",
  "bg-emerald-300",
  "bg-teal-400",
];

const bgCell = {
  booked: "bg-table-col3",
  pending: "bg-orange-400",
  wait: "bg-yellow-500",
  empty: "bg-white",
};

export default function Page() {
  const { socket, getCourts, getInfo, createSchedules } = useSocket();

  const router = useRouter();

  const [api, contextHolder] = notification.useNotification();

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
  const [selected, setSelected] = React.useState<any>({
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
  });
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
        body: JSON.stringify({ code: discountCode }),
      });
      const res = await response.json();

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

  const onFormFinish = async (values: any) => {
    setProcessing(true);
    const { name, phone, email } = values;
    if (!name || !phone || !email) {
      setProcessing(false);
      return api.open({
        message: "Thiếu thông tin",
        description: "Vui lòng điền đầy đủ thông tin",
        duration: 3000,
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
      setSelected({});
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

  if (isLoading) {
    return <Loader />;
  }
  return (
    <>
      {contextHolder}
      <header className="p-6 lg:sticky bg-primary top-0 flex flex-col justify-center gap-4 justify-between z-30">
        <h1 className="flex gap-4 text-2xl font-bold text-center">
          <img src="./logo.png" alt="logo" />
          Ways Station Badminton
        </h1>
        <div className="flex lg:flex-row flex-col items-center gap-4">
          <div className="flex lg:flex-row flex-col items-center gap-6">
            <DatePicker.RangePicker
              style={{ fontWeight: 500, width: 250 }}
              format={"DD/MM/YYYY"}
              className="text-primary"
              placeholder={["Ngày bắt đầu", "Ngày kết thúc"]}
              onChange={(dates: any) => {
                if (!dates) {
                  return;
                }
                const [stateDate, endDate] = dates;
                return setRangeDate({
                  startDate: stateDate.toDate().toDateString(),
                  endDate: endDate.toDate().toDateString(),
                });
              }}
              superPrevIcon={<div className="text-primary">-</div>}
              suffixIcon={
                <svg
                  width={24}
                  height={24}
                  viewBox="0 0 35 35"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M23.3333 2.91663V8.74996M11.6667 2.91663V8.74996M4.375 14.5833H30.625M7.29167 5.83329H27.7083C29.3192 5.83329 30.625 7.13913 30.625 8.74996V29.1666C30.625 30.7775 29.3192 32.0833 27.7083 32.0833H7.29167C5.68084 32.0833 4.375 30.7775 4.375 29.1666V8.74996C4.375 7.13913 5.68084 5.83329 7.29167 5.83329Z"
                    stroke="#019D81"
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />

            <DatePicker
              // pickerValue={dayjs()}
              suffixIcon={
                <svg
                  width={32}
                  height={32}
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9.6665 25.5L15.9998 20.6708L22.3332 25.5L19.9582 17.6625L26.2915 13.15H18.5332L15.9998 4.91666L13.4665 13.15H5.70817L12.0415 17.6625L9.6665 25.5ZM15.9998 31.8333C13.8096 31.8333 11.7512 31.4177 9.82484 30.5865C7.89845 29.7552 6.22275 28.6271 4.79775 27.2021C3.37275 25.7771 2.24463 24.1014 1.41338 22.175C0.582129 20.2486 0.166504 18.1903 0.166504 16C0.166504 13.8097 0.582129 11.7514 1.41338 9.825C2.24463 7.89861 3.37275 6.22291 4.79775 4.79791C6.22275 3.37291 7.89845 2.24479 9.82484 1.41354C11.7512 0.582289 13.8096 0.166664 15.9998 0.166664C18.1901 0.166664 20.2484 0.582289 22.1748 1.41354C24.1012 2.24479 25.7769 3.37291 27.2019 4.79791C28.6269 6.22291 29.755 7.89861 30.5863 9.825C31.4175 11.7514 31.8332 13.8097 31.8332 16C31.8332 18.1903 31.4175 20.2486 30.5863 22.175C29.755 24.1014 28.6269 25.7771 27.2019 27.2021C25.7769 28.6271 24.1012 29.7552 22.1748 30.5865C20.2484 31.4177 18.1901 31.8333 15.9998 31.8333ZM15.9998 28.6667C19.5359 28.6667 22.5311 27.4396 24.9853 24.9854C27.4394 22.5312 28.6665 19.5361 28.6665 16C28.6665 12.4639 27.4394 9.46875 24.9853 7.01458C22.5311 4.56041 19.5359 3.33333 15.9998 3.33333C12.4637 3.33333 9.46859 4.56041 7.01442 7.01458C4.56025 9.46875 3.33317 12.4639 3.33317 16C3.33317 19.5361 4.56025 22.5312 7.01442 24.9854C9.46859 27.4396 12.4637 28.6667 15.9998 28.6667Z"
                    fill="#019D81"
                  />
                </svg>
              }
              style={{ fontWeight: 500, width: 250 }}
              multiple
              onChange={onChange}
              maxTagCount="responsive"
              defaultValue={defaultValue}
              size="large"
              format={"dd"}
              placeholder="Chọn thứ"
            />
          </div>
          <div className="lg:my-4">
            <Checkbox
              defaultChecked
              name="CN NVL"
              onChange={(e) =>
                handleChangeFacilitiesInfo(
                  e.target.name || "",
                  e.target.checked
                )
              }
            >
              <p className="text-white text-base">
                NVL = Sân Nguyễn Văn Lượng, Gò Vấp
              </p>
            </Checkbox>
            <p></p>
            <Checkbox
              defaultChecked
              onChange={(e) =>
                handleChangeFacilitiesInfo(
                  e.target.name || "",
                  e.target.checked
                )
              }
              name="CN DQH"
            >
              <p className="text-white text-base">
                DQH = Sân Dương Quảng Hàm, Gò Vấp
              </p>
            </Checkbox>
            <p></p>
            <Checkbox
              defaultChecked
              name="CN NQA"
              onChange={(e) =>
                handleChangeFacilitiesInfo(
                  e.target.name || "",
                  e.target.checked
                )
              }
            >
              <p className="text-white text-base">
                NQA = Sân Nguyễn Quý Anh, Tân Phú
              </p>
            </Checkbox>
          </div>
          <div className="flex flex-col lg:flex-row gap-2 items-center">
            <div className="flex items-center flex-wrap gap-2">
              <div className="flex items-center justify-center gap-2">
                <div className="bg-white w-6 h-6 text-xs rounded-md"></div>
                <span>Trống</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="bg-table-col3 w-6 h-6 text-xs rounded-md"></div>
                <span>Đã đặt</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="bg-yellow-500 w-6 h-6 text-xs rounded-md"></div>
                <span>Chờ thanh toán</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="bg-orange-400 w-6 h-6 text-xs rounded-md"></div>
                <span>Đang chọn</span>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="bg-white">
        <div className="pb-12">
          <div className="flex flex-col gap-4">
            {Object.keys(facilities).map((date, index) => {
              return (
                <div
                  key={index}
                  className={`${bgColor[index < bgColor.length ? index : 0]
                    } px-2 pb-6 pt-4`}
                >
                  <p className="text-primary text-md font-semibold mb-2">
                    {dayjs(date).format("dd")} {dayjs(date).format("DD/MM")}
                  </p>
                  <div className="flex flex-col gap-4">
                    {clusters.map(({ id }, index) => {
                      return (
                        <ScheduleTable
                          isAdmin
                          key={index}
                          tableInex={index}
                          slotWidth={60}
                          data={facilities[date][id]}
                          bgCell={bgCell}
                          cluster={id}
                          selectedDate={new Date(date)}
                          handleCellClick={handleCellClick}
                          handleScrollChange={handleScrollChange}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
      <div className="flex flex-wrap justify-between items-center bg-primary lg:sticky fixeds bottom-0 left-0 right-0 p-4 z-20">
        <div className="items-center mb-2 font-semibold">
          <p>Đang chọn: {selected.totalHours}h00</p>
          <p>
            Tổng:
            {VND.format(selected.totalHours * pricePerHour)}
          </p>
        </div>
        <div>
          <Checkbox onChange={(e) => setFixed(e.target.checked)}>
            <p className="text-white">Đặt cố định?</p>
          </Checkbox>
        </div>

        <Form
          layout="vertical"
          onFinish={onFormFinish}
          className="flex flex-wrap items-center gap-4 relative"
        >
          <Form.Item
            name="name"
            label="Tên người đặt (*)"
            rules={[{ required: false }]}
          >
            <Input
              className="w-full lg:w-[150px] text-black placeholder-gray-400"
              name="name"
              placeholder="Nhập tên của bạn"
            />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Số điện thoại (*)"
            rules={[{ required: false }]}
          >
            <Input
              className="w-full lg:w-[150px] text-black placeholder-gray-400"
              name="phone"
              placeholder="Nhập số của bạn"
            />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email (*)"
            rules={[{ required: false, type: "email" }]}
          >
            <Input
              className="w-full lg:w-[150px] text-black placeholder-gray-400"
              name="email"
              placeholder="Nhận email để nhận  xác nhận sân"
            />
          </Form.Item>
          <Form.Item
            label="Nhập mã Khuyến mại (Nếu có)"
            validateStatus="success"
            help={
              discountInfo.isApplyDiscount &&
              "Mã thành công. Giá đã được áp dụng"
            }
          >
            <div className="flex items-center">
              <Input
                className="text-black placeholder-gray-400"
                placeholder="Nhập mã"
                onChange={(e) => setDiscountCode(e.target.value)}
              />

              <Button
                disabled={discountCode === ""}
                className="w-[170px] border-0 h-[34px] bg-black/40 py-2 px-4 mr-6 text-white font-semibold rounded-lg"
                loading={isProcessing}
                onClick={onVerifyCode}
              >
                Kiểm tra
              </Button>
            </div>
          </Form.Item>
          <Button
            disabled={selected.totalHours === 0 || isProcessing}
            htmlType="submit"
            className="w-full border-0 disabled:opacity-80 text-white lg:w-auto bg-gradient-to-b from-blue-500 to-cyan-500 py-2  px-4 font-semibold rounded-md"
          >
            Thanh toán
          </Button>
        </Form>
      </div>
    </>
  );
}
