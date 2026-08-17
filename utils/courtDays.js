import timeSlotsByCluster from "../data/timeSlots.json" with { type: "json" };
import {
  BOOKING_TIMEZONE,
  SCHEDULE_STATUS,
  SLOTS_PER_CLUSTER,
  SLOT_STATUS,
} from "./bookingConstants.js";

/**
 * TẦNG DỮ LIỆU CHỐNG ĐẶT TRÙNG — collection `court_days`.
 *
 * Đây là module DUY NHẤT được phép ghi vào ô sân. Trước đây có ba bản confirm
 * khác nhau với ba precondition khác nhau (bookingEngine.confirmBooking,
 * updateTimeSlotsStatus.updateTimeSlot, verify-status bulkWrite) và chúng đã
 * trôi lệch nhau. Socket server lẫn Next API route đều phải đi qua đây.
 *
 * ── Mô hình lưu trữ: SPARSE ROW ───────────────────────────────────────────
 * Một document cho mỗi (facility, courtId, date), tạo lần đầu tiên có người
 * đặt. Bên trong `slots` CHỈ chứa những ô đã bị chiếm — ô trống không tồn tại.
 * Ngày không ai đặt thì không có document nào.
 *
 *   { facility, courtId, court, timeClusterId,
 *     date: "2026-08-14",
 *     slots: { "8": { status, holdId, holdExpiresAt, ... } },
 *     version, createdAt, updatedAt }
 *
 * from/to/hour KHÔNG được lưu — suy ra từ data/timeSlots.json theo
 * (timeClusterId, slotIndex). Đó là phần lớn khoản giảm dung lượng.
 *
 * ── Vì sao chống trùng được mà không cần transaction ──────────────────────
 * Đơn phổ biến nhất là N giờ liền nhau, cùng một sân, cùng một ngày → tất cả
 * nằm trong CÙNG MỘT document → một `updateOne` với N điều kiện là atomic tuyệt
 * đối theo bảo đảm single-document của MongoDB.
 *
 * Khi ≥1 điều kiện sai, filter không khớp, `upsert: true` chuyển sang INSERT, và
 * unique index {facility, courtId, date} chặn lại bằng E11000. Tức E11000 chính
 * là tín hiệu "có ô đã bị lấy".
 *
 * Toàn bộ hành vi trên đã được kiểm chứng trên mongod 5.0 (xem __tests__/
 * courtDays.test.js): 50 claim đồng thời cùng một ô cho ra đúng 1 thắng, 49
 * E11000, không lỗi nào khác; và khi 1 trong nhiều ô bị chiếm thì KHÔNG ô nào
 * được ghi.
 */

export const COURT_DAYS = "court_days";
export const SCHEDULES = "schedules";
export const PAYMENT_EXCEPTIONS = "payment_exceptions";

/* ────────────────────────────── Ngày tháng ────────────────────────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BOOKING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Quy đổi một thời điểm bất kỳ về chuỗi ngày chuẩn "YYYY-MM-DD" theo giờ VN.
 *
 * Đây phải là con đường DUY NHẤT sinh ra `date`, và nó phải chạy ở SERVER.
 * Trước đây browser gửi lên `selectedDate.toDateString()` ở UTC+7 trong khi
 * server sinh dữ liệu ở UTC (container không set TZ), nên cùng một đêm cho ra
 * hai chuỗi ngày khác nhau. Với schema cũ đó chỉ là một update không khớp; với
 * upsert nó tạo ra HAI document hợp lệ cho cùng một ô sân.
 *
 * @param {Date|string|number} instant
 * @returns {string} "YYYY-MM-DD"
 */
export function toBookingDate(instant) {
  if (typeof instant === "string" && DATE_RE.test(instant)) return instant;

  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`toBookingDate: giá trị ngày không hợp lệ: ${instant}`);
  }
  // en-CA cho ra đúng định dạng YYYY-MM-DD.
  return dateFormatter.format(d);
}

/** Ném lỗi nếu `date` không phải chuỗi ngày chuẩn. Dùng ở mọi lối vào. */
export function assertBookingDate(date) {
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    throw new Error(`Ngày phải có dạng YYYY-MM-DD, nhận được: ${JSON.stringify(date)}`);
  }
  return date;
}

/* ─────────────────────────────── Ô / slot ─────────────────────────────── */

