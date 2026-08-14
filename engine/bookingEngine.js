import { ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";

import {
  SCHEDULE_STATUS,
  SERVER_HOLD_MS,
  SHORT_HOLD_MS,
  SWEEP_INTERVAL_MS,
} from "../utils/bookingConstants.js";
import {
  COURT_DAYS,
  SCHEDULES,
  assertIndexes,
  claimGroup,
  describeConflicts,
  extendHold,
  groupSlotsForClaim,
  readOccupied,
  releaseHold,
  sweepExpiredHolds,
  toBookingDate,
} from "../utils/courtDays.js";
import { confirmPaidOrder } from "../utils/confirmOrder.js";

/**
 * BOOKING ENGINE — lớp ĐƠN HÀNG.
 *
 * Toàn bộ thao tác ghi lên ô sân được uỷ cho utils/courtDays.js; ở đây chỉ có
 * vòng đời của một đơn (schedules) và saga cho đơn trải nhiều document.
 *
 * ── Khác gì bản cũ ────────────────────────────────────────────────────────
 * Bản cũ đọc/ghi theo đường `timeSlots.{"16:00"}.status`, một hình dạng dữ liệu
 * KHÔNG hề tồn tại trong DB này (document thật có khoá số "0".."21" ở cấp cao
 * nhất), nên `lockSlots` không khớp document nào và MỌI lần đặt đều thất bại.
 * Nó cũng phụ thuộc transaction (cần replica set), vứt bỏ giá trị trả về của
 * chính withTransaction nên transactionCode/scheduleId luôn undefined, tự sinh
 * một transactionCode khác với mã in trên QR, và cancelBooking không kiểm tra
 * status nên có thể đánh dấu huỷ một đơn đã thanh toán.
 *
 * Bản này không dùng transaction. Chống trùng dựa vào unique index +
 * single-document atomicity — xem utils/courtDays.js.
 */
class BookingEngine {
  /**
   * @param {import("mongodb").Db} mongoPool
   */
  constructor(mongoPool) {
    this.db = mongoPool;
    this.schedulesCollection = mongoPool.collection(SCHEDULES);
    this.courtDaysCollection = mongoPool.collection(COURT_DAYS);
    this.sweepTimer = null;
  }

  /**
   * Kiểm tra điều kiện phục vụ và khởi động sweeper. PHẢI được await TRƯỚC khi
   * server bắt đầu nhận request.
   *
   * Bản cũ gọi initIndexes() trong constructor mà không await, không catch:
   * server có thể nhận claim khi unique index chưa tồn tại (hai claim cùng lúc
   * đều insert được → hai document cho một ô → từ đó createIndex hỏng vĩnh
   * viễn), còn nếu build index lỗi thì tiến trình chết không dấu vết.
   */
  async start() {
    // Fail closed. Thiếu unique index nghĩa là không có gì chặn đặt trùng.
    await assertIndexes(this.db);
    this.startCleanupJob();
  }

  async stop() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /* ───────────────────────── Kiểm tra còn trống ─────────────────────────── */

  /**
   * Tra cứu tư vấn (advisory). KHÔNG dùng kết quả này để quyết định ghi — giữa
   * lúc đọc và lúc ghi ô có thể đã bị lấy. Quyết định duy nhất có giá trị là
   * kết quả của claimGroup.
   */
  async checkAvailability(requests) {
    const groups = groupSlotsForClaim(requests);
    const out = [];

    for (const g of groups) {
      const conflicts = await describeConflicts(this.db, g, "__none__");
      const taken = new Set(conflicts.map((c) => c.slotIndex));

      for (const slotIndex of g.slotIndexes) {
        const hit = conflicts.find((c) => c.slotIndex === slotIndex);
        out.push({
          facility: g.facility,
          courtId: g.courtId,
          date: g.date,
          slotIndex,
          available: !taken.has(slotIndex),
          reason: hit?.reason,
        });
      }
    }
    return out;
  }

  /* ──────────────────────────── Giữ sân ─────────────────────────────────── */

  /**
   * Giữ (hold) các ô của một đơn.
   *
   * Saga hai pha, không dùng transaction:
   *
   *  0. Ghi đơn ở trạng thái `pending` TRƯỚC. Bản cũ claim ô rồi mới tạo đơn,
   *     nên crash ở giữa để lại các hold trỏ tới một đơn không tồn tại.
   *  1. Claim từng nhóm theo THỨ TỰ CHUẨN với hạn NGẮN (90 giây). Thứ tự chuẩn
   *     ngăn hai đơn chồng lấn huỷ lẫn nhau vô hạn; hạn ngắn khiến một saga bị
   *     crash tự lành trong 90 giây thay vì chặn ô suốt 20 phút.
   *  2. Đủ mọi nhóm → gia hạn lên SERVER_HOLD_MS và chuyển đơn sang `wait`.
   *  3. Thất bại → nhả những gì đã lấy (best-effort; hạn ngắn là lưới an toàn).
   *
   * @param {Array<{facility,courtId,court,cluster,date,slotIndex}>} slots
   *   `date` phải là YYYY-MM-DD do SERVER tính — xem toBookingDate.
   */
  async holdSlots(slots, sessionId, userInfo) {
    if (!slots?.length) {
      return { success: false, error: "Đơn hàng không có ô nào" };
    }

    const holdId = uuidv4();
    const scheduleId = new ObjectId().toString();

    // Dùng ĐÚNG mã khách nhìn thấy trên QR. Bản cũ tự sinh `WSB${Date.now()}`
    // khác với mã client đã tạo và in lên QR, nên mã trên QR và mã lưu trong DB
    // không bao giờ khớp — webhook không tìm được đơn.
    const transactionCode = userInfo?.transactionCode;
    if (!transactionCode) {
      return { success: false, error: "Thiếu mã giao dịch" };
    }

    const groups = groupSlotsForClaim(slots);
    const shortExpiry = new Date(Date.now() + SHORT_HOLD_MS);
    const fullExpiry = new Date(Date.now() + SERVER_HOLD_MS);

    // Pha 0
    try {
      await this.schedulesCollection.insertOne({
        id: scheduleId,
        transactionCode,
        status: SCHEDULE_STATUS.PENDING,
        holdId,
        holdExpiresAt: shortExpiry,
        sessionId,
        timeSlots: slots,
        ...userInfo,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (err) {
      if (err?.code === 11000) {
        // Unique index trên transactionCode. Hai đơn cùng mã là lỗi nghiêm
        // trọng (tiền của người này confirm đơn của người kia) nên phải chặn.
        return { success: false, error: "Mã giao dịch bị trùng, vui lòng thử lại" };
      }
      throw err;
    }

    // Pha 1
    const claimed = [];
    for (const g of groups) {
      const res = await claimGroup(this.db, g, {
        holdId,
        holdExpiresAt: shortExpiry,
        scheduleId,
        transactionCode,
        bookedBy: { name: userInfo?.userName, phone: userInfo?.phone },
        isFixed: userInfo?.isFixed,
      });

      if (res.ok) {
        claimed.push(g);
        continue;
      }

      // Pha 3 — nhả phần đã lấy. Nếu bước này lỗi hoặc tiến trình chết, hạn
      // ngắn 90 giây vẫn dọn giúp, nên đây chỉ là tối ưu hoá.
      await releaseHold(this.db, holdId).catch(() => {});
      await this.schedulesCollection.updateOne(
        { id: scheduleId },
        { $set: { status: SCHEDULE_STATUS.CANCELLED, cancelReason: "slot_taken", updatedAt: new Date() } }
      );

      return {
        success: false,
        error: "Ô giờ đã có người đặt",
        conflicts: res.conflicts.map((c) => c.label),
        conflictDetails: res.conflicts,
      };
    }

    // Pha 2
    await extendHold(this.db, holdId, fullExpiry);
    await this.schedulesCollection.updateOne(
      { id: scheduleId, status: SCHEDULE_STATUS.PENDING },
      { $set: { status: SCHEDULE_STATUS.WAIT, holdExpiresAt: fullExpiry, updatedAt: new Date() } }
    );

    return {
      success: true,
      holdId,
      lockId: holdId,          // tên cũ, giữ để client hiện tại không phải đổi
      scheduleId,
      schedulesId: scheduleId,
      transactionCode,
      holdExpiresAt: fullExpiry,
      groups: claimed,
    };
  }

  /* ──────────────────────────── Xác nhận ────────────────────────────────── */

  /**
   * Xác nhận đơn sau khi tiền về.
   *
   * Uỷ toàn bộ cho utils/confirmOrder.js để socket server và các Next API route
   * (/api/booking, /api/verify-status) dùng CHUNG một bản. Trước đây tồn tại ba
   * bản confirm với ba precondition khác nhau và chúng đã trôi lệch nhau.
   */
  async confirmBooking(transactionCode, paymentInfo = {}) {
    return confirmPaidOrder(this.db, transactionCode, paymentInfo);
  }

  /* ───────────────────────────── Huỷ ────────────────────────────────────── */

  /**
   * Huỷ một đơn đang giữ.
   *
   * Chỉ huỷ được đơn ở trạng thái pending/wait. Bản cũ tìm đơn mà KHÔNG lọc
   * status rồi đặt "cancelled" vô điều kiện, nên một đơn đã thanh toán vẫn bị
   * ghi là đã huỷ trong khi ô vẫn booked.
   */
  async cancelBooking({ holdId, scheduleId, transactionCode }, reason = "User cancelled") {
    const query = holdId
      ? { holdId }
      : scheduleId
        ? { id: scheduleId }
        : { transactionCode };

    const schedule = await this.schedulesCollection.findOne(query);
    if (!schedule) return { success: false, error: "Không tìm thấy đơn hàng" };

    if (schedule.status === SCHEDULE_STATUS.BOOKED) {
      return { success: false, error: "Đơn hàng đã thanh toán, không thể tự huỷ" };
    }
    if (schedule.status === SCHEDULE_STATUS.CANCELLED || schedule.status === SCHEDULE_STATUS.EXPIRED) {
      return { success: true, replay: true, releasedSlots: schedule.timeSlots || [] };
    }

    const { released } = await releaseHold(this.db, schedule.holdId);

    await this.schedulesCollection.updateOne(
      { id: schedule.id, status: { $in: [SCHEDULE_STATUS.PENDING, SCHEDULE_STATUS.WAIT] } },
      { $set: { status: SCHEDULE_STATUS.CANCELLED, cancelReason: reason, cancelledAt: new Date() } }
    );

    return { success: true, released, releasedSlots: schedule.timeSlots || [] };
  }

  /* ──────────────────────────── Gia hạn ─────────────────────────────────── */

  async extendLock(holdId, extraMs = 5 * 60 * 1000) {
    const schedule = await this.schedulesCollection.findOne({
      holdId,
      status: { $in: [SCHEDULE_STATUS.PENDING, SCHEDULE_STATUS.WAIT] },
    });
    if (!schedule) return { success: false, error: "Không tìm thấy đơn đang giữ" };

    // Không gia hạn một hold đã chết: nó có thể đã được người khác chiếm hợp lệ.
    if (schedule.holdExpiresAt && schedule.holdExpiresAt.getTime() < Date.now()) {
      return { success: false, error: "Đã hết thời gian giữ sân" };
    }

    const newExpiry = new Date(Date.now() + extraMs);
    await extendHold(this.db, holdId, newExpiry);
    await this.schedulesCollection.updateOne(
      { id: schedule.id },
      { $set: { holdExpiresAt: newExpiry, updatedAt: new Date() } }
    );
    return { success: true, newExpiry };
  }

  /* ──────────────────────────── Đọc ─────────────────────────────────────── */

  async listOccupied({ facilities, dates, includeBookedBy }) {
    return readOccupied(this.db, { facilities, dates, includeBookedBy });
  }

  /* ─────────────────────────── Sweeper ──────────────────────────────────── */

  /**
   * Chỉ là VỆ SINH, không phải tính đúng đắn: claim đã coi hold hết hạn là rảnh
   * và đường đọc cũng lọc chúng ra. Sweeper chỉ để dọn rác cho gọn.
   */
  startCleanupJob() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(async () => {
      try {
        await sweepExpiredHolds(this.db);
      } catch (err) {
        console.error("Sweep error:", err.message);
      }
    }, SWEEP_INTERVAL_MS);
    // Không giữ tiến trình sống chỉ vì cái timer này.
    this.sweepTimer.unref?.();
  }
}

export default BookingEngine;
export { toBookingDate };
