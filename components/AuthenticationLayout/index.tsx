"use client";
import { Input, Modal, notification } from "antd";
import { ReactNode, useEffect, useState } from "react";

type AuthenticationLayoutProps = {
  children: ReactNode;
  title: string;
  /** @deprecated mật khẩu được kiểm tra ở server, prop này không còn dùng. */
  correctPassword?: string;
};

const AuthenticationLayout = (props: AuthenticationLayoutProps) => {
  const { children } = props;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [inputVal, setInputVal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  // Kiểm tra cookie phiên hiện có: nếu đã đăng nhập trước đó thì bỏ qua modal.
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((res) => {
        if (!active) return;
        if (res.authenticated) {
          setIsAuthenticated(true);
        } else {
          setOpen(true);
        }
      })
      .catch(() => active && setOpen(true))
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: inputVal }),
      });
      if (res.ok) {
        setIsAuthenticated(true);
        setOpen(false);
        setInputVal("");
      } else {
        notification.error({ message: "Sai mật khẩu" });
      }
    } catch {
      notification.error({ message: "Lỗi kết nối, thử lại" });
    } finally {
      setSubmitting(false);
    }
  };

  if (isAuthenticated) return children;
  if (checking) return null;

  return (
    <Modal
      onOk={onSubmit}
      open={open}
      title={props.title}
      confirmLoading={submitting}
      closable={false}
      maskClosable={false}
      cancelButtonProps={{ style: { display: "none" } }}
    >
      <Input.Password
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onPressEnter={onSubmit}
      />
    </Modal>
  );
};

export default AuthenticationLayout;