/**
 * Suy ra thông tin giờ của một ô từ data/timeSlots.json.
 *
 * BẤT BIẾN: chỉ số ô KHÔNG dùng chung được giữa các cluster. 4 cluster lệch nhau
 * 10 phút — ô số 5 là "5:40-6:40" ở cluster1 nhưng "6:10-7:10" ở cluster4. Vì
 * vậy mọi nơi truyền chỉ số ô đều PHẢI kèm cluster.
 *
 * BẤT BIẾN: ô vắt qua nửa đêm ("23:10-0:10" … "23:40-0:40") luôn thuộc ngày BẮT
 * ĐẦU — cả 4 entry trong timeSlots.json đều có isNextDay:false. Đừng "sửa" điều
 * này thành ngày hôm sau: nó sẽ tạo ra chồng lấn mà unique index không nhìn thấy.
 */
export function getSlotTime(cluster, slotIndex) {
  const list = timeSlotsByCluster[cluster];
  if (!list) throw new Error(`Cluster không tồn tại: ${cluster}`);

  const entry = list[slotIndex];
  if (!entry) throw new Error(`Ô ${slotIndex} không tồn tại trong ${cluster}`);

  const [from, to] = entry.time.split("-");
  return { from: from.trim(), to: to.trim(), hour: 1, subtitle: entry.subtitle || "" };
}

/** Đổi giờ bắt đầu ("9:05") thành chỉ số ô trong cluster. -1 nếu không có. */
export function slotIndexFromTime(cluster, from) {
  const list = timeSlotsByCluster[cluster];
  if (!list) return -1;
  return list.findIndex((e) => e.time.split("-")[0].trim() === String(from).trim());
}

/** Chuẩn hoá và kiểm tra chỉ số ô. Ném lỗi nếu ngoài phạm vi. */
export function assertSlotIndex(slotIndex) {
  const i = Number(slotIndex);
  if (!Number.isInteger(i) || i < 0 || i >= SLOTS_PER_CLUSTER) {
    throw new Error(`Chỉ số ô phải là số nguyên 0..${SLOTS_PER_CLUSTER - 1}, nhận được: ${slotIndex}`);
  }
  return i;
}

/* ────────────────────────── Index & validator ─────────────────────────── */

/**
 * JSON-Schema validator cho `court_days`.
 *
 * Đây là thứ DUY NHẤT biến một lần ghi sai key từ *âm thầm* thành *lỗi ghi*.
 * Với `upsert`, một `date` sai định dạng hay `slotIndex` sai kiểu sẽ tạo ra một
 * document mới không đụng unique index — tức là bán cùng một ô sân hai lần mà
 * không có lỗi nào ở đâu cả. Ràng buộc `holdExpiresAt` phải là bsonType "date"
 * cũng chặn được ca ISO-string echo về từ client (socket.io serialize JSON nên
 * Date gửi ra browser thành chuỗi).
 */
export const COURT_DAYS_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: ["facility", "courtId", "date", "timeClusterId"],
    properties: {
      facility: { bsonType: "string", minLength: 1 },
      courtId: { bsonType: "string", minLength: 1 },
      court: { bsonType: "string" },
      timeClusterId: { bsonType: "string", minLength: 1 },
      date: { bsonType: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
      version: { bsonType: ["int", "long", "double"] },
      slots: {
        bsonType: "object",
        // Khoá phải là số 0..21; giá trị phải là ô hợp lệ.
        patternProperties: {
          "^([0-9]|1[0-9]|2[01])$": {
            bsonType: "object",
            required: ["status"],
            properties: {
              status: { enum: Object.values(SLOT_STATUS) },
              holdExpiresAt: { bsonType: "date" },
              holdId: { bsonType: "string" },
              scheduleId: { bsonType: "string" },
              transactionCode: { bsonType: "string" },
              isFixed: { bsonType: "bool" },
              bookedBy: {
                bsonType: "object",
                properties: {
                  name: { bsonType: "string" },
                  phone: { bsonType: "string" },
                },
              },
            },
          },
        },
        additionalProperties: false,
      },
    },
  },
};

export const UNIQUE_INDEX_NAME = "uniq_facility_court_date";

