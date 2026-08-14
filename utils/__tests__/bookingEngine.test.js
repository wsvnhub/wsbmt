import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

import BookingEngine from "../../engine/bookingEngine.js";
import { COURT_DAYS, SCHEDULES, ensureIndexes, readOccupied } from "../courtDays.js";
import { confirmPaidOrder } from "../confirmOrder.js";
import { SCHEDULE_STATUS, SLOT_STATUS } from "../bookingConstants.js";

/**
 * Lớp ĐƠN HÀNG: saga hai pha cho đơn trải nhiều document, và đường thanh toán.
 *
 *   docker run -d --name wsbmt-test-mongo -p 37017:27017 mongo:5.0
 *   node --test utils/__tests__/bookingEngine.test.js
 */
const URI =
  process.env.MONGO_TEST_URI ||
  "mongodb://127.0.0.1:37017/wsbmt_engine_test?directConnection=true";

let client;
let db;
let engine;

const DATE = "2026-08-14";
const DATE2 = "2026-08-15";

const slot = (courtId, slotIndex, date = DATE, facility = "CN NVL") => ({
  facility,
  courtId,
  court: `Sân ${courtId.slice(-1)}`,
  cluster: "cluster1",
  date,
  slotIndex,
});

const userInfo = (transactionCode, overrides = {}) => ({
  transactionCode,
  userName: "Nguyễn Văn A",
  phone: "0912345678",
  email: "a@example.com",
  totalPrice: 139000,
  totalHours: 1,
  details: "Sân 1 - 9:05",
  formateddetails: "Sân 1 - 9:05 (14/08/2026)",
  dates: [DATE],
  isFixed: false,
  applyDiscount: "",
  address: { "CN NVL": "CN NVL" },
  ...overrides,
});

before(async () => {
  client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db();
  engine = new BookingEngine(db);
});

after(async () => {
  await engine?.stop();
  await client?.close();
});

beforeEach(async () => {
  await db.collection(COURT_DAYS).drop().catch(() => {});
  await db.collection(SCHEDULES).drop().catch(() => {});
  await db.collection("payment_exceptions").drop().catch(() => {});
  await ensureIndexes(db);
});

/* ────────────────────────────── Giữ sân ───────────────────────────────── */

