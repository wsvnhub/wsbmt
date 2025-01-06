"use client"
import React from 'react'
import { Button, Modal } from 'antd';

export default function LightBox() {
  const [isModalOpen, setIsModalOpen] = React.useState(true);

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    setIsModalOpen(false);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <Modal title="Vui lòng chọn ngày và chi nhánh bạn muốn đặt sân!"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}>
        <p>Some contents...</p>
        <p>Some contents...</p>
        <p>Some contents...</p>
      </Modal>
    </>
  );
}