/**
 * Tạo index + validator. Phải được AWAIT, và nên chạy từ script migration chứ
 * không phải từ constructor.
 *
 * Bản cũ gọi `this.initIndexes()` trong constructor của BookingEngine mà không
 * await, không catch: có một cửa sổ server nhận claim khi unique index chưa tồn
 * tại (hai claim trong cửa sổ đó đều insert được → hai doc cho một ô, và từ đó
 * createIndex thất bại vĩnh viễn), còn nếu build index lỗi thì Node ≥15 kết
 * thúc tiến trình — crash-loop không để lại dấu vết nào trong log.
 */
export async function ensureIndexes(db) {
  const courtDays = db.collection(COURT_DAYS);

  // Nền tảng của toàn bộ tính đúng đắn.
  await courtDays.createIndex(
    { facility: 1, courtId: 1, date: 1 },
    { unique: true, name: UNIQUE_INDEX_NAME }
  );
  // Cho schedules:list.
  await courtDays.createIndex({ date: 1, facility: 1 }, { name: "date_facility" });

  const schedules = db.collection(SCHEDULES);
  await schedules.createIndex(
    { transactionCode: 1 },
    { unique: true, name: "uniq_transaction_code" }
  );
  // Cho sweeper quét hold hết hạn.
  await schedules.createIndex({ status: 1, holdExpiresAt: 1 }, { name: "status_hold_expiry" });

  await db.command({
    collMod: COURT_DAYS,
    validator: COURT_DAYS_VALIDATOR,
    // "warn" sẽ chỉ ghi log rồi vẫn cho ghi — vô dụng ở đây, vì đúng cái ta cần
    // là chặn lần ghi hỏng lại.
    validationLevel: "strict",
    validationAction: "error",
  });
}

/**
 * Kiểm tra ở lúc khởi động rằng unique index thực sự tồn tại.
 * Không có thì TỪ CHỐI phục vụ — fail closed, vì thiếu nó là hệ thống đang bán
 * cùng một ô sân cho nhiều người mà không báo lỗi gì.
 */
export async function assertIndexes(db) {
  let indexes;
  try {
    indexes = await db.collection(COURT_DAYS).listIndexes().toArray();
  } catch (err) {
    // NamespaceNotFound: collection chưa tồn tại (DB mới, hoặc chưa migrate).
    // Không có collection thì đương nhiên không có index — rơi xuống cùng một
    // lỗi fail-closed có hướng dẫn, thay vì ném "ns does not exist" trần trụi
    // ra ngoài khiến không ai biết phải chạy gì.
    if (err?.code !== 26) throw err;
    indexes = [];
  }

  const unique = indexes.find(
    (ix) => ix.name === UNIQUE_INDEX_NAME && ix.unique === true
  );
  if (!unique) {
    throw new Error(
      `Thiếu unique index "${UNIQUE_INDEX_NAME}" trên ${COURT_DAYS}` +
      (indexes.length === 0 ? ` (collection chưa tồn tại)` : ``) + `. ` +
      `Không có nó thì KHÔNG có gì chặn đặt trùng sân. ` +
      `Chạy "npm run migrate:sparse" để xem báo cáo, rồi ` +
      `"npm run migrate:sparse:apply" để tạo index + validator.`
    );
  }
}

/* ──────────────────────────────── Claim ───────────────────────────────── */

/** Lỗi khoá trùng của MongoDB. Ở đây nó nghĩa là "ô đã bị lấy". */
export function isDuplicateKeyError(err) {
  return err?.code === 11000;
}

/**
 * Điều kiện "ô này đang RẢNH và ta được phép lấy".
 *
 * Bốn nhánh, tất cả đều load-bearing — đừng rút gọn:
 *
 *  1. Ô không tồn tại        → trống (mô hình sparse: vắng mặt = trống).
 *  2. Hold đã hết hạn        → chiếm lại được.
 *  3. holdId là của chính ta → claim lại chính mình phải idempotent, nếu không
 *                              một lần double-submit hay socket reconnect sẽ tự
 *                              báo "ô đã bị lấy" về chính ô của mình.
 *  4. holdExpiresAt KHÔNG phải kiểu date → phục hồi ô nhiễm độc.
 *
 * Nhánh 4 là bắt buộc vì `{$lt: new Date()}` KHÔNG khớp document có
 * holdExpiresAt thiếu / null / kiểu chuỗi (MongoDB so sánh có phân vùng kiểu —
 * đã kiểm chứng trong test). Không có nhánh này, một ô "wait" mang expiry sai
 * kiểu là ô CHẾT VĨNH VIỄN: không đặt được, không chiếm lại được, sweeper không
 * thấy, và nhìn từ ngoài giống hệt một booking hợp lệ.
 */
