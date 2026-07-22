import { ReactNode } from "react"
import SettingsLayout from "./settingLayout";
import { App as AntdApp } from "antd";

type SettingLayoutProps = {
    children: ReactNode,
}
// Quyền truy cập được gác ở middleware (server) cho toàn bộ /admin/**.
const SettingLayout = (props: SettingLayoutProps) => {
    const { children } = props;

    return (
        <AntdApp>
            <SettingsLayout>
                {children}
            </SettingsLayout>
        </AntdApp>
    )
}

export default SettingLayout
