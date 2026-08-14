import { timingSafeEqual } from "node:crypto";

/**
 * Auth admin phía server cho socket.
 *
 * Trước đây mật khẩu admin được so sánh TRONG BROWSER với một literal hardcode
 * (tại app/admin/useAdmin.ts) nên nó nằm sẵn trong JS bundle, ai mở devtools
 * cũng đọc được — mật khẩu cũ phải coi là đã lộ và cần đổi. Phía server thì
 * `schedules:manual` nhận lệnh từ bất kỳ socket nào mà không kiểm tra gì —
 * nghĩa là bất kỳ ai cũng emit được {action:"delete"} để nhả hoặc ghi lại mọi ô
 * trong hệ thống.
 *
 * Ở đây mật khẩu chỉ tồn tại trong biến môi trường phía server, và quyền admin
 * được đánh dấu trên chính socket sau khi xác thực.
 */

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * @param {string} password
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;

  // Fail closed. Thiếu env thì không ai là admin, chứ không phải ai cũng là admin.
  if (!expected) {
    return { ok: false, reason: "ADMIN_PASSWORD chưa được cấu hình trên server" };
  }
  if (!password || !safeEqual(password, expected)) {
    return { ok: false, reason: "Mật khẩu không hợp lệ" };
  }
  return { ok: true };
}

/**
 * Guard dùng trong các socket handler cần quyền admin.
 * @param {import("socket.io").Socket} socket
 */
export function isAdminSocket(socket) {
  return socket.data?.isAdmin === true;
}
