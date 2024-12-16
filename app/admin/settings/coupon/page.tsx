"use client"
import React from 'react';
import {
  Avatar, Button, List,
  DatePicker,
  Form,
  Input,
  InputNumber,
  notification,
  PopconfirmProps,
  message, Popconfirm, Card,
  Skeleton,
  Select
} from 'antd';

import axios from 'axios';
import dayjs from 'dayjs';

interface DataType {
  code: string
  count: number
  expired: string
  id: string
  _id: string
  limit: number
  unit: string
  value: number
  max: string
  min: string
  dates: {
    date: number[],
    month: number[],
    year: number[]
  }
  times: { from: string, to: string }
  days: number[]
}



const Coupon = () => {

  const [form] = Form.useForm();

  const [api, contextHolder] = notification.useNotification();

  const [branchs, setBranch] = React.useState([])
  const [initLoading, setInitLoading] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<DataType[]>([]);
  const [list, setList] = React.useState<DataType[]>([]);

  React.useEffect(() => {
    axios.get('/api/facilities').then(res => {
      setBranch(res.data.data)
    })

  }, [])


  React.useEffect(() => {
    fetch('/api/promotions')
      .then((res) => res.json())
      .then((res) => {
        setInitLoading(false);
        console.log(res.data)
        setData(res.data);
        setList(res.data);
      });
  }, []);


  const onLoadMore = () => { }

  const onDelete = (id: string) => {
    return axios.delete('/api/promotions', { data: { id } })
  }

  const onFinish = async (values: any) => {
    setLoading(true)
    const { code, expired, value, max, min, date, month, year, from, to, days, limit ,branch} = values
    console.log(branch)
    try {
      const body = {
        code: code.toLowerCase(),
        count: 0,
        expired: expired.toDate().toLocaleDateString(),
        limit: Number(limit),
        unit: "percent",
        value: Number(value),
        max: Number(max || 0),
        min: Number(min || 0),
        dates: {
          date: date?.map((d: dayjs.Dayjs) => d.date()) || [],
          month: month?.map((d: dayjs.Dayjs) => d.month() + 1) || [],
          year: year?.map((d: dayjs.Dayjs) => d.year()) || []
        },
        times: { from: `${from.hour()}:${from.minute()}`, to: `${to.hour()}:${to.minute()}` },
        days: days.map((d: dayjs.Dayjs) => d.day()) || [],
        facility: branch
      }

      const coupon = await axios.post('/api/promotions', body)

      console.log(coupon.data)

      api.open({
        message: coupon.data.message,
        description: coupon.data.id,
        duration: 3,
        type: "success",
      });
    } catch (error: any) {
      console.log(error)
      api.open({
        message: error.message,
        description: error.message,
        duration: 3,
        type: "error",
      });
    } finally {
      setLoading(false)
    }


  };

  const onFormLayoutChange = ({ size }: any) => {

  };


  const confirm = async (e: any, id: string) => {
    try {
      await onDelete(id)
      message.success('Xoá thành công');
    } catch (error: any) {
      message.error(error.message)
    }
  };

  const cancel: PopconfirmProps['onCancel'] = (e) => {
    console.log(e);
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
      <Card loading={loading} title="Danh chi mã giảm" style={{ maxWidth: 700, flex: 2 }}>
        <List
          className="demo-loadmore-list m-4"
          loading={initLoading}
          itemLayout="horizontal"
          loadMore={loadMore}
          dataSource={list}
          renderItem={(item) => {
            const times = item.times !== undefined ? item.times : { from: "", to: "" }
            return <List.Item
              key={item._id}
              actions={[<a key="list-loadmore-edit">Sửa</a>,
              <Popconfirm

                id='asdasjdksa,dh'
                title={`Xoá mã ${item.code}`}
                description="Bạn muốn xoá mã này?"
                onConfirm={(e) => confirm(e, item._id)}
                onCancel={cancel}
                okText="Yes"
                cancelText="No"
              >
                <Button danger>Xoá</Button>
              </Popconfirm>]}
            >
              <Skeleton avatar title={false} loading={false} active>
                <List.Item.Meta
                  avatar={<Avatar src={"https://blog.dktcdn.net/files/coupon-la-gi.jpg"} />}
                  title={<p>Mã: {item.code} - lượt:{item.count}/{item.limit}</p>}
                  description={`Max: ${item.max || 0} | 
                Min: ${item.min || 0} |
                áp dụng từ: ${times.from}- ${times.to}`}
                />
                <div>Giảm: {item.value} /{item.unit} | HSD: {new Date(item.expired).toLocaleDateString()}</div>
              </Skeleton>
            </List.Item>
          }}
        />
      </Card>
      <Card loading={loading} title="Thêm/Sửa mã giảm" style={{ maxWidth: 500, flex: 1 }}>
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
          <p className='font-semibold text-white text-2xl my-4'>Thông tin chi nhánh</p>
          <Form.Item className='text-black' name='code' label="Mã">
            <Input />
          </Form.Item>
          <Form.Item className='text-black' name='limit' label="Luọt dùng">
            <Input />
          </Form.Item>
          <Form.Item className='text-black' name='value' label="Giảm %">
            <Input />
          </Form.Item>
          <Form.Item name="from" label="Từ">
            <DatePicker picker="time" />
          </Form.Item>
          <Form.Item name="to" label="Tới">
            <DatePicker picker="time" />
          </Form.Item>
          <Form.Item name="days" label="Thứ">
            <DatePicker multiple format={"dd"} picker="date" minDate={dayjs().startOf('day')} />
          </Form.Item>
          <Form.Item name="date" label="Ngày">
            <DatePicker multiple format={"DD"} picker="date" minDate={dayjs().startOf('day')} />
          </Form.Item>
          <Form.Item name="month" label="Tháng">
            <DatePicker multiple picker="month" minDate={dayjs().startOf('day')} />
          </Form.Item>
          <Form.Item name="year" label="Năm">
            <DatePicker multiple minDate={dayjs().startOf('day')} picker="year" />
          </Form.Item>
          <Form.Item name="expired" label="HSD">
            <DatePicker minDate={dayjs().startOf('day')} />
          </Form.Item>

          <Form.Item
            label="Chi nhánh"
            name="branch"
          >
            <Select mode="multiple" allowClear>
              {branchs.map((b: any) => {
                return <Select.Option key={b.id} value={b.id}>{b.name}</Select.Option>
              })}
            </Select>
          </Form.Item>

          <Form.Item name="min" label="Tối thiểu">
            <InputNumber />
          </Form.Item>
          <Form.Item name="max" label="Tối đa">
            <InputNumber />
          </Form.Item>

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

export default Coupon;