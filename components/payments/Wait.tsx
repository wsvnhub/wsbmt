import React from "react";
import { Button, CountdownProps, Image, Statistic, Typography } from "antd";
import { VND } from "@/utils";

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

export default function WaitPayments({
  data,
  totalPrice = 0,
  btnText,
  paymentInfo,
  currentPage,
  timslots,
  handleChangePage,
}: WaitPaymentsProps) {
  const deadline = React.useRef(Date.now() + 1000 * 60 * 10).current;
  const [isLoading, setIsLoading] = React.useState(false);
  const [alertMessage, setAlertMessage] = React.useState<string>();

  const onFinish: CountdownProps["onFinish"] = () => {
    setAlertMessage("Hết thời gian chờ, đơn hàng của bạn đã bị huỷ");
  };

  const { transactionCode } = data;
  const { bankName, bankCode, bankUserName, qrCode } = paymentInfo;

  const verifyStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/verify-status", {
        method: "POST",
        body: JSON.stringify({
          code: transactionCode,
          timslots,
          amount: totalPrice,
        }),
      });
      const res = await response.json();
      if (response.status === 202) {
        setIsLoading(false);
        return setAlertMessage(
          `Đơn hàng của bạn chưa được thanh toán.`
        );
      }
      handleChangePage({ data: res.data });
    } catch (error: any) {
      console.log(error);
      setAlertMessage(error.message);
      setIsLoading(false);
    }
  };

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
                Thông tin thanh toán xác nhận tự động
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
              Vui lòng
              <span className="text-[#fa9654]">
                &nbsp;ghi đúng nội dung theo mã giao dịch ở trên
              </span>
              &nbsp;để hệ thống xác nhận thành công tự động hoặc quét mã QR bên
              dưới và
              <span className="text-[#fa9654]"> không tắt trang này.</span>
            </p>
          </div>
        </hgroup>
        <p className="font-semibold text-center">
          Giữ chỗ chờ thanh toán trong 10 phút <br /> Không tắt trang này
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
            src={qrCode !== "" ? qrCode : "./qr.png"}
            alt="QR code"
          />
        </div>
        <Button
          disabled={!data.totalPrice}
          loading={isLoading}
          onClick={verifyStatus}
          className="text-white border-0 w-full mt-6 bg-gradient-to-b from-blue-500 to-cyan-500 px-4 py-2 font-semibold rounded-md"
        >
          {btnText[currentPage]}
        </Button>
      </div>
    </div>
  );
}
