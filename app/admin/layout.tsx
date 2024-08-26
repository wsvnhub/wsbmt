import AuthenticationLayout from "@/components/AuthenticationLayout";
import { ReactNode } from "react"

type AdminLayoutProps = {
  children: ReactNode,
}
const AdminLayout = (props: AdminLayoutProps) => {
  const { children } = props;

  return (
    <AuthenticationLayout>
      {children}
    </AuthenticationLayout>
  )
}

export default AdminLayout
