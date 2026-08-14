import { MongoClient } from "mongodb";
import { config } from "dotenv";

import { SLOTS_PER_CLUSTER, SLOT_STATUS } from "./bookingConstants.js";
import { COURT_DAYS, ensureIndexes } from "./courtDays.js";

config();

/**
 * MIGRATION: `timeslots` (dày) -> `court_days` (sparse).
 *
 *   node utils/migrateToSparseRows.js            # dry-run, không ghi gì
 *   node utils/migrateToSparseRows.js --apply    # ghi thật
 *
 * Idempotent: chạy lại nhiều lần cho cùng kết quả (`court_days` bị dựng lại từ
 * đầu mỗi lần). Collection `timeslots` KHÔNG bị đụng tới, nó là ảnh chụp để
 * rollback — xem utils/rebuildLegacyTimeslots.js.
 *
 * Chạy trên BẢN SAO của DB production trước khi chạy thật.
 */

const APPLY = process.argv.includes("--apply");

const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/**
 * "Sat Mar 14 2026" -> "2026-03-14".
 *
 * Tách trực tiếp từ chuỗi, KHÔNG đi qua `new Date()`. Chuỗi cũ được sinh bằng
 * toDateString() theo giờ địa phương của tiến trình tạo ra nó; nếu parse rồi
 * format lại qua một múi giờ khác thì ngày có thể lệch một đơn vị, và trong mô
 * hình sparse một ngày lệch là một document mới — tức bán cùng một ô hai lần.
 */
export function parseLegacyDate(str) {
  if (typeof str !== "string") return null;
  const m = str.trim().match(/^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (!m) return null;
  const [, mon, day, year] = m;
  const mm = MONTHS[mon];
  if (!mm) return null;
  return `${year}-${mm}-${String(day).padStart(2, "0")}`;
}

/** Ô nào cần chuyển sang mô hình mới. Ô trống thì không tồn tại. */
function isOccupied(status) {
  return (
    status === SLOT_STATUS.BOOKED ||
    status === SLOT_STATUS.FIXED ||
    status === SLOT_STATUS.PASS
  );
}

/**
 * Trích các ô đã bị chiếm từ một document `timeslots` cũ (khoá số "0".."21" ở
 * cấp cao nhất — hệ quả của việc insertTimeSlots.js spread một MẢNG vào object).
 */
export function extractOccupiedSlots(legacyDoc) {
  const slots = {};
  const skippedWait = [];

  for (const [key, value] of Object.entries(legacyDoc)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= SLOTS_PER_CLUSTER) continue;
    if (!value || typeof value !== "object") continue;

    if (value.status === "wait") {
      // Hold chưa thanh toán của hệ cũ. Hạn của chúng là một setTimeout trong
      // tiến trình đã chết từ lâu, nên không có hạn thật để mang sang. Bỏ qua
      // và báo số lượng để người vận hành đối chiếu.
      skippedWait.push({ courtId: legacyDoc.courtId, date: legacyDoc.createdAt, slotIndex: idx });
      continue;
    }

    if (!isOccupied(value.status)) continue;

    slots[String(idx)] = {
      status: value.status,
      isFixed: Boolean(value.isFixed),
      bookedBy: {
        name: String(value.bookedBy?.name ?? ""),
        phone: String(value.bookedBy?.phone ?? ""),
      },
      // from/to/hour/availability CỐ TÌNH bị loại: suy ra được từ
      // data/timeSlots.json theo (timeClusterId, slotIndex). Đây là phần lớn
      // khoản giảm dung lượng.
    };
  }

  return { slots, skippedWait };
}

