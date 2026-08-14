import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

import {
  COURT_DAYS,
  SCHEDULES,
  claimGroup,
  confirmGroup,
  ensureIndexes,
  assertIndexes,
  extendHold,
  groupSlotsForClaim,
  readOccupied,
  releaseHold,
  slotIndexFromTime,
  sweepExpiredHolds,
  toBookingDate,
  getSlotTime,
} from "../courtDays.js";
import { SCHEDULE_STATUS, SLOT_STATUS } from "../bookingConstants.js";

/**
 * Chạy:
 *   docker run -d --name wsbmt-test-mongo -p 37017:27017 mongo:5.0
 *   node --test utils/__tests__/courtDays.test.js
 *
 * Hoặc trỏ sang mongod khác: MONGO_TEST_URI=... node --test ...
 *
 * KHÔNG cần replica set: toàn bộ thiết kế cố ý không dùng transaction, nên bộ
 * test này chạy được trên mongod standalone.
 */
const URI =
  process.env.MONGO_TEST_URI ||
  "mongodb://127.0.0.1:37017/wsbmt_test?directConnection=true";

let client;
let db;

const F = "CN NVL";
const C = "NVL-2";
const CLUSTER = "cluster1";
const DATE = "2026-08-14";

const group = (slotIndexes) => ({
  facility: F,
  courtId: C,
  court: "Sân 2",
  timeClusterId: CLUSTER,
  date: DATE,
  slotIndexes,
});

const ctx = (holdId, overrides = {}) => ({
  holdId,
  holdExpiresAt: new Date(Date.now() + 20 * 60 * 1000),
  scheduleId: `sched-${holdId}`,
  transactionCode: `WSB${holdId}`,
  bookedBy: { name: "Test", phone: "0900000000" },
  ...overrides,
});

before(async () => {
  client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db();
});

after(async () => {
  await client?.close();
});

beforeEach(async () => {
  await db.collection(COURT_DAYS).drop().catch(() => {});
  await db.collection(SCHEDULES).drop().catch(() => {});
  await db.collection("payment_exceptions").drop().catch(() => {});
  await ensureIndexes(db);
});

/* ─────────────────────────── Ngày & chỉ số ô ──────────────────────────── */

describe("chuẩn hoá ngày", () => {
  it("quy đổi instant về YYYY-MM-DD theo giờ VN", () => {
    // 2026-08-14T18:30Z = 2026-08-15 01:30 giờ VN -> phải là ngày 15
    assert.equal(toBookingDate(new Date("2026-08-14T18:30:00Z")), "2026-08-15");
    // 2026-08-14T16:00Z = 2026-08-14 23:00 giờ VN -> vẫn là ngày 14
    assert.equal(toBookingDate(new Date("2026-08-14T16:00:00Z")), "2026-08-14");
  });

  it("giữ nguyên chuỗi đã đúng định dạng", () => {
    assert.equal(toBookingDate("2026-08-14"), "2026-08-14");
  });

  it("từ chối ngày không hợp lệ", () => {
    assert.throws(() => toBookingDate("Sat Mar 14 2026 xyz"));
  });
});

describe("bất biến của lưới ô", () => {
  it("chỉ số ô KHÔNG dùng chung được giữa các cluster", () => {
    // Nếu assertion này hỏng, mọi delta thiếu `cluster` sẽ hiện sai giờ.
    assert.notEqual(getSlotTime("cluster1", 5).from, getSlotTime("cluster4", 5).from);
  });

  it("ô vắt qua nửa đêm thuộc ngày BẮT ĐẦU", () => {
    const last = getSlotTime("cluster1", 21);
    assert.equal(last.from, "23:10");
    assert.equal(last.to, "0:10");
  });

  it("đổi được giờ bắt đầu thành chỉ số ô", () => {
    assert.equal(slotIndexFromTime("cluster1", "23:10"), 21);
    assert.equal(slotIndexFromTime("cluster1", "khong-ton-tai"), -1);
  });
});

/* ───────────────────────────── Index ──────────────────────────────────── */

