import { VND } from "@/utils";
import { Typography } from "antd";
import React from "react";

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

interface ResultPaymentsProps {
  data: any;
  totalPrice: number;
  paymentInfo: any;
  btnText: any;
  currentPage: string;
  facilitiesInfo: any;
  handleChangePage: (state: any) => void;
}

export default function ResultPayments({
  data,
  totalPrice,
  paymentInfo,
  btnText,
  currentPage,
  facilitiesInfo,
  handleChangePage,
}: ResultPaymentsProps) {
  const { details, date, facility, applyDiscount, phone, userName, email } =
    data;

  const detailArr = details
    .split(";")
  const facDetail = detailArr
    .map((key: string, index: number) => <p key={index}>- {key}</p>);

  const facAddress = Object.keys(facility).map((key) => (
    <p key={key}>- {facilitiesInfo[key].address}</p>
  ));

  const facText = Object.keys(facility).map((key) => (
    <p key={key}>- {facilitiesInfo[key].name}</p>
  ));

  return (
    <div className="flex flex-col items-center lg:h-screen px-4 pt-4 pb-2 lg:p-0">
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="17" cy="22" r="16" fill="url(#paint0_linear_255_789)" />
        <path
          d="M35 10.5L15.75 29.75L7 21"
          stroke="white"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <defs>
          <linearGradient
            id="paint0_linear_255_789"
            x1="17"
            y1="6"
            x2="17"
            y2="38"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="#40FFDC" />
            <stop offset="1" stop-color="#069FCA" />
          </linearGradient>
        </defs>
      </svg>

      <p className="text-center text-2xl font-semibold mb-6 mt-2">
        Đặt sân thành công
      </p>

      <hgroup className="w-full md:w-[442px] text-[13px] rounded-xl bg-black/30 mb-6">
        <div className="flex items-center bg-black/40 p-2 rounded-t-xl">
          <div className="flex w-full justify-center items-center">
            <h1 className="font-semibold text-center">
              Email xác nhận đặt sân thành công đã gửi
            </h1>
          </div>
        </div>
        <div className="p-2 flex flex-col gap-2">
          <Text title="Tên" content={userName} />
          <Text title="SĐT" content={phone} isCopyable />
          <Text title="Email" content={email} isCopyable />
          <hr />
          <Text title="Chi nhánh" content={facText} />
          <Text title="Địa chỉ" content={facAddress} />
          <Text title="Sân - giờ" content={facDetail} />
          <Text title="Ngày" content={date} />
          <Text
            title="Giá 1 giờ"
            content={totalPrice}
            showDiscount={applyDiscount}
          />
          <Text title="Số giờ" content={detailArr.length} />
          <Text
            title="Tổng"
            content={VND.format(totalPrice)}
            isNewPrice={applyDiscount}
          />
        </div>
      </hgroup>
      <div className="flex items-center gap-4">
        <a
          className="w-full text-center md:w-[220px] bg-white/20 px-4 py-2 font-semibold rounded-md"
          href="/"
        >
          Về trang chủ
        </a>
        <button
          // onClick={handleChangePage}
          onClick={() => (window.location.href = "/")}
          className="w-full md:w-[220px] bg-gradient-to-b from-blue-500 to-cyan-500 px-4 py-2 font-semibold rounded-md"
        >
          {btnText[currentPage]}
        </button>
      </div>
    </div>
  );
}
