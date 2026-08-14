import { MongoClient } from "mongodb";
import { config } from "dotenv";

import { generateTimeArray } from "./genTimeSlotsByJson.js";
import { COURT_DAYS } from "./courtDays.js";
import { SLOT_STATUS } from "./bookingConstants.js";

config();

/**
 * ROLLBACK: dựng lại `timeslots` (dày, kiểu cũ) từ `court_days` (sparse).
 *
 *   node utils/rebuildLegacyTimeslots.js --from=2026-08-01 --to=2026-12-31
 *   node utils/rebuildLegacyTimeslots.js --from=... --to=... --apply
 *
 * Vì sao cần script này thay vì "cứ giữ nguyên timeslots làm bản dự phòng":
 * cả server.js lẫn server-updated.js đều mount CÙNG một Next handler, nên
 * /api/booking, /api/verify-status, /api/time-slots... là dùng chung — không thể
 * có "route cũ cho server cũ, route mới cho server mới". Rollback bắt buộc là
 * rollback code, và khi đó `timeslots` đã lạc hậu kể từ lúc migrate: mọi booking
 * phát sinh sau đó sẽ biến mất và ô lại bán được lần nữa — tức là rollback tự nó
 * gây đặt trùng hàng loạt. Script này dựng lại dữ liệu tươi từ nguồn mới.
 *
 * PHẢI diễn tập trước khi cần dùng thật.
 */

const APPLY = process.argv.includes("--apply");
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : null;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-08-14" -> "Fri Aug 14 2026", đúng định dạng Date.prototype.toDateString()
 * mà hệ cũ dùng làm khoá `createdAt` (ngày được đệm 0: "Tue Aug 04 2026").
 *
 * Dựng bằng UTC chứ không qua giờ địa phương, để script chạy ở múi giờ nào cũng
 * ra cùng một chuỗi.
 */
export function toLegacyDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAY_NAMES[dt.getUTCDay()]} ${MONTH_NAMES[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
}

function eachDate(from, to) {
  const out = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function run() {
  const from = arg("from");
  const to = arg("to");
  if (!from || !to) {
    console.error("Cần --from=YYYY-MM-DD và --to=YYYY-MM-DD");
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.DB || undefined);

  const courts = await db.collection("courts").find({}).toArray();
  const dates = eachDate(from, to);

  // Nạp toàn bộ ô đã bị chiếm trong khoảng, đánh index theo (court, date).
  const occupied = new Map();
  const cursor = db.collection(COURT_DAYS).find({ date: { $gte: from, $lte: to } });
  for await (const doc of cursor) {
    occupied.set(`${doc.facility}|${doc.courtId}|${doc.date}`, doc.slots || {});
  }

  const legacyDocs = [];
  for (const date of dates) {
    const legacyDate = toLegacyDate(date);

    for (const court of courts) {
      const template = generateTimeArray(court.timeClusterId); // mảng 22 ô trống
      const taken = occupied.get(`${court.facilitiyId}|${court.id}|${date}`) || {};

      const cells = template.map((cell, idx) => {
        const hit = taken[String(idx)];
        if (!hit) return cell;
        return {
          ...cell,
          facility: court.facilitiyId,
          court: court.name,
          status: hit.status === SLOT_STATUS.WAIT ? "wait" : hit.status,
          bookedBy: hit.bookedBy || { name: "", phone: "" },
          isFixed: Boolean(hit.isFixed),
          availability: false,
        };
      });

      legacyDocs.push({
        facility: court.facilitiyId,
        courtId: court.id,
        court: court.name,
        timeClusterId: court.timeClusterId,
        // Spread mảng vào object để tái tạo đúng khoá số "0".."21" của hệ cũ.
        ...cells,
        createdAt: legacyDate,
      });
    }
  }

  const occupiedCount = [...occupied.values()].reduce((n, s) => n + Object.keys(s).length, 0);
  console.log("\n=== ROLLBACK: court_days -> timeslots ===");
  console.log(`Khoảng ngày        : ${from} .. ${to} (${dates.length} ngày)`);
  console.log(`Số sân             : ${courts.length}`);
  console.log(`Ô đã bị chiếm      : ${occupiedCount}`);
  console.log(`Document sẽ ghi ra : ${legacyDocs.length}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — không ghi gì. Chạy lại với --apply để thực hiện.");
    console.log("Ví dụ document đầu tiên:");
    console.log(JSON.stringify(legacyDocs[0], null, 2).slice(0, 800));
    await client.close();
    return;
  }

  const legacyDates = dates.map(toLegacyDate);
  console.log("\nĐang xoá timeslots cũ trong khoảng ...");
  const del = await db.collection("timeslots").deleteMany({ createdAt: { $in: legacyDates } });
  console.log(`  đã xoá ${del.deletedCount}`);

  console.log("Đang ghi timeslots ...");
  await db.collection("timeslots").insertMany(legacyDocs, { ordered: false });
  console.log(`Xong. Đã ghi ${legacyDocs.length} document.`);

  await client.close();
}

if (process.argv[1] && process.argv[1].endsWith("rebuildLegacyTimeslots.js")) {
  run().catch((err) => {
    console.error("Rollback thất bại:", err);
    process.exit(1);
  });
}

export { run };
