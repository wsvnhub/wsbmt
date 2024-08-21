"use client";
import { Input, Modal, notification } from "antd";
import { ReactNode, useEffect, useState } from "react";

const correctPassword = "a@20172023";

type AuthenticationLayoutProps = {
  children: ReactNode;
};
const AuthenticationLayout = (props: AuthenticationLayoutProps) => {
  const { children } = props;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [open, setOpen] = useState(false);

  const onSubmit = () => {
    if (inputVal !== correctPassword) {
      notification.error({
        message: "Sai mật khẩu",
      });
    } else {
      setIsAuthenticated(true);
    }
  };

  useEffect(() => {
    setOpen(true);
  }, []);

  if (!isAuthenticated) {
    return (
      <Modal onOk={onSubmit} open={open} title="Nhập mật khẩu">
        <Input.Password
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
        />
      </Modal>
    );
  }
  return children;
};

export default AuthenticationLayout;
