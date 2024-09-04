"use client";
import ResultPayments from "@/components/payments/Result";
import WaitPayments from "@/components/payments/Wait";
import useSocket from "@/socket/useSocket";
import React from "react";

export default function Page(props: any) {
  const {
    params: { id },
  } = props;
  const { getInfo } = useSocket();
  const [data, setData] = React.useState<any>({});
  const [paymentInfo, setPaymentInfo] = React.useState({});
  React.useEffect(() => {
    getInfo().then((data) => {
      setPaymentInfo(data.paymentInfo[0]);
    });
  }, [getInfo]);
  React.useEffect(() => {
    fetch(`/api/get-schedules-Info?id=${id}`)
      .then((response) => response.json())
      .then((responseData) => {
        if (responseData.data) {
          setData(responseData.data);
        }
      });
  }, [id]);
  return (
    <div>
      <header className="p-6 lg:sticky bg-primary top-0 flex flex-col justify-center gap-4 justify-between z-30">
        <a href="/admin" className="flex gap-4 text-2xl font-bold text-center">
          <img src="../logo.png" alt="logo" />
          Ways Station Badminton
        </a>
      </header>
      <WaitPayments
        data={data}
        totalPrice={data.totalPrice}
        paymentInfo={paymentInfo}
        btnText={{ info: "Kiểm tra" }}
        currentPage={"info"}
        timslots={data.timeSlots}
        handleChangePage={function (state: any): void {
          throw new Error("Đã thanh toán");
        }}
      />
    </div>
  );
}
