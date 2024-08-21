"use client";
import React, { useState } from "react";
import ScheduleTable from "@/components/ScheduleTable";
import ConfirmPayments from "@/components/payments";
import WaitPayments from "@/components/payments/Wait";
import ResultPayments from "@/components/payments/Result";
import { Checkbox, DatePicker, notification } from "antd";
import useSocket from "@/socket/useSocket";
import Loader from "@/components/Loader";
import { groupBy, keyBy } from "lodash";
import { VND } from "@/utils";
import clusters from "@/data/clusters.json";

interface PageState {
  state: "schedule" | "confirm" | "info" | "result";
}
const btnText = {
  schedule: "Tiếp theo",
  confirm: "Xác nhận và thanh toán",
  info: "Đã thanh toán",
  result: "Đặt thêm",
};
const nextPages = {
  schedule: "confirm",
  confirm: "info",
  info: "result",
  result: "schedule",
};

// export const VND = new Intl.NumberFormat("vi-VN", {
//   style: "currency",
//   currency: "VND",
// });

export interface FacilitiesInfo {
  id: string;
  name: string;
  address: string;
  pricePerHour: string;
}

const minWidth = 60;

export default function Home() {
  const { getInfo, getCourts, socket, createSchedules, sendUpdateSchedules } =
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
  const [selectedFacInfo, setSelectedFacInfo] = useState<FacilitiesInfo[]>([]);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selected, setSelected] = useState<any>({
    totalHours: 0,
    totalPrice: 0,
    details: [],
    facility: {},
    phone: "",
    userName: "",
    email: "",
    date: selectedDate.toLocaleDateString(),
    isFixed: false,
    applyDiscount: false,
    transactionCode: "",
  });
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<any[]>([]);

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
    getInfo().then((data) => {
      setPaymentInfo(data.paymentInfo[0]);
      setfacilitiesInfo(keyBy(data.facilities, "id"));
      setSelectedFacInfo(data.facilities);
      setPricePerHour(data.facilities[0].pricePerHour);
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
        setFacilities(groupBy(data, "timeClusterId"));
        setIsLoading(false);
      });
    }
  }, [selectedFacInfo, getCourts, selectedDate]);

  React.useEffect(() => {
    socket.on("schedules:updated", (arg) => {
      return setFacilities((preState: any) => {
        const data = clusters.reduce((memo: any, cluster) => {
          const items = preState[cluster.id];
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
    _date: Date,
    cluster: string
  ) => {
    const row = facilities[cluster][rowIndex];
    const detail: string = `${row.court} - ${cell.from} đến ${cell.to}`;
    let cloneSelected: any = { ...selected };

    if (cell.status === "pending") {
      cloneSelected.details.push(detail);

      cell.id = row.courtId;
      cell.facility = row.facility;
      cell.court = row.court;

      setSelectedTimeSlots([
        ...selectedTimeSlots,
        {
          ...cell,
          index: {
            tableIndex,
            rowIndex,
            columnIndex,
            createdAt: row.createdAt,
          },
        },
      ]);
    } else {
      cloneSelected.details = cloneSelected.details.filter(
        (item: any) => item !== detail
      );
      const filtered = selectedTimeSlots.filter(
        (item) => item.id !== row.courtId && item.facility !== row.facility
      );
      setSelectedTimeSlots(filtered);
    }

    setFacilities((preState: any) => {
      preState[cluster][rowIndex][columnIndex] = cell;
      return { ...preState };
    });

    return setSelected((preState: any) => {
      let totalHours = preState.totalHours;
      preState.facility[row.facility] = row.facility;
      totalHours += cell.status === "pending" && totalHours >= 0 ? 1 : -1;
      return { ...preState, totalHours, details: cloneSelected.details };
    });
  };
  const handleChangeFacilitiesInfo = (name: string, checked: boolean) => {
    const filtered = Object.values(facilitiesInfo).filter((item) =>
      checked ? item.id === name : item.id !== name
    );
    if (checked) {
      return setSelectedFacInfo([...selectedFacInfo, filtered[0]]);
    }
    return setSelectedFacInfo(filtered);
  };
  const handleChangePage = async (newState: any) => {
    if (isSchedule) {
      setSelected((pre: any) => ({
        ...pre,
        date: selectedDate.toLocaleDateString(),
        timeSlots: selectedTimeSlots,
        totalPrice: selected.totalHours * Number(pricePerHour),
      }));
    }
    if (isConfirm) {
      newState.transactionCode = `WSB${new Date().getTime()}`;
      newState.details =
        typeof newState.details === "string"
          ? newState.details
          : newState.details.join(";");

      const timeSlotData = selectedTimeSlots.map((timeSlots) => {
        timeSlots.bookedBy = { name: newState.userName, phone: newState.phone };
        timeSlots.status = "wait";
        timeSlots.isFixed = newState.isFixed;
        return timeSlots;
      });
      try {
        const res = await createSchedules(newState, timeSlotData);

        if (!res.success) {
          return api.open({
            message: "Giờ đặt không hợp lệ",
            description: "Đã có người đặt sân vào thời gian này.",
            duration: 3000,
            type: "error",
          });
        }

        api.open({
          type: "success",
          message: "Tạo đơn thành công!",
        });
        setSelected(newState);
      } catch (error) {
        console.log(error);
      }
    }

    if (isShowInfo) {
      console.log("newState", newState);
      await sendUpdateSchedules(newState.data);
    }
    if (isShowResult) {
      setSelected({});
      setSelectedDate(new Date());
    }

    return setPage({ state: nextPages[page.state] as PageState["state"] });
  };

  const handleResize = (value: number) => {
    return setSlotWidth(value);
  };

  if (isLoading) {
    return <Loader />;
  }
  return (
    <>
      {isSchedule && (
        <p className="hidden lg:block sticky top-0 left-0 z-40">
          Nhấn giữ shift để cuộn ngang
        </p>
      )}
      {contextHolder}
  import React, { useState } from 'react';

const Header = ({ isSchedule, headerPadding, setSelectedDate, selectedDate, handleChangeFacilitiesInfo }) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const openLightbox = () => {
    setIsLightboxOpen(true);
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
  };


<header
        className={${headerPadding} lg:sticky bg-primary top-0 flex flex-col lg:flex-row items-center lg:gap-4 gap-2 justify-between z-30}
      >
        <h1 className="text-xl font-semibold my-2 text-center lg:text-left lg:mb-0">
          {isSchedule && (
            <>
              Đặt sân theo giờ <br />
            </>
          )}
          Ways Station Badminton
        </h1>
        {isSchedule && (
          <>
            <div className="flex justify-center items-center gap-4">
              <button
              onClick={openLightbox}
              className="text-white underline italic"
            >
              Bảng giá
            </button>

              <input
                onChange={(e) => setSelectedDate(new Date(e.target.value))}
                className="bg-white text-primary font-semibold pl-6 pr-2 py-2 rounded-md"
                type="date"
                placeholder="dd-mm-yyyy"
                value={selectedDate.toISOString().substring(0, 10)}
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
                <p className="text-white text-md">
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
                <p className="text-white text-md">
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
                <p className="text-white text-md">
                  NQA = Sân Nguyễn Quý Anh, Tân Phú
                </p>
              </Checkbox>
              
            </div>
            <div className="w-full lg:w-auto flex flex-row-reverse lg:flex-col gap-2 lg:gap-4 items-center">
              <a
                href="tel:0389145575"
                className="w-5/12 text-right lg:w-full p-2 lg:py-2 lg:px-4 rounded-lg font-semibold italic text-[10px] lg:text-[15px] bg-gradient-to-b from-blue-500 to-cyan-500"
              >
                Khách đặt lịch cố định: <br /> Gọi 0389145575
              </a>
              <div className="w-7/12 lg:w-full flex items-center gap-2 lg:gap-6 text-[8px]">
                <div className="flex items-center justify-center gap-2">
                  <div className="bg-white w-4 h-4 lg:w-6 lg:h-6 rounded-sm lg:rounded-md"></div>
                  <span>Trống</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="bg-red-400 w-4 h-4 lg:w-6 lg:h-6 rounded-sm lg:rounded-md"></div>
                  <span>Đã đặt</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="bg-yellow-500 w-4 h-4 lg:w-6 lg:h-6 rounded-sm lg:rounded-md"></div>
                  <span>Đang chọn</span>
                </div>
              </div>
            </div>
          </>
        )}
{isLightboxOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50">
          <div className="relative">
            <img src="https://w.ladicdn.com/5dc39976770cd34186edd2d3/badminton-gioi-thieu-chung-popup-web-dat-san-20240821083954-ceix4.jpg" alt="Bảng giá" className="max-w-full h-auto" />
            <button
              onClick={closeLightbox}
              className="absolute top-0 right-0 mt-2 mr-2 bg-white rounded-full p-2"
            >
              X
            </button>
          </div>
        </div>
      )}

      </header>

 );
};

export default Header;

      {isSchedule && (
        <main className="bg-[#edfff6] p-2 lg:p-6 relative">
          <div className="pb-12">
            <div className=" flex flex-col gap-4">
              {clusters.map(({ id }, index) => {
                return (
                  <ScheduleTable
                    key={index}
                    tableInex={index}
                    slotWidth={slotWidth}
                    cluster={id}
                    data={facilities[id]}
                    selectedDate={selectedDate}
                    handleCellClick={handleCellClick}
                    handleScrollChange={handleScrollChange}
                  />
                );
              })}
            </div>
          </div>
          <div className="w-full lg:w-1/5 px-4 py-3 flex items-center border shadow-lg rounded-3xl bg-white absolute bottom-4 right-0 lg:right-4">
            <input
              className="w-full"
              type="range"
              min={minWidth}
              max="200"
              value={slotWidth}
              onChange={(e) => handleResize(Number(e.target.value))}
            />
          </div>
        </main>
      )}

      {isConfirm && (
        <ConfirmPayments
          data={selected}
          facilitiesInfo={facilitiesInfo}
          btnText={btnText}
          currentPage={page.state}
          handleChangePage={handleChangePage}
        />
      )}
      {isShowInfo && (
        <WaitPayments
          data={selected}
          totalPrice={selected.totalPrice}
          paymentInfo={paymentInfo}
          btnText={btnText}
          currentPage={page.state}
          timslots={selectedTimeSlots}
          handleChangePage={handleChangePage}
        />
      )}
      {isShowResult && (
        <ResultPayments
          data={selected}
          totalPrice={selected.totalPrice}
          facilitiesInfo={facilitiesInfo}
          paymentInfo={paymentInfo}
          btnText={btnText}
          currentPage={page.state}
          handleChangePage={handleChangePage}
        />
      )}

      {isSchedule && (
        <div className="bg-primary lg:sticky fixeds bottom-0 left-0 right-0 p-4 z-20">
          <div className="flex items-center justify-between mb-2 font-semibold">
            <p>Đang chọn: {selected.totalHours}h00</p>
            <p>
              Tổng:
              {VND.format(selected.totalHours * pricePerHour)}
            </p>
          </div>
          <button
            disabled={selected.totalHours === 0}
            onClick={handleChangePage}
            className="w-full disabled:opacity-80 bg-gradient-to-b from-blue-500 to-cyan-500 p-4 font-semibold rounded-md"
          >
            {btnText[page.state]}
          </button>
        </div>
      )}
    </>
  );
}
