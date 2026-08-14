import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Auth cho các endpoint xử lý tiền.
 *
 * Trước đây POST /api/booking và POST /api/verify-status hoàn toàn không auth.
 * Vì mã giao dịch cũ chỉ phân giải tới 10 giây (xem utils/index.ts) nên nó đoán
 * được, và POST /api/booking không hề so `amount` với `totalPrice` — chỉ cần
 * đoán đúng mã là biến một hold thành booking đã-thanh-toán mà không trả đồng
 * nào, hoặc phá đơn của người khác.
 */

/** So sánh chuỗi không phụ thuộc thời gian, tránh rò rỉ qua timing. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Xác thực webhook bằng bearer token dùng chung.
 *
 * @param {Request} request
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyWebhookAuth(request) {
  const expected = process.env.WEBHOOK_SECRET;

  // Fail closed: chưa cấu hình secret thì từ chối, không phải cho qua. Nếu cho
  // qua khi thiếu env thì một lần deploy quên biến môi trường là mở lại đúng lỗ
  // hổng này mà không ai biết.
  if (!expected) {
    return { ok: false, reason: "WEBHOOK_SECRET chưa được cấu hình" };
  }

  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || !safeEqual(token, expected)) {
    return { ok: false, reason: "Unauthorized" };
  }

  return { ok: true };
}

/**
 * Xác thực chữ ký HMAC-SHA256 của SePay trên raw body, nếu SEPAY_SIGNING_SECRET
 * được cấu hình. Mạnh hơn bearer token vì gắn với chính nội dung request.
 *
 * @param {string} rawBody
 * @param {string | null} signature
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifySepaySignature(rawBody, signature) {
  const secret = process.env.SEPAY_SIGNING_SECRET;
  if (!secret) return { ok: false, reason: "SEPAY_SIGNING_SECRET chưa cấu hình" };
  if (!signature) return { ok: false, reason: "Thiếu chữ ký" };

  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (!safeEqual(digest, signature)) {
    return { ok: false, reason: "Chữ ký không hợp lệ" };
  }
  return { ok: true };
}

/**
 * Xác thực một request tới endpoint tiền: chấp nhận HMAC của SePay HOẶC bearer
 * token. Ít nhất một cơ chế phải được cấu hình và khớp.
 *
 * @param {Request} request
 * @param {string} rawBody
 */
export function verifyPaymentRequest(request, rawBody) {
  if (process.env.SEPAY_SIGNING_SECRET) {
    const sig =
      request.headers.get("x-sepay-signature") ||
      request.headers.get("x-signature");
    const res = verifySepaySignature(rawBody, sig);
    if (res.ok) return res;
    // Có cấu hình HMAC nhưng không khớp -> vẫn cho phép bearer token làm lối
    // vào phụ (dùng cho admin xác nhận tay), không im lặng bỏ qua.
  }
  return verifyWebhookAuth(request);
}