describe("holdSlots", () => {
  it("giữ được đơn 3 giờ liền cùng sân và trả về mã đúng của client", async () => {
    const res = await engine.holdSlots(
      [slot("NVL-1", 8), slot("NVL-1", 9), slot("NVL-1", 10)],
      "sess-1",
      userInfo("WSB_CLIENT_CODE")
    );

    assert.equal(res.success, true);
    // Bản cũ tự sinh `WSB${Date.now()}` khác với mã đã in lên QR, nên mã trên QR
    // và mã trong DB không bao giờ khớp và webhook không tìm được đơn.
    assert.equal(res.transactionCode, "WSB_CLIENT_CODE");
    assert.ok(res.holdId);
    assert.ok(res.scheduleId);
    assert.ok(res.holdExpiresAt instanceof Date);

    const sched = await db.collection(SCHEDULES).findOne({ id: res.scheduleId });
    assert.equal(sched.status, SCHEDULE_STATUS.WAIT);

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.deepEqual(Object.keys(doc.slots).sort(), ["10", "8", "9"]);
  });

  it("từ chối đơn thiếu mã giao dịch", async () => {
    const res = await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo(undefined));
    assert.equal(res.success, false);
    assert.match(res.error, /Thiếu mã giao dịch/);
  });

  it("chặn mã giao dịch trùng (unique index) thay vì để 2 đơn cùng mã", async () => {
    await engine.holdSlots([slot("NVL-1", 8)], "s1", userInfo("WSB_DUP"));
    const res = await engine.holdSlots([slot("NVL-1", 9)], "s2", userInfo("WSB_DUP"));

    // Hai đơn cùng mã nghĩa là tiền của người này xác nhận đơn của người kia.
    assert.equal(res.success, false);
    assert.match(res.error, /trùng/);
  });

  it("báo đúng ô nào bị chiếm khi có xung đột", async () => {
    await engine.holdSlots([slot("NVL-1", 9)], "s1", userInfo("WSB_A"));

    const res = await engine.holdSlots(
      [slot("NVL-1", 8), slot("NVL-1", 9)],
      "s2",
      userInfo("WSB_B")
    );

    assert.equal(res.success, false);
    assert.equal(res.conflicts.length, 1);
    assert.match(res.conflicts[0], /Sân 1/);
  });

  it("thất bại thì KHÔNG để lại ô nào và đơn bị đánh dấu cancelled", async () => {
    await engine.holdSlots([slot("NVL-2", 9)], "s1", userInfo("WSB_A"));

    // Đơn trải 2 document: NVL-1 (trống) và NVL-2 ô 9 (đã bị chiếm).
    const res = await engine.holdSlots(
      [slot("NVL-1", 8), slot("NVL-2", 9)],
      "s2",
      userInfo("WSB_B")
    );
    assert.equal(res.success, false);

    // Ô của NVL-1 đã claim ở pha 1 phải được nhả lại.
    const nvl1 = await db.collection(COURT_DAYS).findOne({ courtId: "NVL-1" });
    assert.equal(nvl1, null, "không được để lại hold mồ côi ở sân khác");

    const sched = await db.collection(SCHEDULES).findOne({ transactionCode: "WSB_B" });
    assert.equal(sched.status, SCHEDULE_STATUS.CANCELLED);
  });

  it("2 user song song xin đơn CHỒNG LẤN nhiều sân -> đúng 1 thắng, không ai kẹt", async () => {
    // U1 xin {NVL-1/8, NVL-2/8}; U2 xin {NVL-2/8, NVL-1/8} (thứ tự ngược).
    // Nhờ claim theo thứ tự chuẩn, đúng một bên thắng thay vì cả hai cùng lấy
    // một nửa rồi cùng thất bại.
    const [a, b] = await Promise.all([
      engine.holdSlots([slot("NVL-1", 8), slot("NVL-2", 8)], "s1", userInfo("WSB_1")),
      engine.holdSlots([slot("NVL-2", 8), slot("NVL-1", 8)], "s2", userInfo("WSB_2")),
    ]);

    const wins = [a, b].filter((r) => r.success);
    assert.equal(wins.length, 1, `đúng 1 thắng, thực tế ${wins.length}`);

    // Bên thắng phải giữ CẢ HAI ô, và không có hold mồ côi nào.
    const docs = await db.collection(COURT_DAYS).find({}).toArray();
    const holders = new Set(docs.flatMap((d) => Object.values(d.slots).map((s) => s.holdId)));
    assert.equal(holders.size, 1);
    assert.equal(docs.reduce((n, d) => n + Object.keys(d.slots).length, 0), 2);
  });

  it("đơn nhiều NGÀY (đặt cố định) giữ được hết", async () => {
    const res = await engine.holdSlots(
      [slot("NVL-1", 19, DATE), slot("NVL-1", 19, DATE2)],
      "s1",
      userInfo("WSB_FIXED", { isFixed: true, dates: [DATE, DATE2] })
    );
    assert.equal(res.success, true);

    const docs = await db.collection(COURT_DAYS).find({}).sort({ date: 1 }).toArray();
    assert.equal(docs.length, 2);
    assert.equal(docs[0].slots["19"].isFixed, true);
  });

  it("hold được gia hạn lên hạn đầy đủ sau khi claim xong (pha 2)", async () => {
    const before = Date.now();
    const res = await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo("WSB_X"));

    const doc = await db.collection(COURT_DAYS).findOne({});
    const expiry = doc.slots["8"].holdExpiresAt.getTime();

    // Pha 1 giữ 90 giây; pha 2 phải nâng lên 20 phút. Nếu chỉ còn 90 giây thì
    // khách không kịp chuyển khoản.
    assert.ok(expiry - before > 10 * 60 * 1000, "phải được gia hạn khỏi hold ngắn 90s");
    assert.equal(res.holdExpiresAt.getTime(), expiry);
  });
});