function slotIsClaimable(slotIndex, holdId, now) {
  const p = `slots.${slotIndex}`;
  return {
    $or: [
      { [p]: { $exists: false } },
      { [`${p}.status`]: SLOT_STATUS.WAIT, [`${p}.holdExpiresAt`]: { $lt: now } },
      { [`${p}.holdId`]: holdId },
      { [`${p}.status`]: SLOT_STATUS.WAIT, [`${p}.holdExpiresAt`]: { $not: { $type: "date" } } },
    ],
  };
}

/**
 * Giữ (hold) một nhóm ô TRÊN CÙNG MỘT (facility, courtId, date).
 *
 * Toàn bộ nhóm nằm trong một document nên thao tác này là atomic: hoặc lấy được
 * cả nhóm, hoặc không ô nào bị chạm tới.
 *
 * @param {import("mongodb").Db} db
 * @param {{facility:string, courtId:string, court?:string, timeClusterId:string,
 *          date:string, slotIndexes:number[]}} group
 * @param {{holdId:string, holdExpiresAt:Date, scheduleId:string,
 *          transactionCode:string, bookedBy?:{name?:string,phone?:string},
 *          isFixed?:boolean}} ctx
 * @returns {Promise<{ok:true} | {ok:false, conflicts:Array}>}
 */
export async function claimGroup(db, group, ctx) {
  const { facility, courtId, court, timeClusterId, date, slotIndexes } = group;
  const { holdId, holdExpiresAt, scheduleId, transactionCode, bookedBy, isFixed } = ctx;

  assertBookingDate(date);
  if (!(holdExpiresAt instanceof Date)) {
    // Chặn ngay tại đây thay vì để một chuỗi ISO lọt xuống DB và tạo ô chết.
    throw new Error("holdExpiresAt phải là Date do server tạo, không nhận từ client");
  }
  const indexes = slotIndexes.map(assertSlotIndex);
  if (indexes.length === 0) throw new Error("claimGroup: danh sách ô rỗng");

  const now = new Date();
  const col = db.collection(COURT_DAYS);

  const filter = {
    facility,
    courtId,
    date,
    $and: indexes.map((i) => slotIsClaimable(i, holdId, now)),
  };

  const $set = { updatedAt: now };
  for (const i of indexes) {
    // Chỉ những field do SERVER dựng. Không bao giờ spread object từ client:
    // đó chính là đường mà một holdExpiresAt kiểu chuỗi lọt được vào DB.
    $set[`slots.${i}`] = {
      status: SLOT_STATUS.WAIT,
      holdId,
      holdExpiresAt,
      scheduleId,
      transactionCode,
      isFixed: Boolean(isFixed),
      bookedBy: {
        name: String(bookedBy?.name ?? ""),
        phone: String(bookedBy?.phone ?? ""),
      },
    };
  }

  try {
    await col.updateOne(
      filter,
      {
        $set,
        // BẮT BUỘC. Không dựa vào việc MongoDB tự suy identity từ query: filter
        // có $and/$or nên hành vi suy diễn khó đoán, và nếu suy sai thì document
        // mới mang khoá null, unique index thành vô dụng.
        $setOnInsert: {
          facility,
          courtId,
          court: court || "",
          timeClusterId,
          date,
          createdAt: now,
        },
        $inc: { version: 1 },
      },
      { upsert: true }
    );
    return { ok: true };
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;

    // E11000 = document đã tồn tại nhưng ≥1 ô không claim được.
    //
    // KHÔNG retry. Retry biến một lần từ chối đúng thành ăn cắp ở ranh giới:
    // U1 giữ ô tới t+20m, U2 bị từ chối ở t+19m59s, retry ở t+20m01s thì khớp
    // nhánh "hết hạn" và chiếm mất ô mà U1 đang thanh toán.
    const conflicts = await describeConflicts(db, group, holdId);
    return { ok: false, conflicts };
  }
}

/**
 * Đọc lại document để nói CHÍNH XÁC ô nào bị chiếm và vì sao.
 * "Ô giờ lỗi, gọi hotline" không cho khách biết phải làm gì; "Sân 3 19:00 đã có
 * người đặt" thì có.
 */
