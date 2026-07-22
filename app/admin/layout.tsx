import { ReactNode } from "react"

type AdminLayoutProps = {
  children: ReactNode,
}
// Quyền truy cập /admin được gác ở middleware (server). Chưa đăng nhập sẽ bị
// redirect sang /login trước khi tới đây.
const AdminLayout = (props: AdminLayoutProps) => {
  const { children } = props;
  return <>{children}</>
}

export default AdminLayout
