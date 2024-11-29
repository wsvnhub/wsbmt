"use client"
import React, { useState } from 'react';
import {
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    PercentageOutlined,
    PushpinOutlined,
    CalendarOutlined,
    CloudDownloadOutlined,
    HarmonyOSOutlined
} from '@ant-design/icons';
import { Button, Layout, Menu, theme } from 'antd';

const { Header, Sider, Content } = Layout;

const SettingsLayout = ({ children }: any) => {
    const [collapsed, setCollapsed] = useState(false);
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();

    return (
        <Layout>
            <Sider trigger={null} collapsible collapsed={collapsed}>
                <div className="demo-logo-vertical" />
                <Menu
                    onClick={({ item, key, keyPath, domEvent }) => {
                        console.log("keyPath", keyPath, key)
                    }}
                    mode="inline"
                    defaultSelectedKeys={['1']}
                    items={[
                        {
                            key: '0',
                            icon: <HarmonyOSOutlined />,
                        },
                        {
                            key: '1',
                            icon: <PushpinOutlined />,
                            label: 'Chi nhánh',
                        },
                        {
                            key: '2',
                            icon: <PercentageOutlined />,
                            label: 'Mã giảm',
                        },
                        {
                            key: '3',
                            icon: <CalendarOutlined />,
                            label: 'Mở thêm tháng',
                        },
                        {
                            key: '4',
                            icon: <CloudDownloadOutlined />,
                            label: 'Sao lưu',
                        },
                    ]}
                />
            </Sider>
            <Layout>
                <Header style={{ padding: 0, background: colorBgContainer }}>
                    <Button
                        type="text"
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setCollapsed(!collapsed)}
                        style={{
                            fontSize: '16px',
                            width: 64,
                            height: 64,
                        }}
                    />
                </Header>
                <Content
                    style={{
                        margin: '24px 16px',
                        padding: 24,
                        minHeight: "100vh",
                        background: colorBgContainer,
                        borderRadius: borderRadiusLG,
                    }}
                >
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
};

export default SettingsLayout;