describe("index", () => {
  it("assertIndexes pass khi unique index tồn tại", async () => {
    await assertIndexes(db);
  });

  it("assertIndexes FAIL CLOSED khi thiếu unique index", async () => {
    await db.collection(COURT_DAYS).dropIndexes();
    await assert.rejects(() => assertIndexes(db), /Thiếu unique index/);
  });
});

/* ──────────────────────────── Claim cơ bản ────────────────────────────── */

describe("claim", () => {
  it("giữ được ô trống và KHÔNG tạo ô trống nào khác", async () => {
    const res = await claimGroup(db, group([8, 9]), ctx("H1"));
    assert.equal(res.ok, true);

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.deepEqual(Object.keys(doc.slots).sort(), ["8", "9"]);
    assert.equal(doc.slots["8"].status, SLOT_STATUS.WAIT);
    assert.equal(doc.slots["8"].holdId, "H1");
    // Đây chính là khoản giảm dung lượng: 2 ô được đặt, không phải 22.
  });

  it("ngày không ai đặt thì KHÔNG có document nào", async () => {
    assert.equal(await db.collection(COURT_DAYS).countDocuments(), 0);
  });

  it("từ chối ô đang được giữ bởi người khác, và nói rõ ô nào", async () => {
    await claimGroup(db, group([8]), ctx("H1"));
    const res = await claimGroup(db, group([8]), ctx("H2"));

    assert.equal(res.ok, false);
    assert.equal(res.conflicts.length, 1);
    assert.equal(res.conflicts[0].slotIndex, 8);
    assert.equal(res.conflicts[0].time, getSlotTime(CLUSTER, 8).from);
    assert.match(res.conflicts[0].reason, /giữ bởi khách khác/);
  });

  it("KHÔNG chiếm được ô đã thanh toán", async () => {
    await claimGroup(db, group([8]), ctx("H1"));
    await confirmGroup(db, group([8]), "H1", "WSBH1");

    const res = await claimGroup(db, group([8]), ctx("H2"));
    assert.equal(res.ok, false);
    assert.match(res.conflicts[0].reason, /Đã có người đặt/);

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(doc.slots["8"].status, SLOT_STATUS.BOOKED);
  });

  it("chiếm lại được hold ĐÃ HẾT HẠN", async () => {
    await claimGroup(db, group([8]), ctx("H1", { holdExpiresAt: new Date(Date.now() - 1000) }));
    const res = await claimGroup(db, group([8]), ctx("H2"));

    assert.equal(res.ok, true);
    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(doc.slots["8"].holdId, "H2");
  });

  it("claim lại hold của CHÍNH MÌNH là idempotent (chống double-submit)", async () => {
    await claimGroup(db, group([8, 9]), ctx("H1"));
    const res = await claimGroup(db, group([8, 9]), ctx("H1"));
    assert.equal(res.ok, true, "double-submit không được báo 'ô đã bị lấy' về chính ô của mình");
  });

  it("phục hồi ô nhiễm độc: holdExpiresAt sai kiểu vẫn claim được", async () => {
    // Mô phỏng Date bị socket.io serialize thành chuỗi ISO rồi echo ngược lại.
    //
    // bypassDocumentValidation vì validator (đúng đắn) đã chặn không cho tạo ra
    // document như thế nữa. Nhánh phục hồi vẫn cần cho dữ liệu có TRƯỚC khi có
    // validator, và cho trường hợp POST /api/backup restore dữ liệu cũ.
    await db.collection(COURT_DAYS).insertOne(
      {
        facility: F, courtId: C, court: "Sân 2", timeClusterId: CLUSTER, date: DATE,
        version: 1,
        slots: { "8": { status: SLOT_STATUS.WAIT, holdId: "OLD", holdExpiresAt: new Date().toISOString() } },
      },
      { bypassDocumentValidation: true }
    );

    const res = await claimGroup(db, group([8]), ctx("H2"));
    assert.equal(res.ok, true, "không có nhánh này thì ô chết vĩnh viễn");

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(doc.slots["8"].holdId, "H2");
  });

  it("ô 'wait' thiếu hẳn holdExpiresAt cũng phục hồi được", async () => {
    await db.collection(COURT_DAYS).insertOne(
      {
        facility: F, courtId: C, court: "Sân 2", timeClusterId: CLUSTER, date: DATE,
        version: 1,
        slots: { "8": { status: SLOT_STATUS.WAIT, holdId: "OLD" } },
      },
      { bypassDocumentValidation: true }
    );

    const res = await claimGroup(db, group([8]), ctx("H2"));
    assert.equal(res.ok, true);
  });

  it("từ chối holdExpiresAt không phải Date (chặn dữ liệu client ngay tại cửa)", async () => {
    await assert.rejects(
      () => claimGroup(db, group([8]), ctx("H1", { holdExpiresAt: new Date().toISOString() })),
      /phải là Date do server tạo/
    );
  });

  it("từ chối ngày sai định dạng", async () => {
    await assert.rejects(
      () => claimGroup(db, { ...group([8]), date: "Sat Aug 14 2026" }, ctx("H1")),
      /YYYY-MM-DD/
    );
  });

  it("validator DB chặn được document sai định dạng ngày", async () => {
    await assert.rejects(() =>
      db.collection(COURT_DAYS).insertOne({
        facility: F, courtId: C, timeClusterId: CLUSTER,
        date: "Sat Aug 14 2026",
        slots: {},
      })
    );
  });

  it("validator DB chặn được holdExpiresAt kiểu chuỗi", async () => {
    await assert.rejects(() =>
      db.collection(COURT_DAYS).insertOne({
        facility: F, courtId: "NVL-9", timeClusterId: CLUSTER, date: DATE,
        slots: { "8": { status: "wait", holdExpiresAt: "2026-08-14T00:00:00Z" } },
      })
    );
  });
});

