import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

// Client không đọc được cookie (HttpOnly) nên dùng endpoint này để biết
// đã đăng nhập hay chưa (ví dụ AuthenticationLayout kiểm tra khi mở trang).
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authenticated = await verifySessionToken(token);
  return NextResponse.json({ authenticated });
}
