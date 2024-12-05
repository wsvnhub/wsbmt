import { ReactNode } from "react"
import SettingsLayout from "./settingLayout";
import AuthenticationLayout from "@/components/AuthenticationLayout";

type SettingLayoutProps = {
    children: ReactNode,
}
const SettingLayout = (props: SettingLayoutProps) => {
    const { children } = props;

    return (
        <AuthenticationLayout title="Nhập mật khẩu vào settings" correctPassword="TeamMate&2069">
            <SettingsLayout>
                {children}
            </SettingsLayout>
        </AuthenticationLayout>
    )
}

export default SettingLayout