/* ─────────────────── Atomic: tất-cả-hoặc-không-gì ────────────────────── */

describe("tính atomic của đơn nhiều ô", () => {
  it("1 ô bị chiếm -> KHÔNG ô nào được ghi", async () => {
    await claimGroup(db, group([10]), ctx("OTHER"));

    const res = await claimGroup(db, group([8, 9, 10]), ctx("H1"));
    assert.equal(res.ok, false);

    const doc = await db.collection(COURT_DAYS).findOne({});
    // Chỉ ô của OTHER tồn tại; 8 và 9 không được ghi một phần.
    assert.deepEqual(Object.keys(doc.slots).sort(), ["10"]);
  });

  it("3 giờ liền cùng sân, 2 user song song -> đúng 1 user được CẢ 3", async () => {
    const [a, b] = await Promise.all([
      claimGroup(db, group([8, 9, 10]), ctx("UA")),
      claimGroup(db, group([8, 9, 10]), ctx("UB")),
    ]);

    assert.equal([a.ok, b.ok].filter(Boolean).length, 1, "đúng một người thắng");

    const doc = await db.collection(COURT_DAYS).findOne({});
    const holders = new Set(Object.values(doc.slots).map((s) => s.holdId));
    assert.equal(holders.size, 1, "cả 3 ô phải thuộc về cùng một người");
    assert.equal(Object.keys(doc.slots).length, 3);
  });

  it("50 claim ĐỒNG THỜI cùng một ô -> đúng 1 thắng", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, k) => claimGroup(db, group([8]), ctx(`H${k}`)))
    );

    const winners = results.filter((r) => r.ok);
    assert.equal(winners.length, 1, `phải đúng 1 thắng, thực tế ${winners.length}`);

    const losers = results.filter((r) => !r.ok);
    assert.equal(losers.length, 49);
    assert.ok(losers.every((r) => r.conflicts.length > 0), "mọi bên thua phải biết ô nào bị chiếm");

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(Object.keys(doc.slots).length, 1);
  });

  it("claim đồng thời các ô KHÁC nhau trên cùng sân/ngày -> tất cả đều thắng", async () => {
    // Nhiều bên cùng ghi một document nhưng không đụng ô nhau. Ca này phải
    // thành công hết, nếu không thì mô hình sparse-row sẽ chặn nhầm.
    const results = [];
    for (let k = 0; k < 10; k++) {
      results.push(await claimGroup(db, group([k]), ctx(`H${k}`)));
    }
    assert.equal(results.filter((r) => r.ok).length, 10);

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(Object.keys(doc.slots).length, 10);
  });
});

