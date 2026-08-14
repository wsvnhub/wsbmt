import { MongoClient } from "mongodb";
import { config } from "dotenv";

import { SLOTS_PER_CLUSTER, SLOT_STATUS } from "./bookingConstants.js";
import { COURT_DAYS, toBookingDate } from "./courtDays.js";

config();

/**
 * Thống kê lấp đầy theo chi nhánh, chạy hằng đêm qua cron (auto.sh).
 *
 * ĐẢO NGƯỢC CÁCH TÍNH so với bản cũ. Trước đây nó duyệt các khoá số của từng
 * document dày rồi đếm ô có `status === "empty"`. Trong mô hình sparse, ô trống
 * KHÔNG TỒN TẠI, nên phép đếm đó sẽ trả về 0 và không ai phát hiện ra — dashboard
 * cứ hiển thị 0 hàng tháng trời.
 *
 *   tổng số ô = số sân × 22
 *   ô trống   = tổng − (số ô đã bị chiếm)
 *
 * Bản cũ còn có một lỗi nữa: `{ createdAt: { $gte: todayStr, $lte: todayStr } }`
 * so sánh TỪ ĐIỂN trên chuỗi "Fri Aug 14 2026". Với `date` dạng YYYY-MM-DD thì
 * so sánh chuỗi trùng với so sánh thời gian.
 */
async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(process.env.DB || undefined);

    const today = toBookingDate(new Date());
    const now = new Date();

    const branches = await db.collection("facilities").find({}).toArray();
    const courts = await db.collection("courts").find({}).toArray();

    // Tổng số ô của mỗi chi nhánh là một hằng số của cấu hình, không phải thứ
    // đếm được từ dữ liệu nữa.
    const stats = {};
    for (const branch of branches) {
      const branchCourts = courts.filter((c) => c.facilitiyId === branch.id);
      stats[branch.id] = {
        branchId: branch.id,
        branchName: branch.name,
        courtsCount: branchCourts.length,
        totalSlotsCount: branchCourts.length * SLOTS_PER_CLUSTER,
        bookedSlotsCount: 0,
        fixedSlotsCount: 0,
        passSlotsCount: 0,
        heldSlotsCount: 0,
        emptySlotsCount: 0,
      };
    }

    const docs = await db
      .collection(COURT_DAYS)
      .find({ date: today }, { projection: { facility: 1, slots: 1 } })
      .toArray();

    for (const doc of docs) {
      const s = stats[doc.facility];
      if (!s) continue; // chi nhánh đã ngừng hoạt động

      for (const slot of Object.values(doc.slots || {})) {
        switch (slot.status) {
          case SLOT_STATUS.BOOKED:
            s.bookedSlotsCount++;
            break;
          case SLOT_STATUS.FIXED:
            s.fixedSlotsCount++;
            break;
          case SLOT_STATUS.PASS:
            s.passSlotsCount++;
            break;
          case SLOT_STATUS.WAIT: {
            // Hold đã hết hạn được tính là TRỐNG, giống hệt cách đường đọc và
            // đường claim đối xử với nó.
            const expiry = slot.holdExpiresAt instanceof Date ? slot.holdExpiresAt.getTime() : 0;
            if (expiry > now.getTime()) s.heldSlotsCount++;
            break;
          }
        }
      }
    }

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    const documents = Object.values(stats).map((b) => {
      const occupied = b.bookedSlotsCount + b.fixedSlotsCount + b.passSlotsCount + b.heldSlotsCount;
      return {
        date: midnight,
        branchId: b.branchId,
        branchName: b.branchName,
        stats: {
          // Suy ra, không đếm được từ dữ liệu.
          emptySlotsCount: Math.max(0, b.totalSlotsCount - occupied),
          bookedSlotsCount: b.bookedSlotsCount,
          fixedSlotsCount: b.fixedSlotsCount,
          passSlotsCount: b.passSlotsCount,
          heldSlotsCount: b.heldSlotsCount,
          totalSlotsCount: b.totalSlotsCount,
        },
        createdAt: new Date(),
      };
    });

    if (documents.length === 0) {
      console.log(`Ngày ${new Date().toLocaleString("vi-VN")}: không có chi nhánh nào để thống kê.`);
      return;
    }

    const statsCollection = db.collection("branch_stats");
    await statsCollection.deleteMany({ date: midnight });
    const result = await statsCollection.insertMany(documents);

    console.log(
      `Ngày ${new Date().toLocaleString("vi-VN")}: đã lưu ${result.insertedCount} bản ghi thống kê ` +
      `(${docs.length} court_days của ngày ${today}).`
    );
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error("countTimeslots thất bại:", err);
  process.exit(1);
});