export async function describeConflicts(db, group, holdId) {
  const { facility, courtId, date, slotIndexes, timeClusterId } = group;
  const doc = await db.collection(COURT_DAYS).findOne({ facility, courtId, date });
  if (!doc) return [];

  const now = Date.now();
  const conflicts = [];

  for (const raw of slotIndexes) {
    const i = assertSlotIndex(raw);
    const slot = doc.slots?.[String(i)];
    if (!slot) continue;
    if (slot.holdId === holdId) continue;

    const expiry = slot.holdExpiresAt instanceof Date ? slot.holdExpiresAt.getTime() : null;
    const isLiveHold = slot.status === SLOT_STATUS.WAIT && expiry !== null && expiry > now;
    const isTaken =
      slot.status === SLOT_STATUS.BOOKED ||
      slot.status === SLOT_STATUS.FIXED ||
      slot.status === SLOT_STATUS.PASS;

    // Hold đã hết hạn hoặc nhiễm độc thì không phải xung đột — nhánh claim đã
    // xử lý được. Chỉ báo cái thực sự chặn.
    if (!isLiveHold && !isTaken) continue;

    let time = "";
    try {
      time = getSlotTime(timeClusterId || doc.timeClusterId, i).from;
    } catch {
      time = `ô ${i}`;
    }

    conflicts.push({
      facility,
      courtId,
      court: doc.court || courtId,
      date,
      slotIndex: i,
      time,
      status: slot.status,
      reason: isTaken ? "Đã có người đặt" : "Đang được giữ bởi khách khác",
      label: `${doc.court || courtId} ${time}`,
    });
  }

  return conflicts;
}

/**
 * Gia hạn mọi ô đang giữ bởi `holdId` lên hạn mới.
 *
 * Dùng ở pha 2 của đơn nhiều document: pha 1 giữ ngắn (SHORT_HOLD_MS), giữ đủ
 * mọi document rồi mới gia hạn lên hạn đầy đủ. Nhờ vậy một saga bị crash giữa
 * chừng tự lành trong 90 giây thay vì chặn ô suốt 20 phút, và rollback trở
 * thành tối ưu hoá chứ không phải điều kiện đúng đắn.
 */
export async function extendHold(db, holdId, newExpiry) {
  if (!(newExpiry instanceof Date)) {
    throw new Error("newExpiry phải là Date");
  }
  const col = db.collection(COURT_DAYS);
  const docs = await col.find({ "slots": { $exists: true } }, {
    projection: { facility: 1, courtId: 1, date: 1, slots: 1 },
  }).toArray();

  let extended = 0;
  for (const doc of docs) {
    const mine = Object.entries(doc.slots || {}).filter(
      ([, s]) => s.holdId === holdId && s.status === SLOT_STATUS.WAIT
    );
    if (mine.length === 0) continue;

    const $set = { updatedAt: new Date() };
    for (const [i] of mine) $set[`slots.${i}.holdExpiresAt`] = newExpiry;

    const res = await col.updateOne({ _id: doc._id }, { $set, $inc: { version: 1 } });
    extended += res.modifiedCount ? mine.length : 0;
  }
  return { extended };
}

/* ─────────────────────────── Thao tác admin ───────────────────────────── */

/**
 * Admin đặt trực tiếp một nhóm ô sang trạng thái cuối (booked / fixed / pass).
 *
 * Dùng CHUNG điều kiện "ô đang rảnh" với người dùng thường, nên admin KHÔNG
 * lặng lẽ chiếm được hold của khách đang thanh toán. Bản cũ whitelist cả
 * "locked": admin bấm một cái là khách đang trả tiền mất sân, rồi confirm của
 * khách đó no-op và tiền đã đi.
 *
 * Ô ở trạng thái cuối KHÔNG BAO GIỜ có holdExpiresAt — nếu có, sweeper sẽ nhả nó.
 */
