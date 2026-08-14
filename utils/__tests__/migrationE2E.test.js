import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

import { generateTimeArray } from "../genTimeSlotsByJson.js";
import { extractOccupiedSlots, parseLegacyDate } from "../migrateToSparseRows.js";
import { toLegacyDate } from "../rebuildLegacyTimeslots.js";
import { COURT_DAYS, ensureIndexes, readOccupied, claimGroup } from "../courtDays.js";
import { SLOTS_PER_CLUSTER } from "../bookingConstants.js";

/**
 * Migration end-to-end trên dữ liệu đúng hình dạng và đúng quy mô production
 * (18 sân × 30 ngày × 22 ô), đo luôn mức giảm dung lượng thật.
 *
 *   docker run -d --name wsbmt-test-mongo -p 37017:27017 mongo:5.0
 *   node --test utils/__tests__/migrationE2E.test.js
 */
const URI =
  process.env.MONGO_TEST_URI ||
  "mongodb://127.0.0.1:37017/wsbmt_mig_test?directConnection=true";

const CLUSTERS = ["cluster1", "cluster2", "cluster3", "cluster4"];
const FACILITIES = ["CN NVL", "CN DQH", "CN NQA", "CN HB"];
const DAYS = 30;
const COURTS_PER_FACILITY = 5;   // ~18-20 sân, xấp xỉ production

let client;
let db;
let seeded;

/** Sinh dữ liệu `timeslots` đúng hình dạng production (khoá số ở cấp cao nhất). */
function seedLegacy() {
  const docs = [];
  const courts = [];

  FACILITIES.forEach((facility, fi) => {
    for (let c = 1; c <= COURTS_PER_FACILITY; c++) {
      courts.push({
        facilitiyId: facility,
        id: `${facility.slice(3)}-${c}`,
        name: `Sân ${c}`,
        timeClusterId: CLUSTERS[(fi + c) % 4],
      });
    }
  });

  let occupiedTotal = 0;
  for (let d = 0; d < DAYS; d++) {
    const iso = `2026-08-${String(d + 1).padStart(2, "0")}`;
    const createdAt = toLegacyDate(iso);

    for (const court of courts) {
      const cells = generateTimeArray(court.timeClusterId);
      const doc = {
        id: `${court.id}-${d}`,
        facility: court.facilitiyId,
        courtId: court.id,
        court: court.name,
        timeClusterId: court.timeClusterId,
        ...cells,
        createdAt,
      };

      // Tỉ lệ lấp đầy thực tế: khung tối (ô 14-20) đông, ban ngày thưa.
      for (let i = 0; i < SLOTS_PER_CLUSTER; i++) {
        const isPeak = i >= 14 && i <= 20;
        const fill = isPeak ? 0.7 : 0.08;
        // Giả ngẫu nhiên tất định để test lặp lại được.
        const r = ((d * 31 + i * 17 + court.id.length * 7) % 100) / 100;
        if (r < fill) {
          doc[i] = {
            ...doc[i],
            status: "booked",
            bookedBy: { name: `Khách ${d}-${i}`, phone: "0900000000" },
            availability: false,
          };
          occupiedTotal++;
        }
      }
      docs.push(doc);
    }
  }

  return { docs, courts, occupiedTotal };
}

before(async () => {
  client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db();

  await db.collection("timeslots").drop().catch(() => {});
  await db.collection(COURT_DAYS).drop().catch(() => {});
  await db.collection("courts").drop().catch(() => {});

  seeded = seedLegacy();
  await db.collection("timeslots").insertMany(seeded.docs);
  await db.collection("courts").insertMany(seeded.courts);
});

after(async () => {
  await client?.close();
});

