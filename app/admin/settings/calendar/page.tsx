"use client"
import React from 'react';
import type { BadgeProps, CalendarProps, DatePickerProps } from 'antd';
import { Badge, Calendar, Modal, DatePicker, Space, Button } from 'antd';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

const dateFormat = 'YYYY/MM/DD';

const getListData = (value: Dayjs) => {
  let listData: { type: string; content: string }[] = [];
  switch (value.date()) {
    case 8:
      listData = [
        { type: 'warning', content: 'This is warning event.' },
        { type: 'success', content: 'This is usual event.' },
      ];
      break;
    case 10:
      listData = [
        { type: 'warning', content: 'This is warning event.' },
        { type: 'success', content: 'This is usual event.' },
        { type: 'error', content: 'This is error event.' },
      ];
      break;
    case 15:
      listData = [
        { type: 'warning', content: 'This is warning event' },
        { type: 'success', content: 'This is very long usual event......' },
        { type: 'error', content: 'This is error event 1.' },
        { type: 'error', content: 'This is error event 2.' },
        { type: 'error', content: 'This is error event 3.' },
        { type: 'error', content: 'This is error event 4.' },
      ];
      break;
    default:
  }
  return listData || [];
};

const getMonthData = (value: Dayjs) => {
  if (value.month() === 8) {
    return 1394;
  }
};

const CalendarPage: React.FC = () => {

  const [listData, setListData] = React.useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isLoading, setLoading] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date[]>([]);

  React.useEffect(() => {
    fetch("/api/calendar").then(res => res.json()).then(res => {
      console.log(res.data)
      setListData(res.data.map((item: any) => {
        const { fromDate, notes, toDate } = item
        return {
          type: "success", content: `${new Date(fromDate).toLocaleDateString()}, ${notes}, `, fromDate
        }
      }))
    })
  }, [])

  const monthCellRender = (value: Dayjs) => {
    const num = getMonthData(value);
    return num ? (
      <div className="notes-month">
        <section>{num}</section>
        <span>Backlog number</span>
      </div>
    ) : null;
  };

  const dateCellRender = (value: Dayjs) => {
    console.log("value",)
    return (
      <ul className="events">
        {listData.map((item) => {
          console.log(new Date(item.fromDate).getDate(), value.date())
          if (new Date(item.fromDate).getDate() === value.date()) {
            return <li className='bg-primary py-4' key={item.content}>
              <Badge status={item.type as BadgeProps['status']} className='text-white' text={item.content} />
            </li>
          }
          return <li className='py-4' key={item.content}>
            {/* <Badge status={item.type as BadgeProps['status']} className='text-white' text={item.content} /> */}
          </li>
        })}
      </ul>
    );
  };

  const onSelect = () => {
    showModal()
  }

  const onChangeDates = (dates: any) => {
    if (dates) {
      const [from, to] = dates
      setSelectedDate([from.toDate().toLocaleDateString(), to.toDate().toLocaleDateString()])
    }

  }



  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/calendar',
        {
          method: "POST",
          body: JSON.stringify({ selectedDate })
        })
        .then(res => res.json())
      console.log(res)
    } catch (error) {

    } finally {
      setLoading(false)
      setIsModalOpen(false);
    }


  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  const cellRender: CalendarProps<Dayjs>['cellRender'] = (current, info) => {
    if (info.type === 'date') return dateCellRender(current);
    if (info.type === 'month') return monthCellRender(current);
    return info.originNode;
  };

  return <>
    <Modal title="Xác nhận mở thêm ngày!" open={isModalOpen} onOk={handleOk} onCancel={handleCancel}>
      <p className='text-white'>Cho phép đăt sân tới ngày</p>
    </Modal>

    <Space>
      <RangePicker
        onChange={(dates) => onChangeDates(dates)}
        format={dateFormat}
      />
      <Button onClick={onSelect} type="primary" loading={isLoading}>
        {isLoading ? "Đang tạo" : "Tạo"}
      </Button>
    </Space>
    <Calendar mode="month" cellRender={cellRender} />
  </>

};

export default CalendarPage;