export async function adminClaimGroup(db, group, { status, bookedBy, isFixed, actor }) {
  const { facility, courtId, court, timeClusterId, date, slotIndexes } = group;
  assertBookingDate(date);

  const terminal = [SLOT_STATUS.BOOKED, SLOT_STATUS.FIXED, SLOT_STATUS.PASS];
  if (!terminal.includes(status)) {
    throw new Error(`adminClaimGroup chỉ nhận ${terminal.join("/")}, nhận được: ${status}`);
  }

  const indexes = slotIndexes.map(assertSlotIndex);
  const now = new Date();
  const col = db.collection(COURT_DAYS);

  const filter = {
    facility,
    courtId,
    date,
    // Cùng điều kiện rảnh như người dùng thường; "__admin__" không khớp holdId
    // nào nên nhánh idempotent không kích hoạt.
    $and: indexes.map((i) => slotIsClaimable(i, "__admin__", now)),
  };

  const $set = { updatedAt: now };
  for (const i of indexes) {
    $set[`slots.${i}`] = {
      status,
      isFixed: Boolean(isFixed),
      bookedBy: {
        name: String(bookedBy?.name ?? ""),
        phone: String(bookedBy?.phone ?? ""),
      },
      setByAdmin: String(actor || "admin"),
      setAt: now,
    };
  }

  try {
    await col.updateOne(
      filter,
      {
        $set,
        $setOnInsert: {
          facility, courtId, court: court || "", timeClusterId, date, createdAt: now,
        },
        $inc: { version: 1 },
      },
      { upsert: true }
    );
    return { ok: true };
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    return { ok: false, conflicts: await describeConflicts(db, group, "__admin__") };
  }
}

/**
 * Admin nhả ô (xoá khỏi `slots`).
 *
 * Ghi lại vào `slot_events` TRƯỚC khi xoá: trong mô hình sparse, nhả ô nghĩa là
 * document biến mất, nên nếu không ghi nhật ký thì không còn dấu vết nào để đối
 * chiếu khi có tranh chấp.
 */
export async function adminReleaseGroup(db, group, { actor, reason } = {}) {
  const { facility, courtId, date, slotIndexes } = group;
  assertBookingDate(date);

  const col = db.collection(COURT_DAYS);
  const doc = await col.findOne({ facility, courtId, date });
  if (!doc) return { released: 0 };

  const indexes = slotIndexes.map(assertSlotIndex);
  const removed = [];
  const $unset = {};

  for (const i of indexes) {
    const slot = doc.slots?.[String(i)];
    if (!slot) continue;
    removed.push({ slotIndex: i, ...slot });
    $unset[`slots.${i}`] = "";
  }
  if (removed.length === 0) return { released: 0 };

  await db.collection("slot_events").insertOne({
    type: "admin_release",
    facility, courtId, date,
    slots: removed,
    actor: actor || "admin",
    reason: reason || "",
    createdAt: new Date(),
  });

  await col.updateOne(
    { _id: doc._id },
    { $unset, $set: { updatedAt: new Date() }, $inc: { version: 1 } }
  );

  // Ngày không còn ô nào bị chiếm thì document không nên tồn tại.
  await col.deleteMany({ $or: [{ slots: {} }, { slots: { $exists: false } }] });

  return { released: removed.length, removed };
}

/* ─────────────────────────────── Confirm ──────────────────────────────── */

/**
 * Xác nhận (đã thanh toán) mọi ô đang giữ bởi `holdId` trong một nhóm.
 *
 * `$set` và `$unset` nằm trong CÙNG MỘT thao tác, nên trạng thái nửa vời — đã
 * booked mà còn holdExpiresAt (sweeper sẽ nhả một booking đã trả tiền), hoặc
 * mất hold mà chưa booked (ô chết) — là không thể xảy ra.
 *
 * @returns {Promise<{confirmed:number, missing:number[]}>} `missing` là các ô
 *   không confirm được: hoặc đã confirm từ trước (replay), hoặc đã mất về tay
 *   người khác. Người gọi PHẢI xử lý, không được nuốt.
 */
