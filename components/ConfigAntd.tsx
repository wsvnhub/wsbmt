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
          colorSuccess: "#40ffdc",
          fontFamilyCode: "Montserrat",
        },
        components: {
          Table: {
            headerBg: "#c4fff4",
            headerColor: "#02846c",
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
            addonBg: "green",
        
            colorIcon: "#029d81",
            colorPrimary: "#029d81",
            colorText: "#02846c",
            colorTextDescription: "#02846c",
            colorTextPlaceholder: "#029d81",
            colorTextHeading: "#02846c",
            fontSize: 18,
          
          },
          Spin: {
            colorPrimary: "white",
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
