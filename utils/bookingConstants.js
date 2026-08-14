/**
 * Hằng số dùng chung cho luồng giữ sân / thanh toán.
 *
 * File này là .js (không phải .ts) để cả server ESM thuần (server-updated.js,
 * engine/*.js) và client Next/TS đều import được — tsconfig có allowJs: true.
 *
 * BẤT BIẾN QUAN TRỌNG: SERVER_HOLD_MS phải LỚN HƠN CLIENT_COUNTDOWN_MS.
 * Nếu ngược lại, UI sẽ mời khách chuyển khoản cho ô mà server đã nhả, và tiền
 * vào sau khi ô đã bị người khác đặt. Đây chính là bug đã gây ra 139 dòng
 * "Đơn hàng của bạn đã bị xoá" trong app.log: đồng hồ UI 15 phút
 * (1500 * 60 * 10 ms) chạy song song với hold 10 phút của server.
 */

/** Thời gian server giữ ô sau khi tạo đơn. Phải > CLIENT_COUNTDOWN_MS. */
export const SERVER_HOLD_MS = 20 * 60 * 1000;

/** Đồng hồ đếm ngược hiển thị cho khách. Phải < SERVER_HOLD_MS. */
export const CLIENT_COUNTDOWN_MS = 15 * 60 * 1000;

/**
 * Hold ngắn ở pha 1 của đơn nhiều document (nhiều sân / nhiều ngày).
 * Sau khi claim đủ mọi document mới extend lên SERVER_HOLD_MS.
 * Ngắn để một saga bị crash tự lành trong 90 giây thay vì chặn ô suốt 20 phút.
 */
export const SHORT_HOLD_MS = 90 * 1000;

/** Chu kỳ sweeper quét hold hết hạn. Chỉ là hygiene, không phải correctness. */
export const SWEEP_INTERVAL_MS = 60 * 1000;

/** Số ô mỗi cluster trong data/timeSlots.json. */
export const SLOTS_PER_CLUSTER = 22;

/**
 * Vocabulary status của một ô. Không có "empty": ô trống = không có key trong
 * `slots`. Giữ đúng vocabulary cũ (wait/booked/fixed/pass) để bgColors trong
 * ScheduleTable, stats, Lark và các API route hiện tại không phải đổi.
 */
export const SLOT_STATUS = {
  /** Đang giữ, chờ thanh toán. Ô duy nhất có holdExpiresAt. */
  WAIT: "wait",
  /** Đã thanh toán. Không bao giờ có holdExpiresAt. */
  BOOKED: "booked",
  /** Đặt cố định định kỳ. Không bao giờ có holdExpiresAt. */
  FIXED: "fixed",
  /** Admin khoá thủ công. Không bao giờ có holdExpiresAt. */
  PASS: "pass",
};

/** Status của một đơn trong collection `schedules`. */
export const SCHEDULE_STATUS = {
  /** Đã insert nhưng chưa claim xong ô nào. Không bao giờ hiện cho khách. */
  PENDING: "pending",
  /** Đã giữ đủ ô, chờ thanh toán. */
  WAIT: "wait",
  /** Đã thanh toán. */
  BOOKED: "booked",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

/** Múi giờ chuẩn để quy đổi instant -> chuỗi ngày. VN không có DST. */
export const BOOKING_TIMEZONE = "Asia/Ho_Chi_Minh";
