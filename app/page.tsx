"use client";
import React from "react";
import ScheduleTable from "@/components/ScheduleTable";
import ConfirmPayments from "@/components/payments";
import WaitPayments from "@/components/payments/Wait";
import ResultPayments from "@/components/payments/Result";

import { Alert } from "antd";
import Marquee from 'react-fast-marquee';

import Loader from "@/components/Loader";
import { VND } from "@/utils";
import clusters from "@/data/clusters.json";
import _ from "lodash";
import { Header } from "@/components/Header";
import LightBox from "@/components/LightBox";
import useBooking from "@/hooks/useBooking";
import ListFac from "@/components/Branch";


const btnText = {
  schedule: "Tiếp theo",
  confirm: "Xác nhận và thanh toán",
  info: "Kiểm tra giao dịch",
  result: "Đặt thêm",
};


const notificationText = '(Quý KH thuê sân để tổ chức giải hoặc ghi hình cần liên hệ 0389145575 trước, nếu không, Ways có quyền từ chối) - (Quý KH nhớ bỏ chọn sân không cần check lịch khi thao tác đặt để tránh nhầm chi nhánh) - (Sơ đồ sân HB: Sân 1+2) - (Sơ đồ sân NQA: Sân 1; Sân 2+3; Sân 4+5+6) - (Sơ đồ sân NVL: Sân 1+2; Sân 3+4; Sân 5+6+7 ) - (Sơ đồ sân DQH: Sân 1; Sân 2+3; Sân 4)'

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

  const {
    isLoading,
    isSchedule,
    selectedDate,
    slotWidth,
    listFac,
    page,
    isShowResult,
    isConfirm,
    selected,
    isShowInfo,
    facilitiesInfo,
    facilities,
    selectedTimeSlots,
    pricePerHour,
    contextHolder,
    paymentInfo,
    headerPadding,
    setSelectedDate,
    handleResize,
    handleChangePage,
    handleScrollChange,
    handleCellClick,
    handleRadioSelectBranch,
    // handleChangeFacilitiesInfo 
  } = useBooking()

  if (isLoading) {
    return <Loader />;
  }

  return (
    <>
      {isSchedule && (
        <>
          <p className="hidden lg:block sticky top-0 left-0 z-40 bg-primary">
            Để xem giờ tối: Nhấn giữ Shift và Scroll để cuộn ngang
          </p>
          <Alert className="sticky top-6 left-0 z-40" banner message={
            <Marquee pauseOnHover gradient={false}>
              {notificationText}
            </Marquee>
          } />
        </>
      )}
      <LightBox
        listFac={listFac}
        handleSelectedDate={setSelectedDate}
        handleChangeFacilitiesInfo={handleRadioSelectBranch}
      />

      {contextHolder}

      <Header headerPadding={headerPadding}
        isSchedule={isSchedule}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
      >
        <ListFac
          type="radio"
          listFac={listFac}
          handleChangeFacilitiesInfo={handleRadioSelectBranch} />
      </Header>

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
          timslots={_.flatMap(Object.values(selectedTimeSlots))}
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
            className="w-full disabled:opacity-80 bg-gradient-to-b from-[#FA9654] to-[#CC3D00] p-4 font-semibold rounded-md"
          >
            {btnText[page.state]}
          </button>
        </div>
      )}
    </>
  );
}
