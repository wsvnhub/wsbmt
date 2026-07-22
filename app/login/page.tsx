"use client";
import { Button, Card, Input, notification } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Cookie đã được set; dùng full reload để middleware đọc cookie mới.
        window.location.href = "/admin";
      } else {
        notification.error({ message: "Sai mật khẩu" });
      }
    } catch {
      notification.error({ message: "Lỗi kết nối, thử lại" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <Card title="Đăng nhập admin" style={{ width: 360, maxWidth: "100%" }}>
        <Input.Password
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={submit}
          autoFocus
        />
        <Button
          type="primary"
          block
          style={{ marginTop: 16 }}
          loading={loading}
          onClick={submit}
        >
          Đăng nhập
        </Button>
      </Card>
    </div>
  );
}
