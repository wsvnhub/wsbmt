import { SCHEDULE_STATUS, SERVER_HOLD_MS } from "./bookingConstants.js";
import {
  SCHEDULES,
  claimGroup,
  confirmGroup,
  groupSlotsForClaim,
  recordPaymentException,
} from "./courtDays.js";

/**
 * XÁC NHẬN MỘT ĐƠN ĐÃ THANH TOÁN — điểm vào DUY NHẤT.
 *
 * Trước đây có BA bản khác nhau với BA precondition khác nhau:
 *   - engine/bookingEngine.js confirmBooking  (đòi sessionId trong RAM)
 *   - utils/updateTimeSlotsStatus.js          ($set cả object từ dữ liệu client)
 *   - app/api/verify-status/route.ts          (bulkWrite không điều kiện gì)
 * Chúng đã trôi lệch nhau, và bản verify-status là bản duy nhất thực sự chạy
 * trong production. Giờ cả socket server lẫn Next API route đều gọi hàm này.
 *
 * Định danh bằng `transactionCode` vì đó là thứ DUY NHẤT webhook ngân hàng biết.
 * Không dùng sessionId in-memory: nó bị xoá khi socket ngắt, nên refresh trang
 * QR / rớt mạng / restart pm2 là đơn đã trả tiền không confirm được nữa.
 *
 * Idempotent: gọi lại bao nhiêu lần cũng trả thành công.
 */
export async function confirmPaidOrder(db, transactionCode, paymentInfo = {}) {
  const schedules = db.collection(SCHEDULES);
  const schedule = await schedules.findOne({ transactionCode });

  if (!schedule) {
    return { success: false, code: "NOT_FOUND", error: "Không tìm thấy đơn hàng" };
  }
  if (schedule.status === SCHEDULE_STATUS.BOOKED) {
    return { success: true, replay: true, scheduleId: schedule.id, schedule, transactionCode };
  }
  if (schedule.status === SCHEDULE_STATUS.CANCELLED) {
    return { success: false, code: "CANCELLED", error: "Đơn hàng đã bị huỷ" };
  }

  const groups = groupSlotsForClaim(schedule.timeSlots || []);
  const stillMissing = [];

  for (const g of groups) {
    const res = await confirmGroup(db, g, schedule.holdId, transactionCode);
    if (res.missing.length === 0) continue;

    // Hold hết hạn giữa lúc khách bấm chuyển khoản và lúc tiền về ngân hàng.
    // Thử giành lại: phần lớn trường hợp ô vẫn còn trống nên cứu được đơn. Đây
    // đúng là kịch bản đã xảy ra 139 lần trong app.log.
    const retry = await claimGroup(
      db,
      { ...g, slotIndexes: res.missing },
      {
        holdId: schedule.holdId,
        holdExpiresAt: new Date(Date.now() + SERVER_HOLD_MS),
        scheduleId: schedule.id,
        transactionCode,
        bookedBy: { name: schedule.userName, phone: schedule.phone },
        isFixed: schedule.isFixed,
      }
    );

    if (retry.ok) {
      const again = await confirmGroup(db, { ...g, slotIndexes: res.missing }, schedule.holdId, transactionCode);
      if (again.missing.length === 0) continue;
      stillMissing.push({ group: g, slots: again.missing });
    } else {
      stillMissing.push({ group: g, slots: res.missing, conflicts: retry.conflicts });
    }
  }

  if (stillMissing.length > 0) {
    // Khách ĐÃ TRẢ TIỀN mà không phục vụ được. Ghi lại và báo ra ngoài. Tuyệt
    // đối không nuốt — bản cũ để rơi vào catch chỉ ghi log.
    const exception = await recordPaymentException(db, {
      transactionCode,
      scheduleId: schedule.id,
      userName: schedule.userName,
      phone: schedule.phone,
      totalPrice: schedule.totalPrice,
      missing: stillMissing,
      reason: "paid_but_slots_unavailable",
    });

    // Đơn vẫn được đánh dấu booked (tiền đã về) nhưng gắn cờ cần xử lý tay.
    await schedules.updateOne(
      { id: schedule.id },
      {
        $set: {
          status: SCHEDULE_STATUS.BOOKED,
          needsManualReview: true,
          confirmedAt: new Date(),
          paymentInfo,
        },
        $unset: { holdExpiresAt: "" },
      }
    );

    return {
      success: false,
      code: "NEEDS_MANUAL_REVIEW",
      needsManualReview: true,
      error: "Đã nhận thanh toán nhưng một số ô không còn trống. Bộ phận hỗ trợ sẽ liên hệ ngay.",
      exception,
      scheduleId: schedule.id,
      schedule,
    };
  }

  await schedules.updateOne(
    { id: schedule.id },
    {
      $set: {
        status: SCHEDULE_STATUS.BOOKED,
        paymentInfo,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      },
      $unset: { holdExpiresAt: "" },
    }
  );

  return { success: true, scheduleId: schedule.id, transactionCode, schedule };
}
