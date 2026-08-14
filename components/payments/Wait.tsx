import React from "react";
import {
  // Button,
  CountdownProps, Image, Statistic, Typography
} from "antd";
// import { VND } from "@/utils";
import { io } from "socket.io-client";
import { socket as appSocket } from "@/socket/socket";
import { CLIENT_COUNTDOWN_MS } from "@/utils/bookingConstants";

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
  // Đồng hồ này PHẢI ngắn hơn hold của server (SERVER_HOLD_MS). Bản cũ dùng
  // `1500 * 60 * 10` = 15 phút trong khi server chỉ giữ 10 phút, tạo ra cửa sổ
  // 5 phút UI mời khách chuyển khoản cho ô server đã nhả. Xem
  // utils/bookingConstants.js để biết bất biến này.
  const deadline = React.useRef(Date.now() + CLIENT_COUNTDOWN_MS).current;
  const holdMinutes = Math.round(CLIENT_COUNTDOWN_MS / 60000);
  const [alertMessage, setAlertMessage] = React.useState<string>();
  const [_isOpenVerify, setOpenVerify] = React.useState(false)


  const onFinish: CountdownProps["onFinish"] = async () => {
    setOpenVerify(false)
    try {
      // Bản cũ gọi `fetch('/api/time-slots', { method: 'DELETE' })`, nhưng
      // app/api/time-slots/route.ts chỉ export GET/POST/PUT — request luôn trả
      // 405 nên đường huỷ đơn này chưa từng thực sự nhả ô. Chuyển sang socket,
      // nơi handler thật đã tồn tại.
      // Có timeout: server.js (bản legacy) không có handler "schedules:cancel",
      // nên nếu chạy trên nó thì emitWithAck sẽ treo mãi mà không có timeout.
      const res = await appSocket
        .timeout(10000)
        .emitWithAck("schedules:cancel", {
          lockId: data.lockId,
          scheduleId: data.schedulesId,
          transactionCode: data.transactionCode,
          reason: "Hết thời gian chờ thanh toán",
        });

      if (res?.success) {
        setAlertMessage("Hết thời gian chờ, đơn hàng của bạn đã bị huỷ");
      } else {
        setAlertMessage(
          "Hết thời gian chờ. Nếu bạn đã chuyển khoản, hãy gọi 0889555559 (7-23h) để được giữ sân."
        );
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
      setAlertMessage(
        "Có lỗi khi huỷ đơn. Nếu bạn đã chuyển khoản, hãy gọi 0889555559 (7-23h)."
      );
    }
  };

  React.useEffect(() => {
    const socket = io(SOCKET_URL, {
      query: { user_id: data.phone },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      // forceNew: true,
      transports: ['websocket', 'polling'],
    });

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


  const { transactionCode } = data;
  const {
    //  bankName, bankCode, bankUserName,
    // qrCode 
  } = paymentInfo;

  // const QRCODE = qrCode !== undefined && qrCode !== "" ? qrCode.replace('{AMOUNT}', totalPrice.toString()).replace('{CODE}', transactionCode) : `https://qr.sepay.vn/img?acc=688112688&bank=MBBank&amount=${totalPrice}&des=${transactionCode}`;
  const QRCODE = `https://qr.sepay.vn/img?acc=0703970249&bank=MBBank&amount=${totalPrice}&des=${transactionCode}`;

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
            {/* <Text title="Ngân hàng" content={bankName} />
            <Text title="Số tài khoản" content={bankCode} isCopyable />
            <Text title="Tên tài khoản" content={bankUserName} />
            <Text title="Nội dung" content={transactionCode} isCopyable />
            <Text title="Số tiền" content={VND.format(totalPrice)} isCopyable /> */}
            <p className="font-semibold">
              Thời gian chờ giữ sân {holdMinutes} phút.
              Vui lòng quét mã QR bên dưới để hệ thống xác nhận tự động thành công và <span className="text-[#fa9654]">không tắt trang này.</span>
              Ways <span className="text-[#fa9654]">không chịu trách nhiệm giữ sân nếu bạn chuyển khoản không có mã.</span>
              Nếu trong trường hợp tiền chuyển đã chuyển khoản thành công nhưng hệ thống ngân hàng chưa báo nhận được và hết thời gian chờ {holdMinutes} phút,<span className="text-[#fa9654]"> bạn hãy gọi 0889555559 (7-23h) </span> để Ways xác nhận giữ sân.
              <span className="text-[#fa9654]"> Nếu ngoài giờ làm</span>, bạn hãy đặt lại sân 1 lần nữa và nhắn lại Zalo để Ways báo kế toán hoàn tiền chuyển 2 lần nhé.
            </p>
          </div>
        </hgroup>
        <p className="font-semibold text-center">
          Giữ chỗ chờ thanh toán trong {holdMinutes} phút. <br /> Hotline: 0889555559 (7-23h).
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