describe("migration e2e", () => {
  let output;

  it("chuyển đổi được toàn bộ timeslots", async () => {
    const merged = new Map();
    let skippedWait = 0;

    for await (const doc of db.collection("timeslots").find({})) {
      const date = parseLegacyDate(doc.createdAt);
      assert.ok(date, `phải parse được ${doc.createdAt}`);

      const { slots, skippedWait: sw } = extractOccupiedSlots(doc);
      skippedWait += sw.length;

      const key = `${doc.facility} ${doc.courtId} ${date}`;
      if (!merged.has(key)) {
        merged.set(key, {
          facility: doc.facility, courtId: doc.courtId, court: doc.court,
          timeClusterId: doc.timeClusterId, date, slots, version: 1,
          createdAt: new Date(), updatedAt: new Date(),
        });
      }
    }

    output = [...merged.values()].filter((d) => Object.keys(d.slots).length > 0);
    assert.equal(skippedWait, 0);

    const totalSlots = output.reduce((n, d) => n + Object.keys(d.slots).length, 0);
    assert.equal(totalSlots, seeded.occupiedTotal, "không được mất ô đã đặt nào");
  });

  it("ghi được vào court_days với index + validator", async () => {
    await db.collection(COURT_DAYS).insertMany(output, { ordered: false });
    await ensureIndexes(db);

    const count = await db.collection(COURT_DAYS).countDocuments();
    assert.equal(count, output.length);
  });

  it("giảm rõ rệt dung lượng lưu trữ", async () => {
    const legacy = await db.command({ collStats: "timeslots" });
    const sparse = await db.command({ collStats: COURT_DAYS });

    const pctDocs = (100 * (1 - sparse.count / legacy.count)).toFixed(1);
    const pctSize = (100 * (1 - sparse.size / legacy.size)).toFixed(1);

    console.log(
      `\n    document : ${legacy.count} -> ${sparse.count}  (giảm ${pctDocs}%)\n` +
      `    dung lượng: ${(legacy.size / 1024).toFixed(0)}KB -> ${(sparse.size / 1024).toFixed(0)}KB  (giảm ${pctSize}%)\n` +
      `    ô lưu trữ : ${legacy.count * SLOTS_PER_CLUSTER} -> ${seeded.occupiedTotal}` +
      `  (${(100 * (1 - seeded.occupiedTotal / (legacy.count * SLOTS_PER_CLUSTER))).toFixed(1)}% ô trống không còn được lưu)\n`
    );

    assert.ok(sparse.size < legacy.size / 2, `dung lượng phải giảm >50%, thực tế ${pctSize}%`);
  });

  it("unique index chặn được document sân-ngày trùng", async () => {
    const one = await db.collection(COURT_DAYS).findOne({});
    await assert.rejects(
      () => db.collection(COURT_DAYS).insertOne({
        facility: one.facility, courtId: one.courtId, date: one.date,
        timeClusterId: one.timeClusterId, slots: {},
      }),
      (e) => e.code === 11000
    );
  });

  it("dữ liệu sau migration dùng được ngay: claim ô trống, chặn ô đã đặt", async () => {
    const doc = await db.collection(COURT_DAYS).findOne({ "slots.14": { $exists: true } });
    assert.ok(doc, "phải có ít nhất một ô khung tối đã đặt");

    const free = [...Array(SLOTS_PER_CLUSTER).keys()].find((i) => !doc.slots[String(i)]);
    const g = {
      facility: doc.facility, courtId: doc.courtId, court: doc.court,
      timeClusterId: doc.timeClusterId, date: doc.date,
      slotIndexes: [free],
    };
    const okRes = await claimGroup(db, g, {
      holdId: "E2E", holdExpiresAt: new Date(Date.now() + 60000),
      scheduleId: "s", transactionCode: "WSBE2E", bookedBy: { name: "T", phone: "0" },
    });
    assert.equal(okRes.ok, true, "ô trống phải đặt được");

    const badRes = await claimGroup(db, { ...g, slotIndexes: [14] }, {
      holdId: "E2E2", holdExpiresAt: new Date(Date.now() + 60000),
      scheduleId: "s2", transactionCode: "WSBE2E2", bookedBy: { name: "T", phone: "0" },
    });
    assert.equal(badRes.ok, false, "ô đã đặt phải bị chặn");
  });

  it("payload đọc nhỏ hơn nhiều so với trả nguyên document", async () => {
    const dates = Array.from({ length: DAYS }, (_, d) => `2026-08-${String(d + 1).padStart(2, "0")}`);

    const legacyDates = dates.map(toLegacyDate);
    const legacyPayload = await db.collection("timeslots")
      .find({ facility: { $in: FACILITIES }, createdAt: { $in: legacyDates } }).toArray();

    const sparsePayload = await readOccupied(db, { facilities: FACILITIES, dates });

    const legacyBytes = JSON.stringify(legacyPayload).length;
    const sparseBytes = JSON.stringify(sparsePayload).length;

    console.log(
      `\n    payload schedules:list cho ${DAYS} ngày × ${FACILITIES.length} chi nhánh:\n` +
      `    ${(legacyBytes / 1024).toFixed(0)}KB -> ${(sparseBytes / 1024).toFixed(0)}KB` +
      `  (giảm ${(100 * (1 - sparseBytes / legacyBytes)).toFixed(1)}%)\n`
    );

    assert.ok(sparseBytes < legacyBytes / 3, "payload phải giảm >66%");
  });

  it("khách vô danh KHÔNG nhận được số điện thoại khách khác", async () => {
    const dates = ["2026-08-01"];
    const anon = await readOccupied(db, { facilities: FACILITIES, dates });
    const dump = JSON.stringify(anon);

    assert.ok(anon.length > 0, "phải có ô đã đặt để kiểm tra");
    assert.ok(!dump.includes("0900000000"), "payload công khai chứa số điện thoại!");
    assert.ok(!dump.includes("Khách"), "payload công khai chứa tên khách!");
  });
});
