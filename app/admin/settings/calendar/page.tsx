"use client"
import React from 'react';
import type { BadgeProps, CalendarProps } from 'antd';
import { Badge, Calendar, Modal, DatePicker, Space, Button, message } from 'antd';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

const dateFormat = 'YYYY/MM/DD';

const getMonthData = (value: Dayjs) => {
  if (value.month() === 8) {
    return 1394;
  }
};

const CalendarPage: React.FC = () => {

  const [listData, setListData] = React.useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isLoading, setLoading] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<string[]>([]);

  React.useEffect(() => {
    fetch("/api/calendar").then(res => res.json()).then(res => {
      setListData(res.data.map((item: any) => {
        const { fromDate, notes, toDate } = item
        return {
          type: "success",
          content: `${new Date(fromDate).toLocaleDateString()}, ${notes}, `,
          fromDate,
          toDate
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
    return (
      <ul className="events">
        {listData.filter((item) => {
          const from = new Date(item.fromDate)
          const to = new Date(item.toDate)
          return from.toLocaleDateString() === value.toDate().toLocaleDateString()
            || to.toLocaleDateString() === value.toDate().toLocaleDateString()
        }).map(item => {
          return <li className='bg-primary py-4' key={item.content}>
            <Badge status={item.type as BadgeProps['status']} className='text-white' text={item.content} />
          </li>
        })}
      </ul>
    );
  };

  const onSelect = () => {
    showModal()
  }

  const onChangeDates = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      const [from, to] = dates
      // Gửi ISO YYYY-MM-DD để server parse không phụ thuộc locale (tránh dd/mm bị hiểu nhầm mm/dd).
      setSelectedDate([from.format("YYYY-MM-DD"), to.format("YYYY-MM-DD")])
    } else {
      setSelectedDate([])
    }
  }



  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = async () => {
    if (selectedDate.length < 2) {
      message.error('Vui lòng chọn khoảng ngày (từ - đến)');
      return;
    }
    setLoading(true)
    try {
      const res = await fetch('/api/calendar',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedDate })
        })
      const data = await res.json()
      if (!res.ok) {
        message.error(data?.message || 'Tạo lịch thất bại');
        return;
      }
      message.success('Thêm thành công');
      setIsModalOpen(false);
    } catch (error) {
      message.error('Lỗi kết nối, thử lại');
    } finally {
      setLoading(false)
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