export async function confirmGroup(db, group, holdId, transactionCode) {
  const { facility, courtId, date, slotIndexes } = group;
  assertBookingDate(date);

  const col = db.collection(COURT_DAYS);
  const now = new Date();
  const confirmedIdx = [];
  const missing = [];

  for (const raw of slotIndexes) {
    const i = assertSlotIndex(raw);
    const p = `slots.${i}`;

    const res = await col.updateOne(
      { facility, courtId, date, [`${p}.holdId`]: holdId },
      {
        $set: {
          [`${p}.status`]: SLOT_STATUS.BOOKED,
          [`${p}.transactionCode`]: transactionCode,
          [`${p}.confirmedAt`]: now,
          updatedAt: now,
        },
        // Bỏ hẳn dấu vết hold. Một ô "booked" mà còn holdExpiresAt sẽ bị sweeper
        // nhả ra dù khách đã trả tiền.
        $unset: { [`${p}.holdExpiresAt`]: "", [`${p}.holdId`]: "" },
        $inc: { version: 1 },
      }
    );

    if (res.matchedCount > 0) {
      confirmedIdx.push(i);
      continue;
    }

    // Không khớp: kiểm tra xem có phải đã confirm rồi bằng chính mã này không.
    // Webhook ngân hàng gửi lại và listener balanceUpdated đều nằm ngoài tầm
    // kiểm soát, nên confirm BẮT BUỘC phải idempotent.
    const already = await col.findOne({
      facility, courtId, date,
      [`${p}.status`]: SLOT_STATUS.BOOKED,
      [`${p}.transactionCode`]: transactionCode,
    });
    if (already) confirmedIdx.push(i);
    else missing.push(i);
  }

  return { confirmed: confirmedIdx.length, confirmedIdx, missing };
}

/**
 * Ghi nhận một đơn ĐÃ THANH TOÁN mà không phục vụ được, và trả về bản ghi để
 * người gọi cảnh báo cho người thật.
 *
 * Bản cũ nuốt trọn trường hợp này trong một `catch` chỉ ghi log
 * (utils/updateTimeSlotsStatus.js) — trong app.log có 32 dòng "Order not paid
 * yet" và 139 dòng "Đơn hàng của bạn đã bị xoá", mỗi dòng là một khách đã
 * chuyển tiền mà ô không được ghi, và không ai được báo.
 */
export async function recordPaymentException(db, payload) {
  const doc = {
    ...payload,
    createdAt: new Date(),
    resolved: false,
  };
  await db.collection(PAYMENT_EXCEPTIONS).insertOne(doc);
  return doc;
}

/* ─────────────────────────────── Release ──────────────────────────────── */

/**
 * Nhả mọi ô đang giữ bởi `holdId`.
 *
 * Trong mô hình sparse, "nhả" nghĩa là XOÁ khoá ô khỏi `slots` — đó chính là lý
 * do ô trống không tốn dung lượng. Chỉ xoá ô mang đúng holdId này và vẫn đang ở
 * trạng thái wait, nên không bao giờ đụng vào booking đã thanh toán.
 */
export async function releaseHold(db, holdId) {
  const col = db.collection(COURT_DAYS);
  const docs = await col
    .find({}, { projection: { slots: 1 } })
    .toArray();

  let released = 0;
  for (const doc of docs) {
    const mine = Object.entries(doc.slots || {}).filter(
      ([, s]) => s.holdId === holdId && s.status === SLOT_STATUS.WAIT
    );
    if (mine.length === 0) continue;

    const $unset = {};
    for (const [i] of mine) $unset[`slots.${i}`] = "";

    const res = await col.updateOne(
      { _id: doc._id },
      { $unset, $set: { updatedAt: new Date() }, $inc: { version: 1 } }
    );
    if (res.modifiedCount) released += mine.length;
  }

  // Dọn document rỗng: ngày không còn ô nào bị chiếm thì không nên tồn tại.
  await col.deleteMany({ $or: [{ slots: {} }, { slots: { $exists: false } }] });

  return { released };
}

/**
 * Sweeper: nhả các hold đã hết hạn.
 *
 * ĐÂY LÀ VỆ SINH, KHÔNG PHẢI TÍNH ĐÚNG ĐẮN. Tính đúng đắn nằm ở chỗ claim đã coi
 * hold hết hạn là rảnh (nhánh 2 của slotIsClaimable) và đường đọc lọc hold hết
 * hạn ra. Đừng bỏ bộ lọc ở đường đọc với lý do "sweeper lo rồi" — sweeper có thể
 * chậm, có thể chết, và không chạy khi tiến trình vừa restart.
 *
 * Chạy theo từng schedule, không gộp tất cả vào một thao tác lớn.
 */
