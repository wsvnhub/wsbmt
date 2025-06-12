import React from 'react';
import { Card, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';

interface StatItem {
    date: string;
    branchId: string;
    branchName: string;
    stats: {
        emptySlotsCount: number;
        bookedSlotsCount: number;
        totalSlotsCount: number;
    };
    createdAt: string;
}

interface StatsTableProps {
    data: any[];
    branchs: any[];
}

export default function StatsTable({ data, branchs }: StatsTableProps) {
    // Tạo danh sách các chi nhánh
    const branches = branchs.map((item) => ({
        id: item.id,
        name: item.name,
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

    // Thêm cột tổng
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

    // Cột ngày
    columns.unshift({
        title: 'Ngày',
        dataIndex: 'date',
        key: 'date',
    });

    // Nhóm dữ liệu theo ngày
    const groupedByDate = data.reduce((acc, item) => {
        const date = dayjs(item.date).format('YYYY-MM-DD');
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(item);
        return acc;
    }, {} as Record<string, StatItem[]>);

    // Tạo rows cho mỗi ngày
    const dataSource = Object.entries(groupedByDate).map(([date, items]: any, index) => {
        const row: any = {
            key: index,
            date,
            total: {
                bookedSlotsCount: 0,
                emptySlotsCount: 0,
            },
        };

        items.forEach((item: any) => {
            row[item.branchId] = {
                bookedSlotsCount: item.stats.bookedSlotsCount,
                emptySlotsCount: item.stats.emptySlotsCount,
            };

            row.total.bookedSlotsCount += item.stats.bookedSlotsCount;
            row.total.emptySlotsCount += item.stats.emptySlotsCount;
        });

        return row;
    });

    return (
        <Card title={<h2>Bảng thống kê theo chi nhánh</h2>}>
            <Table
                columns={columns}
                dataSource={dataSource}
                pagination={{
                    pageSize: 20,
                    // total: dataSource.length * 20,
                    // onChange(page, pageSize) {
                    //     setPage(page)
                    //     sePageSize(pageSize)
                    // },
                }}
                bordered
                scroll={{ x: 'max-content' }}
            />
        </Card>
    );
}