/* ─────────────────────── Đường thanh toán ─────────────────────────────── */

describe("confirmPaidOrder", () => {
  it("xác nhận đơn và xoá sạch dấu vết hold", async () => {
    await engine.holdSlots([slot("NVL-1", 8), slot("NVL-1", 9)], "s", userInfo("WSB_PAY"));

    const res = await confirmPaidOrder(db, "WSB_PAY", { amount: 139000 });
    assert.equal(res.success, true);

    const sched = await db.collection(SCHEDULES).findOne({ transactionCode: "WSB_PAY" });
    assert.equal(sched.status, SCHEDULE_STATUS.BOOKED);
    assert.equal(sched.holdExpiresAt, undefined);

    const doc = await db.collection(COURT_DAYS).findOne({});
    for (const i of ["8", "9"]) {
      assert.equal(doc.slots[i].status, SLOT_STATUS.BOOKED);
      assert.equal(doc.slots[i].holdExpiresAt, undefined, "còn holdExpiresAt là sweeper sẽ nhả booking đã trả tiền");
    }
  });

  it("idempotent: webhook gửi lại 3 lần vẫn thành công", async () => {
    await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo("WSB_PAY"));

    const r1 = await confirmPaidOrder(db, "WSB_PAY", {});
    const r2 = await confirmPaidOrder(db, "WSB_PAY", {});
    const r3 = await confirmPaidOrder(db, "WSB_PAY", {});

    assert.equal(r1.success, true);
    assert.equal(r2.success, true);
    assert.equal(r2.replay, true);
    assert.equal(r3.success, true);
  });

  it("hold hết hạn nhưng ô vẫn trống -> GIÀNH LẠI và cứu được đơn", async () => {
    // Đây đúng là kịch bản đã sinh ra 139 dòng "Đơn hàng của bạn đã bị xoá":
    // đồng hồ UI dài hơn hold của server, khách trả tiền sau khi hold đã nhả.
    const hold = await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo("WSB_LATE"));

    // Mô phỏng hold hết hạn và sweeper đã dọn.
    await engine.cancelBooking({ holdId: hold.holdId }, "expired");
    assert.equal(await db.collection(COURT_DAYS).countDocuments(), 0);
    await db.collection(SCHEDULES).updateOne(
      { transactionCode: "WSB_LATE" },
      { $set: { status: SCHEDULE_STATUS.WAIT } }
    );

    const res = await confirmPaidOrder(db, "WSB_LATE", { amount: 139000 });
    assert.equal(res.success, true, "ô vẫn trống nên phải giành lại được");

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(doc.slots["8"].status, SLOT_STATUS.BOOKED);
  });

  it("hold hết hạn VÀ ô đã bị người khác đặt -> ghi payment_exception, KHÔNG im lặng", async () => {
    const hold = await engine.holdSlots([slot("NVL-1", 8)], "s1", userInfo("WSB_LOSER"));
    await engine.cancelBooking({ holdId: hold.holdId }, "expired");
    await db.collection(SCHEDULES).updateOne(
      { transactionCode: "WSB_LOSER" },
      { $set: { status: SCHEDULE_STATUS.WAIT } }
    );

    // Người khác đặt và trả tiền cho đúng ô đó.
    await engine.holdSlots([slot("NVL-1", 8)], "s2", userInfo("WSB_WINNER"));
    await confirmPaidOrder(db, "WSB_WINNER", {});

    const res = await confirmPaidOrder(db, "WSB_LOSER", { amount: 139000 });

    assert.equal(res.success, false);
    assert.equal(res.needsManualReview, true);

    const exc = await db.collection("payment_exceptions").findOne({ transactionCode: "WSB_LOSER" });
    assert.ok(exc, "khách đã trả tiền mà không có sân PHẢI được ghi lại để người xử lý");
    assert.equal(exc.resolved, false);
    assert.equal(exc.phone, "0912345678");

    // Booking của người thắng không được bị ghi đè.
    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(doc.slots["8"].transactionCode, "WSB_WINNER");
  });

  it("không xác nhận được đơn đã huỷ", async () => {
    const hold = await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo("WSB_C"));
    await engine.cancelBooking({ holdId: hold.holdId }, "user");

    const res = await confirmPaidOrder(db, "WSB_C", {});
    assert.equal(res.success, false);
    assert.equal(res.code, "CANCELLED");
  });
});

