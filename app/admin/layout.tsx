import AuthenticationLayout from "@/components/AuthenticationLayout";
import { ReactNode } from "react"

type AdminLayoutProps = {
  children: ReactNode,
}
const AdminLayout = (props: AdminLayoutProps) => {
  const { children } = props;

  return (
    <AuthenticationLayout title="Nhập mật khẩu vào admin" correctPassword="a@20172023">
      {children}
    </AuthenticationLayout>
  )
}

export default AdminLayout
