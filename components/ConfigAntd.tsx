"use client";
import { ConfigProvider } from "antd";
import React from "react";
import locale from "antd/locale/vi_VN";
import dayjs from "dayjs";
import "dayjs/locale/vi";

dayjs.locale("vi");

export default function ConfigAntd({ children }: any) {
  return (
    <ConfigProvider
      locale={locale}
      theme={{
        token: {
          colorSuccess: "#FF7033", // "#40ffdc" (xanh dương nhạt) → #FF7033
          fontFamilyCode: "Montserrat",
        },
        components: {
          Table: {
            headerBg: "#cceeff", // "#c4fff4" (gần xanh lá) → #049AF0
            headerColor: "#049AF0", // "#02846c" (xanh lá) → #049AF0
            borderColor: "#999999",
            headerBorderRadius: 0,
            cellPaddingBlock: 14,
            fontSize: 8,
          },
          Form: {
            labelColor: "white",
            itemMarginBottom: 6,
            verticalLabelMargin: 0,
          },

          Typography: {
            colorIcon: "white",
            colorText: "white",
          },
          Statistic: {
            colorText: "white",
            colorTextBase: "white",
          },
          DatePicker: {
            addonBg: "#049AF0", // "green" → #049AF0
            colorIcon: "#049AF0", // "#029d81" → #049AF0
            colorPrimary: "#049AF0", // "#029d81" → #049AF0
            colorText: "#049AF0", // "#02846c" → #049AF0
            colorTextDescription: "#049AF0",
            colorTextPlaceholder: "#049AF0",
            colorTextHeading: "#049AF0",
            fontSize: 18,
          },
          Spin: {
            colorPrimary: "white",
          },
          Modal: {
            contentBg: "#049AF0", // "#029d81" → #049AF0
            headerBg: "transparent",
            titleColor: "white",
          },
          Layout: {
            headerBg: "#049AF0", // "#047862" → #049AF0
            siderBg: "#fff",
            lightSiderBg: "#049AF0",
            lightTriggerBg: "#049AF0",
          },
          Button: {
            colorPrimary: "#049AF0", // "#029d81" → #049AF0
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