/* ───────────────────── Thứ tự chuẩn cho đơn nhiều sân ─────────────────── */

describe("gom nhóm & thứ tự chuẩn", () => {
  it("gom theo (facility, courtId, date) và sắp xếp ổn định", () => {
    const slots = [
      { facility: "B", courtId: "B-1", date: "2026-08-14", slotIndex: 3, cluster: CLUSTER },
      { facility: "A", courtId: "A-1", date: "2026-08-14", slotIndex: 9, cluster: CLUSTER },
      { facility: "A", courtId: "A-1", date: "2026-08-14", slotIndex: 8, cluster: CLUSTER },
    ];
    const g1 = groupSlotsForClaim(slots);
    const g2 = groupSlotsForClaim([...slots].reverse());

    // Hai thứ tự đầu vào ngược nhau phải cho ra cùng một thứ tự claim — đây là
    // thứ ngăn hai đơn chồng lấn huỷ lẫn nhau vô hạn.
    assert.deepEqual(g1.map((g) => `${g.facility}/${g.courtId}`), g2.map((g) => `${g.facility}/${g.courtId}`));
    assert.deepEqual(g1[0].slotIndexes, [8, 9]);
    assert.equal(g1[0].facility, "A");
  });
});

/* ───────────────────────────── Confirm ────────────────────────────────── */

describe("confirm", () => {
  it("chuyển sang booked và XOÁ SẠCH dấu vết hold", async () => {
    await claimGroup(db, group([8, 9]), ctx("H1"));
    const res = await confirmGroup(db, group([8, 9]), "H1", "WSB123");

    assert.equal(res.confirmed, 2);
    assert.deepEqual(res.missing, []);

    const doc = await db.collection(COURT_DAYS).findOne({});
    for (const i of ["8", "9"]) {
      assert.equal(doc.slots[i].status, SLOT_STATUS.BOOKED);
      assert.equal(doc.slots[i].transactionCode, "WSB123");
      // Nếu còn holdExpiresAt, sweeper sẽ nhả một booking ĐÃ THANH TOÁN.
      assert.equal(doc.slots[i].holdExpiresAt, undefined);
      assert.equal(doc.slots[i].holdId, undefined);
    }
  });

  it("idempotent: gọi lại lần 2 vẫn báo thành công", async () => {
    await claimGroup(db, group([8]), ctx("H1"));
    await confirmGroup(db, group([8]), "H1", "WSB123");

    const again = await confirmGroup(db, group([8]), "H1", "WSB123");
    assert.equal(again.confirmed, 1, "webhook gửi lại không được coi là thất bại");
    assert.deepEqual(again.missing, []);
  });

  it("báo `missing` khi ô đã mất về tay người khác (không nuốt lỗi)", async () => {
    await claimGroup(db, group([8]), ctx("H1", { holdExpiresAt: new Date(Date.now() - 1000) }));
    await claimGroup(db, group([8]), ctx("H2"));   // người khác chiếm mất
    await confirmGroup(db, group([8]), "H2", "WSBH2");

    const res = await confirmGroup(db, group([8]), "H1", "WSBH1");
    assert.equal(res.confirmed, 0);
    assert.deepEqual(res.missing, [8], "đơn đã trả tiền mà không phục vụ được PHẢI báo ra");
  });

  it("booking đã confirm KHÔNG bị sweeper nhả", async () => {
    await claimGroup(db, group([8]), ctx("H1"));
    await confirmGroup(db, group([8]), "H1", "WSB123");

    await db.collection(SCHEDULES).insertOne({
      id: "s1", holdId: "H1", transactionCode: "WSB123",
      status: SCHEDULE_STATUS.WAIT, holdExpiresAt: new Date(Date.now() - 60000),
    });
    await sweepExpiredHolds(db);

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(doc.slots["8"].status, SLOT_STATUS.BOOKED, "booking đã trả tiền phải sống sót");
  });
});

