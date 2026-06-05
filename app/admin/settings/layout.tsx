import { ReactNode } from "react"
import SettingsLayout from "./settingLayout";
import AuthenticationLayout from "@/components/AuthenticationLayout";
import { App as AntdApp } from "antd";

type SettingLayoutProps = {
    children: ReactNode,
}
const SettingLayout = (props: SettingLayoutProps) => {
    const { children } = props;

    return (
        <AntdApp>
            <AuthenticationLayout title="Nhập mật khẩu vào settings">
                <SettingsLayout>
                    {children}
                </SettingsLayout>
            </AuthenticationLayout>
        </AntdApp>
    )
}

export default SettingLayout
