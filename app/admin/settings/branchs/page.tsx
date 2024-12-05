"use client"
import React from 'react';
import {
  Avatar, Button, List, Skeleton, DatePicker,
  Form,
  Input,
  InputNumber,
  Switch,
  Card,
  Select,
  notification,

} from 'antd';

import { CloseOutlined } from '@ant-design/icons';

import axios from 'axios';

interface DataType {
  address: string
  createdAt: number
  id: string
  name: string
  pricePerHour: string
  loading: boolean;
}

const Branchs: React.FC = () => {

  const [form] = Form.useForm();

  const [api, contextHolder] = notification.useNotification();

  const [initLoading, setInitLoading] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<DataType[]>([]);
  const [list, setList] = React.useState<DataType[]>([]);


  React.useEffect(() => {
    fetch('/api/facilities')
      .then((res) => res.json())
      .then((res) => {
        setInitLoading(false);
        console.log(res.data)
        setData(res.data);
        setList(res.data);
      });
  }, []);


  const onLoadMore = () => { }

  const onFinish = async (values: any) => {
    setLoading(true)
    const { items, fid, fname, address, pricePerHour, isAvaliable, openAt } = values
    const courtIds = items.map((item: any) => item.id)
    try {
      const branch = await axios.post('/api/facilities', {
        "id": fid,
        name: fname,
        address,
        pricePerHour: `${pricePerHour}`,
        isAvaliable,
        "openAt": new Date(openAt).toLocaleDateString()
      })

      api.open({
        message: "Tạo thành công chi nhánh!",
        duration: 3,
        type: "info"
      })

      const courtsPromise = items.map((item: any) => {
        return axios.post('/api/courts', {
          "facilitiyId": fid,
          "id": item.id,
          "name": item.name,
          "timeClusterId": item.timeClusterId
        })
      })

      await Promise.all(courtsPromise)

      api.open({
        message: "Tạo thành công sân!",
        duration: 3,
        type: "info"
      })

      const timeslots = await axios.post('/api/time-slots', {
        courtIds
      })
      api.open({
        message: "Mở giờ cho sân thành công!",
        duration: 3,
        type: "info"
      })
    } catch (error: any) {
      api.open({
        message: error.message,
        description: error.message,
        duration: 3000,
        type: "error",
      });
    } finally {
      setLoading(false)
    }


  };

  const onFormLayoutChange = ({ size }: any) => {

  };

  const loadMore =
    !initLoading && !loading ? (
      <div
        style={{
          textAlign: 'center',
          marginTop: 12,
          height: 32,
          lineHeight: '32px',
        }}
      >
        <Button onClick={onLoadMore}>Xem thêm</Button>
      </div>
    ) : null;


  return <>
    {contextHolder}
    <div className='flex gap-4 flex-col flex-wrap lg:flex-row'>
      <Card loading={loading} title="Danh chi nhánh" style={{ maxWidth: 700, flex: 2 }}>
        <List
          className="demo-loadmore-list"
          loading={initLoading}
          itemLayout="horizontal"
          loadMore={loadMore}
          dataSource={list}
          renderItem={(item) => (
            <List.Item
              actions={[<a key="list-loadmore-edit">Sửa</a>, <a key="list-loadmore-more">Xoá</a>]}
            >
              <Skeleton avatar title={false} loading={item.loading} active>
                <List.Item.Meta
                  avatar={<Avatar src={"https://randomuser.me/api/portraits/women/21.jpg"} />}
                  title={<a href="#">{item.id} - {item.pricePerHour}/h</a>}
                // description="Ant Design, a design language for background applications, is refined by Ant UED Team"
                />
                <div>{item.address}</div>
              </Skeleton>
            </List.Item>
          )}
        />
      </Card>
      <Card loading={loading} title="Thông tin chi nhánh" style={{ maxWidth: 500, flex: 1 }}>
        <Form
          form={form}
          onFinish={onFinish}
          className='bg-primary p-4'
          labelCol={{ span: 4 }}
          wrapperCol={{ span: 14 }}
          layout="horizontal"
          onValuesChange={onFormLayoutChange}
          size="large"
        // style={{ maxWidth: 600 }}
        >
          <Form.Item className='text-black' name='fid' label="Mã CN">
            <Input />
          </Form.Item>
          <Form.Item name="fname" label="Tên CN">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ CN">
            <Input />
          </Form.Item>
          <Form.Item name="openAt" label="Mở đặt">
            <DatePicker />
          </Form.Item>
          <Form.Item name="pricePerHour" label="Giá 1h">
            <InputNumber />
          </Form.Item>
          <Form.Item name="isAvaliable" label="Hiện CN" valuePropName="checked">
            <Switch />
          </Form.Item>


          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div style={{ display: 'flex', rowGap: 16, flexDirection: 'column' }}>
                {fields.map((field) => (
                  <Card
                    className='bg-teal-600'
                    size="small"
                    title={`Sân ${field.name + 1}`}
                    key={field.key}
                    extra={
                      <CloseOutlined
                        onClick={() => {
                          remove(field.name);
                        }}
                      />
                    }
                  >
                    <Form.Item name={[field.name, 'id']} label="Mã sân">
                      <Input />
                    </Form.Item>
                    <Form.Item name={[field.name, 'name']} label="Tên Sân" >
                      <Input />
                    </Form.Item>
                    <Form.Item name={[field.name, 'timeClusterId']} label="Cụm giờ">
                      <Select>
                        <Select.Option value="cluster1">Cụm 1: 0:15-1:15 | 23:10-0:10</Select.Option>
                        <Select.Option value="cluster2">Cụm 2: 0:25-1:25 | 23:20-00:20</Select.Option>
                        <Select.Option value="cluster3">Cụm 3: 0:35-1:35 | 23:30-00:30</Select.Option>
                        <Select.Option value="cluster4">Cụm 4: 0:45-1:45 | 23:40-0:40</Select.Option>
                      </Select>
                    </Form.Item>
                  </Card>
                ))}

                <Button type="dashed" onClick={() => add()} block>
                  + Thêm sân
                </Button>
              </div>
            )}
          </Form.List>
          <Form.Item className='w-full' label={null}>
            <Button loading={loading} disabled={loading} className='w-full bg-teal-700 mt-6' type="primary" htmlType="submit">
              Tạo
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  </>
};

export default Branchs;