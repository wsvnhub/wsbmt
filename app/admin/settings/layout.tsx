import { ReactNode } from "react"
import SettingsLayout from "./settingLayout";

type SettingLayoutProps = {
    children: ReactNode,
}
const SettingLayout = (props: SettingLayoutProps) => {
    const { children } = props;

    return (
        <SettingsLayout>
            {children}
        </SettingsLayout>
    )
}

export default SettingLayout
