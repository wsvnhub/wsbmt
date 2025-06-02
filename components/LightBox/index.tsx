"use client";
import React, { useEffect, useState } from 'react';
import { Modal, DatePicker, message } from 'antd';
import dayjs from 'dayjs';
import ListFac, { ListFacProps } from '../Branch';


export default function LightBox({ listFac, handleChangeFacilitiesInfo }: ListFacProps) {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  useEffect(() => {
    // Kiểm tra nếu đã có sẵn giá trị trong localStorage thì không cần hiện modal
    const savedDate = localStorage.getItem('selectedDate');
    const savedBranch = localStorage.getItem('selectedBranch');
    if (savedDate && savedBranch) {
      setIsModalOpen(false);
      setSelectedDate(dayjs(savedDate));
      setSelectedBranch(savedBranch);
    }
  }, []);

  const handleOk = () => {
    if (!selectedDate || !selectedBranch) {
      message.error('Vui lòng chọn đầy đủ ngày và chi nhánh!');
      return;
    }

    // Lưu vào localStorage hoặc truyền lên App nếu cần
    localStorage.setItem('selectedDate', selectedDate.toISOString());
    localStorage.setItem('selectedBranch', selectedBranch);
    setIsModalOpen(false);
  };

  return (
    <>
      <Modal
        title="Vui lòng chọn ngày và chi nhánh bạn muốn đặt sân!"
        open={isModalOpen}
        closable={false} // Không cho người dùng tự đóng modal
        maskClosable={false}
        onOk={handleOk}
        okText="Xác nhận"
        cancelButtonProps={{ style: { display: 'none' } }} // Ẩn nút Cancel
      >
        <div style={{ marginBottom: 16 }}>
          <p className='text-white mb-2'><strong>Chọn ngày:</strong></p>
          <DatePicker
            style={{ width: '100%' }}
            value={selectedDate}
            onChange={(date) => setSelectedDate(date)}
          />
        </div>
        <div>
          <p className='text-white mb-2'><strong>Chọn chi nhánh:</strong></p>
          <ListFac
            type='radio'
            listFac={listFac}
            handleChangeFacilitiesInfo={handleChangeFacilitiesInfo} />
        </div>
      </Modal>
    </>
  );
}
