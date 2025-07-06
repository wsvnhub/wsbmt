import React from "react";
import { Table } from "antd";
import type { TableProps } from "antd";
import HeaderCell from "./Table/HeaderCell";
import timeSlots from "@/data/timeSlots.json";
import { timeToMinutes } from "@/utils";

const bgColors: any = {
  booked: "bg-red-400",
  pending: "bg-yellow-500",
  wait: "bg-red-400",
  empty: "bg-white",
  fixed: "bg-blue-400",
  pass: "bg-purple-400",
};

interface DataType {
  id: string;
  court: string;
  facility: string;
  [key: number]: {
    from: string;
    to: string;
    hour: number;
    status: string;
    bookedBy: {
      name: string;
      phone: string;
    };
    isFixed: boolean;
    availability: boolean;
  };
}

interface TableIProps {
  isAdmin?: boolean;
  data: DataType[];
  tableInex: number;
  selectedDate: Date;
  slotWidth: number;
  bgCell?: any;
  cluster: string;
  handleScrollChange: (scrollLeft: number) => void;
  handleCellClick: (
    cell: any,
    tableInex: number,
    columnIndex: number,
    rowIndex: number,
    currentDate: Date,
    cluster: string
  ) => void;
}



function generateTimeArray(
  start: string,
  _intervalMinutes: number,
  slotWidth: number,
  tableInex: number,
  handleCellClick: any,
  bgCell: any,
  isAdmin: boolean,
  cluster: string
): TableProps<DataType>["columns"] {
  return timeSlots[cluster as keyof typeof timeSlots].map(
    ({ time, isNextDay, subtitle }, index) => {
      const dataIndex = index;

      const nextDay = new Date(start);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDate = isNextDay
        ? `(${new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "2-digit",
        }).format(nextDay)})`
        : "";

      return {
        title: `${time.trim()} ${nextDate} ${subtitle || ""}`,
        dataIndex,
        width: slotWidth,
        render: (value: any, _record: DataType, rowIndex: number) => {

          const fromTime = timeToMinutes(value.from)
          const toTime = timeToMinutes(value.to)

          const isDisable = fromTime <= timeToMinutes(new Date().toTimeString()) && toTime <= timeToMinutes(new Date().toTimeString())
          if (isDisable && start === new Date().toDateString()) {
            return <div className={`${value.status === "empty" ? "bg-gray-200" : bgCell[value.status]} bg-opacity-50 absolute inset-0`} />
          }

          const handleNewBook = () => {
            if (isAdmin && value?.status === "booked" || isAdmin && value?.status === "pass") {
              value.isChange = !value.isChange
              return handleCellClick(
                value,
                tableInex,
                dataIndex,
                rowIndex,
                new Date(start),
                cluster
              );
            }
            if (value?.status === "wait" || (!isAdmin && value?.status === "booked" || (!isAdmin && value?.status === "pass"))) {
              return;
            }
            value.status = value.status !== "pending" ? "pending" : "";
            return handleCellClick(
              value,
              tableInex,
              dataIndex,
              rowIndex,
              new Date(start),
              cluster
            );
          };
          let bgClass = bgCell["empty"];
          let isShowBorder = value?.isChange ? "bg-black/50" : ""
          if (value) {
            bgClass = bgCell[value.status];
          }
          if (value?.isChange) {
            bgClass = isShowBorder
          }

          return (
            <div
              onClick={handleNewBook}
              className={`cursor-pointer ${bgClass} absolute inset-0 w-full h-full flex flex-col items-center justify-center text-white text-xs`}
            >
              {!isAdmin && value.status === "pass" && (
                <a className="text-[5px] hover:text-white hover:underline" href="tel:0389145575">Hotline: 0389145575</a>
              )}
              {value.status === "booked" && isAdmin && (
                <>
                  {value.isFixed && (
                    <p className="absolute -top-1 left-0 z-[9999] bg-red-500 text-[5px] leading-[2] px-1 py-0">
                      Cố định
                    </p>
                  )}
                  <div className="relative group w-full max-w-full">
                    <p className="text-[6px] text-center truncate w-full overflow-hidden whitespace-nowrap">
                      {value.bookedBy.name}
                    </p>
                    <span className="absolute z-10 hidden group-hover:flex bg-black text-white text-[10px] px-2 py-1 rounded shadow-lg -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                      {value.bookedBy.name}
                    </span>
                  </div>

                  <p className="text-[8px]">{value.bookedBy.phone}</p>
                </>
              )}
            </div>

          );
        },
      };
    }
  );
}

const columns: TableProps<DataType>["columns"] = [
  {
    colSpan: 2,
    dataIndex: "facility",
    width: 40,
    fixed: "left",
    onCell: (_data, index) => {
      // if (index === 0) {
      //   return { rowSpan: 2 };
      // }
      // if (index && index % 2 === 0) {
      //   return { rowSpan: 2 };
      // }
      // return { rowSpan: 0 };
      return {};
    },

    render: (text: string) => (
      <div className="absolute inset-0 w-full h-full p-2 flex items-center justify-center text-white font-semibold bg-table-col1">
        <p>{text}</p>
      </div>
    ),
  },

  {
    colSpan: 0,
    dataIndex: "court",
    width: 34,
    fixed: "left",
    render: (text: string) => (
      <div className="absolute inset-0 bg-table-col2 text-table-col1  flex items-center justify-center">
        {text}
      </div>
    ),
  },
];

export default function ScheduleTable({
  data,
  isAdmin = false,
  tableInex,
  selectedDate,
  bgCell = bgColors,
  slotWidth,
  cluster,
  handleCellClick,
  handleScrollChange,
}: TableIProps) {
  const timeSlots =
    generateTimeArray(
      selectedDate.toDateString(),
      60,
      slotWidth,
      tableInex,
      handleCellClick,
      bgCell,
      isAdmin,
      cluster
    ) || [];
  const combinedColumns = columns?.concat(timeSlots);
  const components = { header: { cell: HeaderCell } };

  const handleScroll = (event: any) => {
    const currentScrollLeft = event.currentTarget.scrollLeft;
    handleScrollChange(currentScrollLeft);
  };

  return (
    <Table
      onScroll={handleScroll}
      id={`table${tableInex} `}
      className="schedule-table"
      columns={combinedColumns}
      bordered
      components={components}
      pagination={false}
      dataSource={data}
      scroll={{ x: 1500, y: 500 }}
    />
  );
}