/* ────────────────────────── Release & sweeper ─────────────────────────── */

describe("release & sweeper", () => {
  it("nhả ô là XOÁ khoá, không để lại ô trống", async () => {
    await claimGroup(db, group([8, 9]), ctx("H1"));
    await releaseHold(db, "H1");

    // Không còn ô nào -> document cũng không nên tồn tại.
    assert.equal(await db.collection(COURT_DAYS).countDocuments(), 0);
  });

  it("release chỉ đụng ô của đúng holdId", async () => {
    await claimGroup(db, group([8]), ctx("H1"));
    await claimGroup(db, group([9]), ctx("H2"));
    await releaseHold(db, "H1");

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.deepEqual(Object.keys(doc.slots), ["9"]);
  });

  it("sweeper nhả hold hết hạn và đánh dấu đơn expired", async () => {
    await claimGroup(db, group([8]), ctx("H1"));
    await db.collection(SCHEDULES).insertOne({
      id: "s1", holdId: "H1", transactionCode: "WSBH1",
      status: SCHEDULE_STATUS.WAIT, holdExpiresAt: new Date(Date.now() - 60000),
    });

    const res = await sweepExpiredHolds(db);
    assert.equal(res.releasedSlots, 1);

    const sched = await db.collection(SCHEDULES).findOne({ id: "s1" });
    assert.equal(sched.status, SCHEDULE_STATUS.EXPIRED);
    assert.equal(await db.collection(COURT_DAYS).countDocuments(), 0);
  });

  it("extendHold gia hạn mọi ô của cùng một holdId", async () => {
    const short = new Date(Date.now() + 90 * 1000);
    await claimGroup(db, group([8, 9]), ctx("H1", { holdExpiresAt: short }));

    const long = new Date(Date.now() + 20 * 60 * 1000);
    const res = await extendHold(db, "H1", long);
    assert.equal(res.extended, 2);

    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.ok(doc.slots["8"].holdExpiresAt.getTime() > short.getTime() + 1000);
  });
});

/* ─────────────────────────── Đường đọc ────────────────────────────────── */

describe("readOccupied", () => {
  it("chỉ trả ô bị chiếm, không trả ô trống", async () => {
    await claimGroup(db, group([8, 9]), ctx("H1"));
    const rows = await readOccupied(db, { facilities: [F], dates: [DATE] });

    assert.equal(rows.length, 2, "22 ô mỗi sân nhưng chỉ 2 ô được truyền đi");
    assert.deepEqual(rows.map((r) => r.slotIndex).sort(), [8, 9]);
    assert.equal(rows[0].cluster, CLUSTER, "delta phải mang cluster, vì chỉ số ô không portable");
  });

  it("KHÔNG lộ bookedBy cho khách vô danh", async () => {
    await claimGroup(db, group([8]), ctx("H1"));

    const anon = await readOccupied(db, { facilities: [F], dates: [DATE] });
    assert.equal(anon[0].bookedBy, undefined, "khách vô danh không được nhận tên/SĐT khách khác");

    const admin = await readOccupied(db, { facilities: [F], dates: [DATE], includeBookedBy: true });
    assert.equal(admin[0].bookedBy.phone, "0900000000");
  });

  it("coi hold hết hạn là TRỐNG dù sweeper chưa chạy", async () => {
    await claimGroup(db, group([8]), ctx("H1", { holdExpiresAt: new Date(Date.now() - 1000) }));
    const rows = await readOccupied(db, { facilities: [F], dates: [DATE] });
    assert.equal(rows.length, 0, "đường đọc phải tự lọc, không được trông chờ sweeper");
  });

  it("ngày không có đặt gì trả về mảng rỗng", async () => {
    const rows = await readOccupied(db, { facilities: [F], dates: ["2026-09-01"] });
    assert.deepEqual(rows, []);
  });
});
