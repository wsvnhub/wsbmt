import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

import BookingEngine from "../../engine/bookingEngine.js";
import { COURT_DAYS, SCHEDULES, ensureIndexes, assertIndexes } from "../courtDays.js";
import { confirmPaidOrder } from "../confirmOrder.js";
import { SLOT_STATUS } from "../bookingConstants.js";
import { buildGridByCluster } from "../buildGrid.js";

/**
 * SMOKE TEST end-to-end: đi hết một vòng đúng như production, gồm cả bước dựng
 * lưới ở client, để chắc rằng dữ liệu sparse của server ghép được vào UI.
 *
 *   npm run test:mongo:up && npm test
 */
const URI =
  process.env.MONGO_TEST_URI ||
  "mongodb://127.0.0.1:37017/wsbmt_smoke_test?directConnection=true";

let client;
let db;
let engine;

const COURTS = [
  { facility: "CN NVL", courtId: "NVL-1", court: "Sân 1", cluster: "cluster1" },
  { facility: "CN NVL", courtId: "NVL-2", court: "Sân 2", cluster: "cluster1" },
];
const DATE = "2026-08-14";

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
  await ensureIndexes(db);
});

describe("smoke: một vòng đặt sân hoàn chỉnh", () => {
  it("engine từ chối khởi động nếu thiếu unique index", async () => {
    await db.collection(COURT_DAYS).dropIndexes();
    await assert.rejects(() => engine.start(), /Thiếu unique index/);
    await ensureIndexes(db);
  });

  it("trống -> giữ -> thanh toán -> lưới phản ánh đúng ở mọi bước", async () => {
    const readAndBuild = async (isAdmin = false) => {
      const occupied = await engine.listOccupied({
        facilities: ["CN NVL"],
        dates: [DATE],
        includeBookedBy: isAdmin,
      });
      return { occupied, grid: buildGridByCluster(COURTS, occupied, DATE) };
    };

    /* 1. Ban đầu: không có document nào, nhưng lưới vẫn đủ 22 ô × 2 sân */
    let { occupied, grid } = await readAndBuild();
    assert.equal(await db.collection(COURT_DAYS).countDocuments(), 0, "chưa ai đặt thì DB rỗng");
    assert.equal(occupied.length, 0, "không truyền ô trống nào qua mạng");
    assert.equal(grid.cluster1.length, 2, "lưới vẫn có đủ 2 sân");
    assert.equal(Object.keys(grid.cluster1[0]).filter((k) => !isNaN(Number(k))).length, 22);
    assert.equal(grid.cluster1[0][8].status, "empty");
    assert.ok(grid.cluster1[0][8].from, "ô trống vẫn có giờ, suy ra từ timeSlots.json");

    /* 2. Giữ 2 giờ liền */
    const hold = await engine.holdSlots(
      [
        { ...COURTS[0], date: DATE, slotIndex: 8 },
        { ...COURTS[0], date: DATE, slotIndex: 9 },
      ],
      "sess",
      {
        transactionCode: "WSB_SMOKE",
        userName: "Trần B",
        phone: "0987654321",
        totalPrice: 278000,
        totalHours: 2,
        dates: [DATE],
        isFixed: false,
      }
    );
    assert.equal(hold.success, true);

    ({ occupied, grid } = await readAndBuild());
    assert.equal(occupied.length, 2, "chỉ 2 ô đã đặt được truyền, không phải 44");
    assert.equal(grid.cluster1[0][8].status, SLOT_STATUS.WAIT);
    assert.equal(grid.cluster1[0][10].status, "empty");
    assert.equal(grid.cluster1[1][8].status, "empty", "sân khác không bị ảnh hưởng");

    /* 3. Khách vô danh không thấy thông tin cá nhân */
    assert.ok(!JSON.stringify(occupied).includes("0987654321"));
    const asAdmin = await readAndBuild(true);
    assert.equal(asAdmin.grid.cluster1[0][8].bookedBy.phone, "0987654321");

    /* 4. Người khác không đặt được đúng ô đó */
    const clash = await engine.holdSlots(
      [{ ...COURTS[0], date: DATE, slotIndex: 8 }],
      "sess2",
      { transactionCode: "WSB_CLASH", userName: "C", phone: "0", totalPrice: 139000, dates: [DATE] }
    );
    assert.equal(clash.success, false);
    assert.match(clash.conflicts[0], /Sân 1/);

    /* 5. Thanh toán */
    const paid = await confirmPaidOrder(db, "WSB_SMOKE", { amount: 278000 });
    assert.equal(paid.success, true);

    ({ occupied, grid } = await readAndBuild());
    assert.equal(grid.cluster1[0][8].status, SLOT_STATUS.BOOKED);

    /* 6. Sweeper KHÔNG được nhả booking đã thanh toán */
    const doc = await db.collection(COURT_DAYS).findOne({});
    assert.equal(doc.slots["8"].holdExpiresAt, undefined);

    /* 7. Chỉ tồn tại đúng 1 document, chứa đúng 2 ô */
    assert.equal(await db.collection(COURT_DAYS).countDocuments(), 1);
    assert.equal(Object.keys(doc.slots).length, 2, "ô trống không bao giờ được lưu");
  });

  it("huỷ đơn -> ngày trở lại rỗng hoàn toàn, lưới hiện trống lại", async () => {
    const hold = await engine.holdSlots(
      [{ ...COURTS[0], date: DATE, slotIndex: 8 }],
      "s",
      { transactionCode: "WSB_CANCEL", userName: "D", phone: "0", totalPrice: 139000, dates: [DATE] }
    );
    await engine.cancelBooking({ holdId: hold.holdId }, "hết giờ");

    assert.equal(await db.collection(COURT_DAYS).countDocuments(), 0);

    const occupied = await engine.listOccupied({ facilities: ["CN NVL"], dates: [DATE] });
    const grid = buildGridByCluster(COURTS, occupied, DATE);
    assert.equal(grid.cluster1[0][8].status, "empty");
  });

  it("assertIndexes pass sau khi ensureIndexes", async () => {
    await assertIndexes(db);
  });
});
