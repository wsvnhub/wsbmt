"use client";

import { io, Socket } from "socket.io-client";

// Chỉ khởi tạo socket ở trình duyệt. Nếu gọi io() khi SSR (server),
// socket.io-client sẽ truy cập localStorage -> "localStorage.getItem is not a function" -> 500.
export const socket: Socket =
  typeof window !== "undefined" ? io() : (undefined as unknown as Socket);