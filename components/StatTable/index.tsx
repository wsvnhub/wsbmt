import React from 'react';
import { Card, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs'; // nếu muốn định dạng ngày đẹp

// interface StatItem {
//     date: string;
//     branchId: string;
//     branchName: string;
//     stats: {
//         emptySlotsCount: number;
//         bookedSlotsCount: number;
//         totalSlotsCount: number;
//     };
//     createdAt: string;
// }

interface StatsTableProps {
    data: any[];
}

export default function StatsTable({ data }: StatsTableProps) {
    // Tạo danh sách các chi nhánh duy nhất
    const branches = data.map((item) => ({
        id: item.branchId,
        name: item.branchName,
    }));

    // Tạo columns động theo chi nhánh
    const columns: TableColumnsType<any> = branches.map((b) => ({
        title: b.name,
        key: b.id,
        dataIndex: b.id,
        children: [
            {
                title: 'Chơi hôm nay',
                dataIndex: [`${b.id}`, 'bookedSlotsCount'],
                key: `${b.id}_booked`,
            },
            {
                title: 'Ô tương lai',
                dataIndex: [`${b.id}`, 'emptySlotsCount'],
                key: `${b.id}_empty`,
            },
        ],
    }));

   

    // Tính tổng chơi hôm nay và ô tương lai cho tất cả chi nhánh
    columns.unshift({
        title: 'Tổng ô',
        key: 'total',
        children: [
            {
                title: 'Chơi hôm nay',
                dataIndex: ['total', 'bookedSlotsCount'],
                key: 'total_booked',
            },
            {
                title: 'Ô tương lai',
                dataIndex: ['total', 'emptySlotsCount'],
                key: 'total_empty',
            },
        ],
    });

     // Thêm cột Ngày
    columns.unshift({
        title: 'Ngày',
        dataIndex: 'date',
        key: 'date',
    });

    // Gộp tất cả chi nhánh vào 1 dòng (nếu nhiều ngày thì cần xử lý khác)
    const row: any = {
        key: '1',
        date: dayjs(data[0].date).format('YYYY-MM-DD'), // hoặc giữ nguyên data[0].date
        total: {
            bookedSlotsCount: 0,
            emptySlotsCount: 0,
        },
    };

    data.forEach((item) => {
        row[item.branchId] = {
            bookedSlotsCount: item.stats.bookedSlotsCount,
            emptySlotsCount: item.stats.emptySlotsCount,
        };

        row.total.bookedSlotsCount += item.stats.bookedSlotsCount;
        row.total.emptySlotsCount += item.stats.emptySlotsCount;
    });

    const dataSource = [row];

    return (
        <Card title={<h2>Bảng thống kê theo chi nhánh</h2>} >
            <Table
                columns={columns}
                dataSource={dataSource}
                pagination={false}
                bordered
                scroll={{ x: 'max-content' }}
            />
        </Card>
    );
}
