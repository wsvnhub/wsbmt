import React from "react";
import { Button, Form, Input } from "antd";
import { VND } from "@/utils";

const Text = ({
  title,
  content,
  showDiscount = false,
  isNewPrice = false,
  discountInfo,
}: any) => {
  const newPriceClass = "text-[#40ffdc] italic";
  return (
    <p className="flex">
      <span className="w-[80px] inline-block"> {title}:</span>
      <b className={`${isNewPrice && newPriceClass}`}>{content}</b>
      {showDiscount && (
        <span className={newPriceClass}>
          (-{discountInfo.value}% còn {VND.format(discountInfo.discountAmount)})
        </span>
      )}
    </p>
  );
};

const validateMessages = {
  required: "${label} is required!",
  types: {
    email: "${label} is not a valid email!",
    number: "${label} is not a valid number!",
  },
  number: {
    range: "${label} must be between ${min} and ${max}",
  },
};

interface ConfirmPaymentsProps {
  data: any;
  btnText: any;
  currentPage: string;
  facilitiesInfo: any;
  handleChangePage: (newstate: any) => void;
}

export default function ConfirmPayments({
  data,
  btnText,
  currentPage,
  facilitiesInfo,
  handleChangePage,
}: ConfirmPaymentsProps) {
  const { details, totalHours, dates, facility } = data;
  const pricePerHour = Number(data.totalPrice) / Number(data.totalHours);

  const [discountCode, setDiscountCode] = React.useState("");
  const [discountMessage, setDiscountMessage] = React.useState("");
  const [discountInfo, setDiscountInfo] = React.useState({
    value: 0,
    newPrice: 0,
    discountAmount: 0,
    isApplyDiscount: false,
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [form] = Form.useForm();

  const onFinish = (values: any) => {
    const { name, phone, email } = values;
    const { isApplyDiscount, newPrice } = discountInfo;
    const totalPrice = isApplyDiscount ? newPrice : data.totalPrice;
    const cloneDate = {
      ...data,
      userName: name,
      phone,
      email,
      applyDiscount: discountCode,
      totalPrice,
    };
    handleChangePage(cloneDate);
  };

  const onVerifyCode = async () => {
    setIsLoading(true);
    try {
      console.log("discountCode", discountCode)
      const response = await fetch("api/verify-code", {
        method: "POST",
        body: JSON.stringify({ code: discountCode }),
      });
      const res = await response.json();

      const percent = res.data.value;
      const discountAmount = pricePerHour - (pricePerHour * percent) / 100;
      setIsLoading(false);
      setDiscountMessage("Mã thành công. Giá đã được áp dụng");

      return setDiscountInfo({
        value: percent,
        discountAmount,
        newPrice: data.totalHours * discountAmount,
        isApplyDiscount: true,
      });
    } catch (error) {
      console.log(error);
      setDiscountMessage("Mã không thành công, hết hạn sử dụng");
      setIsLoading(false);
    }
  };

  const detailsArr = typeof details === "string" ? details.split(";") : details;
  const facDetail = detailsArr.map((key: string, index: number) => (
    <p key={index}>- {key}</p>
  ));

  const facAddress = Object.keys(facility)?.map((key) => (
    <p key={key}>- {facilitiesInfo[key].address}</p>
  ));

  const facText = Object.keys(facility).map((key) => (
    <p key={key}>- {facilitiesInfo[key].name}</p>
  ));

  return (
    <div className=" px-4 pt-4 pb-2 flex items-center flex-col">
      <div className="w-full md:w-[375px]">
        <hgroup className="text-[13px] rounded-xl bg-black/30 mb-2">
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
            <div className="flex w-full justify-center items-center mr-[24px]">
              <h1 className="font-semibold text-center">Thông tin đặt lịch</h1>
            </div>
          </div>
          <div className="p-2 flex flex-col gap-2">
            <Text title="Chi nhánh" content={facText} />
            <Text title="Địa chỉ" content={facAddress} />
            <Text title="Sân - giờ" content={facDetail} />
            <Text title="Ngày" content={dates.join(", ")} />
            <Text
              title="Giá 1 giờ"
              content={VND.format(pricePerHour)}
              showDiscount={discountInfo.isApplyDiscount}
              discountInfo={discountInfo}
            />
            <Text title="Số giờ" content={totalHours} />
            <Text
              title="Tổng"
              content={VND.format(
                discountInfo.newPrice != 0
                  ? discountInfo.newPrice
                  : data.totalPrice
              )}
              isNewPrice={discountInfo.isApplyDiscount}
            />
          </div>
        </hgroup>
        <Form
          name="trigger"
          onFinish={onFinish}
          layout="vertical"
          form={form}
          validateMessages={validateMessages}
        >
          <Form.Item
            hasFeedback
            name="name"
            validateDebounce={1000}
            label="Tên người đặt (*)"
            rules={[{ required: true }]}
          >
            <Input
              className="text-black placeholder-gray-400"
              name="name"
              placeholder="Nhập tên của bạn"
            />
          </Form.Item>
          <Form.Item
            hasFeedback
            name="phone"
            validateDebounce={1000}
            label="Số điện thoại (*)"
            rules={[
              {
                required: true,
                min: 10,
                message: "Số điện thoại không hợp lệ",
              },
            ]}
          >
            <Input
              type="phone"
              className="text-black placeholder-gray-400"
              name="phone"
              placeholder="Nhập số của bạn"
            />
          </Form.Item>
          <Form.Item
            hasFeedback
            name="email"
            validateDebounce={1000}
            label="Email (*)"
            rules={[{ required: true, type: "email" }]}
          >
            <Input
              type="email"
              className="text-black placeholder-gray-400"
              name="email"
              placeholder="Nhận email để nhận  xác nhận sân"
            />
          </Form.Item>
          <Form.Item
            className="mb-6"
            label="Nhập mã Khuyến mại (Nếu có)"
            validateStatus="success"
            help={discountMessage}
          >
            <div className="flex w-full code-field w-2/3">
              <Input
                className="text-black placeholder-gray-400"
                placeholder="Nhập mã"
                onChange={(e) => setDiscountCode(e.target.value)}
              />
              <Button
                disabled={discountCode === ""}
                className="bg-black/40 border-none py-2 px-4 mr-6 text-white font-semibold rounded-lg"
                onClick={onVerifyCode}
                type="primary"
                loading={isLoading}
                iconPosition="end"
              >
                Kiểm tra
              </Button>
            </div>
          </Form.Item>
          <button
            type="submit"
            className="w-full mt-8 lg:mt-0 disabled:opacity-80 text-white bg-gradient-to-b from-blue-500 to-cyan-500 px-4 py-2 font-semibold rounded-md"
          >
            {btnText[currentPage]}
          </button>
        </Form>
      </div>
    </div>
  );
}