/** Gộp hai bản ghi ô cho cùng một vị trí, ưu tiên bản "nặng" hơn. */
function mergeSlot(a, b) {
  if (!a) return b;
  if (!b) return a;
  const rank = { [SLOT_STATUS.BOOKED]: 3, [SLOT_STATUS.FIXED]: 2, [SLOT_STATUS.PASS]: 1 };
  return (rank[b.status] || 0) > (rank[a.status] || 0) ? b : a;
}

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.DB || undefined);

  const stats = {
    legacyDocs: 0,
    unparsableDates: 0,
    duplicateCourtDays: 0,
    slotConflicts: 0,
    skippedWaitSlots: 0,
    outputDocs: 0,
    outputSlots: 0,
    byStatus: {},
  };

  const cursor = db.collection("timeslots").find({});
  /** @type {Map<string, any>} */
  const merged = new Map();

  for await (const doc of cursor) {
    stats.legacyDocs++;

    const date = parseLegacyDate(doc.createdAt);
    if (!date) {
      stats.unparsableDates++;
      console.warn(`  ! không parse được createdAt: ${JSON.stringify(doc.createdAt)} (courtId=${doc.courtId})`);
      continue;
    }

    const { slots, skippedWait } = extractOccupiedSlots(doc);
    stats.skippedWaitSlots += skippedWait.length;

    const key = `${doc.facility}|${doc.courtId}|${date}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        facility: doc.facility,
        courtId: doc.courtId,
        court: doc.court || "",
        timeClusterId: doc.timeClusterId,
        date,
        slots,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      continue;
    }

    // Chưa từng có unique index và insertTimeslots/insertCustomDateTimeslots đều
    // chạy lại được, nên rất có thể đang tồn tại document trùng cho cùng
    // sân-ngày. Gộp lại, ưu tiên ô có trạng thái "nặng" hơn.
    stats.duplicateCourtDays++;
    for (const [idx, slot] of Object.entries(slots)) {
      if (existing.slots[idx] && existing.slots[idx].status !== slot.status) {
        stats.slotConflicts++;
        console.warn(
          `  ! xung đột ${doc.facility}/${doc.courtId} ${date} ô ${idx}: ` +
          `"${existing.slots[idx].status}" vs "${slot.status}" -> giữ bản nặng hơn`
        );
      }
      existing.slots[idx] = mergeSlot(existing.slots[idx], slot);
    }
  }

  // Ngày không còn ô nào bị chiếm thì KHÔNG tạo document — đó chính là điểm
  // mấu chốt của mô hình sparse.
  const output = [...merged.values()].filter((d) => Object.keys(d.slots).length > 0);

  stats.outputDocs = output.length;
  for (const d of output) {
    for (const s of Object.values(d.slots)) {
      stats.outputSlots++;
      stats.byStatus[s.status] = (stats.byStatus[s.status] || 0) + 1;
    }
  }

  console.log("\n=== KẾT QUẢ MIGRATION ===");
  console.log(`Document timeslots đọc vào : ${stats.legacyDocs}`);
  console.log(`  ngày không parse được    : ${stats.unparsableDates}`);
  console.log(`  sân-ngày bị trùng (gộp)  : ${stats.duplicateCourtDays}`);
  console.log(`  ô xung đột khi gộp       : ${stats.slotConflicts}`);
  console.log(`  ô "wait" bị bỏ qua       : ${stats.skippedWaitSlots}`);
  console.log(`Document court_days ghi ra : ${stats.outputDocs}`);
  console.log(`  tổng số ô bị chiếm       : ${stats.outputSlots}`);
  console.log(`  theo trạng thái          : ${JSON.stringify(stats.byStatus)}`);

  const reduction = stats.legacyDocs
    ? (100 * (1 - stats.outputDocs / stats.legacyDocs)).toFixed(1)
    : "0";
  console.log(`Giảm số document           : ${reduction}%`);
  console.log(`Ô trống trước / sau        : ${stats.legacyDocs * SLOTS_PER_CLUSTER - stats.outputSlots} / 0`);

  if (!APPLY) {
    console.log("\nDRY-RUN — không ghi gì. Chạy lại với --apply để thực hiện.");
    await client.close();
    return;
  }

  console.log("\nĐang ghi court_days ...");
  // Dựng lại từ đầu để migration idempotent. An toàn vì `timeslots` vẫn nguyên
  // vẹn làm nguồn.
  await db.collection(COURT_DAYS).drop().catch(() => {});
  if (output.length > 0) {
    await db.collection(COURT_DAYS).insertMany(output, { ordered: false });
  }

  console.log("Đang tạo index + validator ...");
  await ensureIndexes(db);

  const written = await db.collection(COURT_DAYS).countDocuments();
  console.log(`Xong. ${written} document trong ${COURT_DAYS}.`);

  if (written !== stats.outputDocs) {
    console.error(`CẢNH BÁO: ghi ${written} nhưng dự kiến ${stats.outputDocs}`);
    process.exitCode = 1;
  }

  await client.close();
}

// Chỉ chạy khi được gọi trực tiếp, để test import được các hàm ở trên.
if (process.argv[1] && process.argv[1].endsWith("migrateToSparseRows.js")) {
  run().catch((err) => {
    console.error("Migration thất bại:", err);
    process.exit(1);
  });
}

export { run };
