import React, { useState } from 'react';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Space } from 'antd';

type action = {
    type: "edit" | "unlock" | "pass"
}

const ManualUpdateModal = ({ onEdit, onUnlock, disabled, onPass, onSetFixed }: any) => {
    const [open, setOpen] = useState(false);
    const [action, setAction] = useState<action>({ type: 'unlock' });
    const [isProcessing, setProcessing] = useState(false);

    const showModal = () => {
        setOpen(true);
    };

    const hideModal = () => {
        setOpen(false);
    };
    const handleEdit = async (values: any) => {
        setProcessing(true)
        await onEdit(values)
        setProcessing(false)
        hideModal()
    }
    const handleUnlock = (values: any) => {
        onUnlock(values)
        hideModal()
    }

    const handlePass = (values: any) => {
        onPass(values)
        hideModal()
    }


    const onChangeAction = (newAction: action) => setAction(newAction)

    const renderAction = (action: string) => {
        switch (action) {
            case "edit":
                return <div>
                    <Form
                        onFinish={handleEdit}
                        layout="vertical"
                        className="flex w-full flex-wrap items-center gap-2 mt-8"
                    >
                        <Form.Item
                            className="w-full"
                            name="name"
                            label="Tên người đặt (*)"
                            rules={[{ required: false }]}
                        >
                            <Input
                                className="w-full text-black placeholder-gray-400"
                                name="name"
                                placeholder="Nhập tên của bạn"
                            />
                        </Form.Item>
                        <Form.Item
                            className="w-full"
                            name="phone"
                            label="Số điện thoại (*)"
                            rules={[{ required: false }]}
                        >
                            <Input
                                className="w-full text-black placeholder-gray-400"
                                name="phone"
                                placeholder="Nhập số của bạn"
                            />
                        </Form.Item>
                        <Form.Item
                            className="w-full"
                            name="password"
                            label="Mật khẩu (*)"
                            rules={[{ required: false }]}
                        >
                            <Input
                                className="w-full text-black placeholder-gray-400"
                                name="password"
                                placeholder="Nhập mật khẩu để thay đổi"
                            />
                        </Form.Item>
                        <Button
                            loading={isProcessing}
                            disabled={isProcessing}
                            htmlType="submit"
                            className="w-full border-0 disabled:opacity-80 text-white bg-gradient-to-b from-amber-500 to-red-500 py-2  px-4 font-semibold rounded-md"
                        >
                            Xác nhận
                        </Button>
                    </Form>
                </div>
            case "unlock":
                return <div>
                    <Form
                        onFinish={handleUnlock}
                        layout="vertical"
                        className="flex w-full flex-wrap items-center gap-2 mt-8"
                    >
                        <Form.Item
                            className="w-full"
                            name="password"
                            label="Mật khẩu (*)"
                            rules={[{ required: false }]}
                        >
                            <Input
                                className="w-full text-black placeholder-gray-400"
                                name="password"
                                placeholder="Nhập mật khẩu để thay đổi"
                            />
                        </Form.Item>
                        <Button
                            loading={isProcessing}
                            disabled={isProcessing}
                            htmlType="submit"
                            className="w-full border-0 disabled:opacity-80 text-white bg-gradient-to-b from-amber-500 to-red-500 py-2  px-4 font-semibold rounded-md"
                        >
                            Xác nhận
                        </Button>
                    </Form>
                </div>
            case "pass":
                return <div>
                    <Form
                        onFinish={handlePass}
                        layout="vertical"
                        className="flex w-full flex-wrap items-center gap-2 mt-8"
                    >
                        <Form.Item
                            className="w-full"
                            name="password"
                            label="Mật khẩu (*)"
                            rules={[{ required: false }]}
                        >
                            <Input
                                className="w-full text-black placeholder-gray-400"
                                name="password"
                                placeholder="Nhập mật khẩu để thay đổi"
                            />
                        </Form.Item>
                        <Button
                            loading={isProcessing}
                            disabled={isProcessing}
                            htmlType="submit"
                            className="w-full border-0 disabled:opacity-80 text-white bg-gradient-to-b from-amber-500 to-red-500 py-2  px-4 font-semibold rounded-md"
                        >
                            Xác nhận Pass
                        </Button>
                    </Form>
                </div>

            default:
                return <div>empty</div>
        }
    }

    return (
        <>
            <button disabled={disabled} className='border border-white p-2 rounded-md disabled:bg-gray-300 hover:bg-gray-200 hover:text-primary' onClick={showModal}>
                Sửa
            </button>
            <Modal
                title="Sửa thông tin ô"
                open={open}
                onOk={hideModal}
                onCancel={hideModal}
                footer={(_, { CancelBtn }) => (
                    <>
                        <CancelBtn />
                        <Button disabled={action.type === "pass"} type="primary" className='bg-purple-700' onClick={() => onChangeAction({ type: "pass" })}>Pass</Button>
                        <Button disabled={action.type === "edit"} type="primary" className='bg-orange-600' onClick={() => onChangeAction({ type: "edit" })}>Sửa</Button>
                        <Button disabled={action.type === "unlock"} type="primary" className='bg-teal-700' onClick={() => onChangeAction({ type: "unlock" })}>Mở khoá</Button>
                    </>
                )}
                okText="Xác nhận"
                cancelText="Huỷ"
            >
                <div className='flex gap-2 font-semibold'>
                    <ExclamationCircleOutlined className='text-yellow-500' />
                    <p className='text-yellow-500'>Chọn tác vụ phía dưới.</p>
                </div>

                <p className='text-white'>Sửa: thay đổi thông tin của tất cả các ô đang chọn.</p>
                <p className='text-white'>Mở khoá: đặt ô đang chọn về trạng thái mặc định.</p>
                <p className='text-white'>Pass ô: đặt ô đang chọn sang trạng thái Pass</p>
                {renderAction(action.type)}
            </Modal>
        </>
    );
};

const AdminModal = ({ onEdit, onUnlock, disabled, onPass, onSetFixed }: any) => {
    return (
        <>
            <Space>
                <ManualUpdateModal
                    disabled={disabled}
                    onEdit={onEdit}
                    onUnlock={onUnlock}
                    onPass={onPass}
                    onSetFixed={onSetFixed}
                />
            </Space>
        </>
    );
};

export default AdminModal;