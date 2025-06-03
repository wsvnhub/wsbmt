import React from "react";
import {
  // Button,
  CountdownProps, Image, Statistic, Typography
} from "antd";
import { VND } from "@/utils";
import { io } from "socket.io-client";

const Text = ({ title, content, isCopyable = false }: any) => {
  return (
    <div className="flex">
      <span className="w-[100px] "> {title}:</span>

      <Typography.Paragraph strong copyable={isCopyable && { tooltips: false }}>
        {content}
      </Typography.Paragraph>
    </div>
  );
};

interface WaitPaymentsProps {
  data: any;
  totalPrice: number;
  paymentInfo: any;
  btnText: any;
  currentPage: string;
  timslots: any[];
  handleChangePage: (state: any) => void;
}
const isDev = false

const SOCKET_URL = isDev ? "http://0.0.0.0:5005" : "https://tt.ways.io.vn"

export default function WaitPayments({
  data,
  totalPrice = 0,
  // btnText,
  paymentInfo,
  // currentPage,
  timslots,
  handleChangePage,
}: WaitPaymentsProps) {
  const deadline = React.useRef(Date.now() + 1500 * 60 * 10).current;
  // const openDeadline = React.useRef(Date.now() + 1000 * 60 * 1).current;
  // const [isLoading, setIsLoading] = React.useState(false);
  const [alertMessage, setAlertMessage] = React.useState<string>();
  const [_isOpenVerify, setOpenVerify] = React.useState(false)


  const onFinish: CountdownProps["onFinish"] = async () => {
    setOpenVerify(false)
    try {
      const response = await fetch('/api/time-slots', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: data.schedulesId, timeSlotsData: timslots }),
      });

      if (response.ok) {
        setAlertMessage("Hết thời gian chờ, đơn hàng của bạn đã bị huỷ");
      } else {
        setAlertMessage("Đơn hàng của bạn đã bị huỷ");
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
      setAlertMessage("Có lỗi xảy ra khi huỷ đơn hàng");
    }
  };

  React.useEffect(() => {
    const socket = io(SOCKET_URL, { query: { user_id: data.phone }, autoConnect: true });

    // Định nghĩa handler cho balanceUpdated ở đây để có thể tham chiếu trong off
    const handleBalanceUpdated = () => {
      console.log(`[SOCKET EVENT - WaitPayments] balanceUpdated received at ${new Date().toISOString()}`);
      const updatedData = timslots.map((timeSlot: any) => ({ ...timeSlot, status: "booked" }));
      // Hãy cẩn thận với việc gọi handleChangePage ở đây.
      // Nó có thể gây ra side effect không mong muốn nếu `handleChangePage` không được thiết kế để xử lý từ nhiều nguồn.
      // Có thể bạn chỉ muốn cập nhật UI cục bộ của WaitPayments hoặc điều hướng.
      return handleChangePage({ data: updatedData, source: 'balanceUpdated' }); // Thêm source để handleChangePage có thể phân biệt
    };

    function onConnect() {
      console.log("[WaitPayments] Socket connected");
      // Không đăng ký balanceUpdated ở đây nữa
    }

    function onDisconnect() {
      console.log("[WaitPayments] Socket disconnected");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("balanceUpdated", handleBalanceUpdated); // Đăng ký một lần ở đây

    console.log('[WaitPayments] Registering socket listeners: connect, disconnect, balanceUpdated');

    return () => {
      console.log('[WaitPayments] Unregistering socket listeners and disconnecting socket');
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("balanceUpdated", handleBalanceUpdated); // Quan trọng: cleanup
      socket.disconnect(); // Ngắt kết nối khi component unmount
    };
  }, [])

  // const onOpenVerify = async () => {
  //   setOpenVerify(true)
  //   await verifyStatus()
  // }

  const { transactionCode } = data;
  const { bankName, bankCode, bankUserName, qrCode } = paymentInfo;

  const QRCODE = qrCode !== undefined && qrCode !== "" ? qrCode.replace('{AMOUNT}', totalPrice.toString()).replace('{CODE}', transactionCode) : `https://qr.sepay.vn/img?acc=688112688&bank=MBBank&amount=${totalPrice}&des=${transactionCode}`;

  // const verifyStatus = async () => {
  //   setIsLoading(true);
  //   try {
  //     const response = await fetch("/api/verify-status", {
  //       method: "POST",
  //       body: JSON.stringify({
  //         code: transactionCode,
  //         timslots,
  //         amount: totalPrice,
  //       }),
  //     });
  //     const res = await response.json();

  //     if (response.status === 202) {
  //       setIsLoading(false);
  //       return setAlertMessage(
  //         res.error || `Đơn hàng của bạn chưa được thanh toán.`
  //       );
  //     }
  //     handleChangePage({ data: res.data });
  //   } catch (error: any) {
  //     console.log(error);
  //     setAlertMessage(error.message);
  //     setIsLoading(false);
  //   }
  // };

  return (
    <div className="h-screen px-4 pt-4 pb-2 flex items-center flex-col">
      <div className="w-full md:w-[542px] flex items-center flex-col">
        <hgroup className="text-[13px] rounded-xl bg-black/30 mb-6">
          <div className="flex items-center bg-black/40 p-2 rounded-t-xl">
            <svg
              width="24"
              height="24"
              viewBox="0 0 35 35"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M23.3333 2.91663V8.74996M11.6667 2.91663V8.74996M4.375 14.5833H30.625M7.29167 5.83329H27.7083C29.3192 5.83329 30.625 7.13913 30.625 8.74996V29.1666C30.625 30.7775 29.3192 32.0833 27.7083 32.0833H7.29167C5.68084 32.0833 4.375 30.7775 4.375 29.1666V8.74996C4.375 7.13913 5.68084 5.83329 7.29167 5.83329Z"
                stroke="#019D81"
                stroke-width="4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <div className="flex w-full justify-center items-center">
              <h1 className="font-semibold text-center">
                Thông tin thanh toán xác nhận
              </h1>
            </div>
          </div>
          <div className="p-2 flex flex-col gap-2">
            <Text title="Ngân hàng" content={bankName} />
            <Text title="Số tài khoản" content={bankCode} isCopyable />
            <Text title="Tên tài khoản" content={bankUserName} />
            <Text title="Nội dung" content={transactionCode} isCopyable />
            <Text title="Số tiền" content={VND.format(totalPrice)} isCopyable />
            <p className="font-semibold">
              Thời gian chờ giữ sân 15 phút.
              Vui lòng <span className="text-[#fa9654]">ghi đúng nội dung theo mã giao dịch ở trên </span>hoặc quét mã QR bên dưới để hệ thống xác nhận tự động thành công và <span className="text-[#fa9654]">không tắt trang này.</span>
              Ways <span className="text-[#fa9654]">không chịu trách nhiệm giữ sân nếu bạn chuyển khoản không có mã.</span>
              Nếu trong trường hợp tiền chuyển đã chuyển khoản thành công nhưng hệ thống ngân hàng chưa báo nhận được và hết thời gian chờ 15 phút,<span className="text-[#fa9654]"> bạn hãy gọi 0389145575 (7-23h) </span> để Ways xác nhận giữ sân.
              <span className="text-[#fa9654]"> Nếu ngoài giờ làm</span>, bạn hãy đặt lại sân 1 lần nữa và nhắn lại Zalo để Ways báo kế toán hoàn tiền chuyển 2 lần nhé.
            </p>
          </div>
        </hgroup>
        <p className="font-semibold text-center">
          Giữ chỗ chờ thanh toán trong 15 phút. <br /> Hotline: 0389145575 (7-23h).
        </p>
        {alertMessage && <p className="text-secondary">{alertMessage}</p>}
        <p className="font-semibold my-2">
          <Statistic.Countdown
            format="mm:ss"
            title=""
            value={deadline}
            onFinish={onFinish}
          />
        </p>

        {/* <Button
          disabled={!data.totalPrice || !isOpenVerify}
          loading={isLoading}
          onClick={verifyStatus}
          className="text-white border-0 w-full mb-6 bg-gradient-to-b from-blue-500 to-cyan-500 px-4 py-2 font-semibold rounded-md"
        >
          {!isOpenVerify ?
            <div className="flex items-center gap-2">
              <p>Nút kiểm tra giao dịch sau: </p>
              <Statistic.Countdown
                format="mm:ss"
                // title="Kiểm tra giao dịch sau:"
                value={openDeadline}
                onFinish={onOpenVerify}
              />
            </div>
            : btnText[currentPage]}
        </Button> */}
        <div className="flex items-center p-2 bg-white rounded-lg">
          <Image
            width={150}
            height={150}
            src={QRCODE}
            alt="QR code"
          />
        </div>
      </div>
    </div>
  );
}