/* ──────────────────────────────── Huỷ ─────────────────────────────────── */

describe("cancelBooking", () => {
  it("nhả ô và ngày trở lại hoàn toàn trống", async () => {
    const hold = await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo("WSB_C"));
    const res = await engine.cancelBooking({ holdId: hold.holdId }, "hết giờ");

    assert.equal(res.success, true);
    assert.equal(await db.collection(COURT_DAYS).countDocuments(), 0);

    const rows = await readOccupied(db, { facilities: ["CN NVL"], dates: [DATE] });
    assert.deepEqual(rows, []);
  });

  it("KHÔNG cho huỷ đơn đã thanh toán", async () => {
    const hold = await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo("WSB_P"));
    await confirmPaidOrder(db, "WSB_P", {});

    const res = await engine.cancelBooking({ holdId: hold.holdId }, "thử huỷ");

    // Bản cũ tìm đơn mà KHÔNG lọc status rồi set "cancelled" vô điều kiện: một
    // đơn đã thanh toán bị ghi là đã huỷ trong khi ô vẫn booked.
    assert.equal(res.success, false);
    assert.match(res.error, /đã thanh toán/);

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(doc.slots["8"].status, SLOT_STATUS.BOOKED);
  });

  it("huỷ được bằng transactionCode (đường webhook không biết holdId)", async () => {
    await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo("WSB_T"));
    const res = await engine.cancelBooking({ transactionCode: "WSB_T" }, "hết giờ");
    assert.equal(res.success, true);
  });

  it("huỷ lại lần 2 là idempotent", async () => {
    const hold = await engine.holdSlots([slot("NVL-1", 8)], "s", userInfo("WSB_T"));
    await engine.cancelBooking({ holdId: hold.holdId });
    const again = await engine.cancelBooking({ holdId: hold.holdId });
    assert.equal(again.success, true);
    assert.equal(again.replay, true);
  });
});

/* ─────────────────────── Không phụ thuộc transaction ──────────────────── */

describe("không phụ thuộc transaction", () => {
  it("engine hoạt động đầy đủ mà KHÔNG mở transaction nào", async () => {
    // Không thể theo dõi startSession: driver tự tạo implicit session cho MỌI
    // thao tác. Thứ cần khẳng định là không có transaction nào được MỞ, vì đó
    // mới là thứ đòi hỏi replica set.
    //
    // Đây là bảo hiểm cho lựa chọn thiết kế: engine phải chạy được trên cả
    // standalone lẫn replica set, không phụ thuộc rs.initiate() đã chạy hay chưa.
    const origStart = client.startSession.bind(client);
    let txnCount = 0;

    client.startSession = (...a) => {
      const session = origStart(...a);
      const origWith = session.withTransaction?.bind(session);
      const origStartTxn = session.startTransaction?.bind(session);
      if (origWith) session.withTransaction = (...w) => { txnCount++; return origWith(...w); };
      if (origStartTxn) session.startTransaction = (...w) => { txnCount++; return origStartTxn(...w); };
      return session;
    };

    try {
      const hold = await engine.holdSlots([slot("NVL-1", 8), slot("NVL-2", 9)], "s", userInfo("WSB_NT"));
      assert.equal(hold.success, true);

      const paid = await confirmPaidOrder(db, "WSB_NT", {});
      assert.equal(paid.success, true);

      assert.equal(txnCount, 0, "engine không được mở transaction");
    } finally {
      client.startSession = origStart;
    }
  });
});
