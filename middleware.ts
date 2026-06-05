import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

// Khoá TOÀN BỘ method của các endpoint admin/nguy hiểm.
const FULLY_PROTECTED = [
  "/api/backup", // GET dump + POST drop & ghi đè cả collection timeslots
  "/api/stats", // GET + DELETE thống kê chi nhánh
  "/api/promotions", // CRUD mã giảm giá
  "/api/schedules", // GET toàn bộ đơn + DELETE
];

// Chỉ khoá method ghi; GET vẫn public (luồng khách hiển thị chi nhánh/sân/lịch).
const WRITE_PROTECTED = ["/api/facilities", "/api/courts", "/api/calendar"];
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + "/");
}

function isProtected(pathname: string, method: string): boolean {
  if (FULLY_PROTECTED.some((p) => matches(pathname, p))) return true;
  if (
    WRITE_PROTECTED.some((p) => matches(pathname, p)) &&
    WRITE_METHODS.has(method)
  ) {
    return true;
  }
  // /api/time-slots: GET (xem) và DELETE (khách huỷ đơn hết hạn) phải public,
  // chỉ khoá POST (admin sinh time slot trong phần cài đặt chi nhánh).
  if (matches(pathname, "/api/time-slots") && method === "POST") return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname, request.method)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: "Unauthorized - cần đăng nhập admin" },
    { status: 401 }
  );
}

// Chạy middleware cho mọi route /api; logic isProtected quyết định chặn hay không.
// (Không ảnh hưởng Socket.io vì socket nằm ngoài pipeline của Next.)
export const config = {
  matcher: ["/api/:path*"],
};