export async function sweepExpiredHolds(db, now = new Date()) {
  const schedules = db.collection(SCHEDULES);

  const expired = await schedules
    .find(
      { status: SCHEDULE_STATUS.WAIT, holdExpiresAt: { $lt: now } },
      { projection: { id: 1, holdId: 1, transactionCode: 1 } }
    )
    .limit(200)
    .toArray();

  let releasedSlots = 0;
  for (const sched of expired) {
    if (!sched.holdId) continue;
    const { released } = await releaseHold(db, sched.holdId);
    releasedSlots += released;

    await schedules.updateOne(
      { id: sched.id, status: SCHEDULE_STATUS.WAIT },
      { $set: { status: SCHEDULE_STATUS.EXPIRED, expiredAt: new Date() } }
    );
  }

  // Đơn "pending" bị bỏ dở (crash giữa saga) cũng phải dọn.
  await schedules.updateMany(
    {
      status: SCHEDULE_STATUS.PENDING,
      createdAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
    { $set: { status: SCHEDULE_STATUS.EXPIRED, expiredAt: new Date() } }
  );

  return { schedules: expired.length, releasedSlots };
}

/* ──────────────────────────────── Đọc ─────────────────────────────────── */

/**
 * Đọc các ô ĐANG bị chiếm cho một tập chi nhánh × ngày.
 *
 * Trả về dạng phẳng, mỗi phần tử là một ô — không trả document nguyên khối. Với
 * mô hình sparse, ngày không ai đặt đóng góp 0 byte.
 *
 * @param {object} opts
 * @param {boolean} opts.includeBookedBy CHỈ true cho admin đã xác thực. Trước
 *   đây `schedules:list` trả nguyên document nên mọi khách vô danh nhận được
 *   tên và số điện thoại của mọi khách khác.
 */
export async function readOccupied(db, { facilities, dates, includeBookedBy = false }) {
  if (!facilities?.length || !dates?.length) return [];

  const normalizedDates = dates.map(assertBookingDate);
  const now = new Date();

  const projection = {
    _id: 0,
    facility: 1,
    courtId: 1,
    court: 1,
    timeClusterId: 1,
    date: 1,
    slots: 1,
  };

  const docs = await db
    .collection(COURT_DAYS)
    .find({ facility: { $in: facilities }, date: { $in: normalizedDates } }, { projection })
    .toArray();

  const out = [];
  for (const doc of docs) {
    for (const [key, slot] of Object.entries(doc.slots || {})) {
      // Hold hết hạn được coi như TRỐNG kể cả khi sweeper chưa chạy tới. Không
      // có bộ lọc này, một ô bị bỏ dở sẽ hiện "đã đặt" cho tới lượt quét sau.
      if (slot.status === SLOT_STATUS.WAIT) {
        const expiry = slot.holdExpiresAt instanceof Date ? slot.holdExpiresAt.getTime() : 0;
        if (expiry <= now.getTime()) continue;
      }

      const cell = {
        facility: doc.facility,
        courtId: doc.courtId,
        court: doc.court,
        cluster: doc.timeClusterId,
        date: doc.date,
        slotIndex: Number(key),
        status: slot.status,
        isFixed: Boolean(slot.isFixed),
      };
      if (includeBookedBy) cell.bookedBy = slot.bookedBy || { name: "", phone: "" };
      out.push(cell);
    }
  }

  return out;
}

/**
 * Gom một danh sách ô của đơn hàng thành các nhóm theo (facility, courtId, date),
 * SẮP XẾP THEO THỨ TỰ CHUẨN.
 *
 * Thứ tự chuẩn là bắt buộc với đơn trải nhiều document: nếu U1 xin {A,B} còn U2
 * xin {B,A} theo thứ tự ngược nhau thì cả hai cùng lấy được một nửa rồi cùng
 * thất bại, và cùng thử lại — không deadlock nhưng huỷ lẫn nhau vô hạn. Claim
 * theo cùng một thứ tự thì đúng một bên thắng.
 */
export function groupSlotsForClaim(slots) {
  const groups = new Map();

  for (const s of slots) {
    const key = `${s.facility}|${s.courtId}|${s.date}`;
    if (!groups.has(key)) {
      groups.set(key, {
        facility: s.facility,
        courtId: s.courtId,
        court: s.court || "",
        timeClusterId: s.cluster,
        date: s.date,
        slotIndexes: [],
      });
    }
    groups.get(key).slotIndexes.push(assertSlotIndex(s.slotIndex));
  }

  const out = [...groups.values()];
  for (const g of out) g.slotIndexes.sort((a, b) => a - b);
  out.sort((a, b) =>
    a.facility.localeCompare(b.facility) ||
    a.courtId.localeCompare(b.courtId) ||
    a.date.localeCompare(b.date)
  );
  return out;
}
