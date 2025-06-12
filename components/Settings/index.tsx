"use client"
import React, { useState } from 'react';
import { Card, Form, Table, Input, Button, Select, DatePicker, Tag } from 'antd';
import type { TableColumnsType, TableProps } from 'antd';
import type { FormProps } from 'antd';
import timeSlots from '@/data/timeSlots.json'
import axios from 'axios';

type TableRowSelection<T extends object = object> = TableProps<T>['rowSelection'];

interface DataType {
  key: React.Key;
  name: string;
  phone: number;
  court: string;
  days: string
}


type FieldType = {
  username?: string;
  phone?: string;
  branch: string
  court?: string;
  time?: string;
  days: number
};

const columns: TableColumnsType<DataType> = [
  {
    title: 'Tên',
    dataIndex: 'name',
  },
  {
    title: 'SDT',
    dataIndex: 'phone',
  },
  {
    title: 'Khung giờ + sân',
    dataIndex: 'court',
  },
  {
    title: 'Ngày cố định',
    dataIndex: 'days',
  },
];


const schedulesColumns: TableColumnsType<DataType> = [
  {
    title: 'Tên',
    dataIndex: 'userName',
  },
  {
    title: 'Email',
    dataIndex: 'email',
  },
  {
    title: 'Chi tiết',
    dataIndex: 'details',
  },
  {
    title: 'transaction Code',
    dataIndex: 'transactionCode',
  },
  {
    title: 'Trạng thái',
    dataIndex: 'status',
  },
  {
    title: 'Đặt lúc',
    dataIndex: 'createdAt',
  },
];

const SettingPage = ({ branchs }: any) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fixedDataSource, setFixedDataSource] = React.useState<DataType[]>([])

  // const [branchs, setBranch] = React.useState([])
  const [selectedBranch, setSelectedBranch] = React.useState("")
  const [selectedCourt, setSelectedCourt] = React.useState("-")
  const [courts, setCourts] = React.useState([])
  const [schedules, setSchedules] = React.useState([])

  const [page, setPage] = React.useState(1)
  const [pageSize, sePageSize] = React.useState(10)
  const [totalPages, setTotalPages] = React.useState(1)

  const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
    console.log('selectedRowKeys changed: ', newSelectedRowKeys);
    setSelectedRowKeys(newSelectedRowKeys);
  };

  // React.useEffect(() => {
  //   axios.get('/api/facilities').then(res => {
  //     setBranch(res.data.data)
  //   })

  // }, [])


  React.useEffect(() => {
    axios
      .get('/api/schedules', {
        params: {
          page,
          pageSize,
        },
      })
      .then((res) => {
        setSchedules(res.data.data)
        setTotalPages(res.data.totalPages)
      })
      .catch((err) => console.error(err))
  }, [page, pageSize])

  React.useEffect(() => {
    if (selectedBranch !== "") {
      axios.get(`/api/courts?facilitiyId=${selectedBranch}`).then(res => {
        console.log(res.data)
        setCourts(res.data.data)
      })
    }
  }, [selectedBranch])

  const onFinish: FormProps<FieldType>['onFinish'] = (values) => {
    console.log('Success:', values);
  };

  const onFinishFailed: FormProps<FieldType>['onFinishFailed'] = (errorInfo) => {
    console.log('Failed:', errorInfo);
  };

  const rowSelection: TableRowSelection<DataType> = {
    selectedRowKeys,
    onChange: onSelectChange,
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
      {
        key: 'odd',
        text: 'Select Odd Row',
        onSelect: (changeableRowKeys) => {
          let newSelectedRowKeys = [];
          newSelectedRowKeys = changeableRowKeys.filter((_, index) => {
            if (index % 2 !== 0) {
              return false;
            }
            return true;
          });
          setSelectedRowKeys(newSelectedRowKeys);
        },
      },
      {
        key: 'even',
        text: 'Select Even Row',
        onSelect: (changeableRowKeys) => {
          let newSelectedRowKeys = [];
          newSelectedRowKeys = changeableRowKeys.filter((_, index) => {
            if (index % 2 !== 0) {
              return true;
            }
            return false;
          });
          setSelectedRowKeys(newSelectedRowKeys);
        },
      },
    ],
  };


  return <div>
    <div className='flex gap-4 flex-wrap'>

      <Card loading={!loading} title="Danh sách đặt" style={{ maxWidth: 700, flex: 1 }}>
        <Table<DataType>
          rowSelection={rowSelection}
          columns={schedulesColumns}
          scroll={{ x: 'max-content' }}
          pagination={{
            pageSize,
            total: totalPages * pageSize,
            onChange(page, pageSize) {
              setPage(page)
              sePageSize(pageSize)
            },
          }}
          dataSource={schedules}>
          <Table.Column
            title="Tags"
            dataIndex="tags"
            key="tags"
            render={(status: string) => (
              <>
                (
                <Tag key={status}>
                  {status.toUpperCase()}
                </Tag>
                );
              </>
            )}
          />
        </Table>
      </Card>
      <Card loading={!loading} title="Đặt cố định" style={{ maxWidth: 500, flex: 2 }}>
        <Form
          className='bg-teal-600 p-4'
          name="basic"
          labelCol={{ span: 8 }}
          wrapperCol={{ span: 16 }}
          // style={{ maxWidth: 600 }}
          initialValues={{ remember: true }}
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
          autoComplete="off"
        >
          <Form.Item<FieldType>
            label="Tên"
            name="username"
            rules={[{ required: true, message: 'Please input your username!' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item<FieldType>
            label="Số điện thoại"
            name="phone"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item<FieldType>
            label="Chi nhánh"
            name="branch"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Select onChange={value => setSelectedBranch(value)}>
              {branchs.map((b: any) => {
                return <Select.Option key={b.id} value={b.id}>{b.name}</Select.Option>
              })}
            </Select>
          </Form.Item>

          <Form.Item<FieldType>
            label="Sân"
            name="court"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Select onChange={value => setSelectedCourt(value)} >
              {courts.map((c: any) => {
                return <Select.Option key={c.id} value={`${c.id}-${c.timeClusterId}`}>{c.name}</Select.Option>
              })}

            </Select>
          </Form.Item>

          <Form.Item<FieldType>
            label="Khung giờ"
            name="time"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Select>
              {timeSlots[(selectedCourt.split("-")[1] != undefined ? "cluster1" : "") as keyof typeof timeSlots].map((t, index) => {
                return <Select.Option key={index} value={t.time}>{t.time}</Select.Option>
              })}
            </Select>
          </Form.Item>

          <Form.Item name="openAt" label="Ngày cố định">
            <DatePicker multiple format={"dd"} />
          </Form.Item>

          <Form.Item label={null}>
            <Button type="primary" htmlType="submit">
              Đặt
            </Button>
          </Form.Item>
        </Form>
        <Table<DataType> 
        rowSelection={rowSelection}
         columns={columns}
          dataSource={fixedDataSource} />
      </Card>
    </div>
  </div>


};

export default SettingPage;