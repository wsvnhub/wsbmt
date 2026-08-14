import timeSlotsByCluster from "../data/timeSlots.json" with { type: "json" };

/**
 * Dựng lưới sân từ dữ liệu SPARSE của server.
 *
 * Server chỉ gửi hai thứ:
 *   - `courts`  : bộ khung (sân nào, thuộc chi nhánh nào, cluster nào)
 *   - `occupied`: CHỈ những ô đã bị chiếm
 *
 * Ô trống không được lưu trong DB và cũng không truyền qua mạng — chúng được
 * dựng ở đây từ data/timeSlots.json, vốn đã là nguồn duy nhất sinh ra các cột
 * của bảng (components/ScheduleTable.tsx). Đây là chỗ khoản giảm dung lượng
 * được "hoàn nguyên" mà UI không phải đổi hình dạng dữ liệu.
 *
 * Đầu ra giữ ĐÚNG hình dạng row mà UI đang dùng (khoá số 0..21 ngay trên object
 * row), nên ScheduleTable và bộ merge delta chạy nguyên như cũ.
 *
 * File này là .js (không phải .ts) để bộ test chạy bằng `node --test` import
 * được — tsconfig có allowJs nên phía Next vẫn dùng bình thường.
 *
 * @typedef {{ facility: string, courtId: string, court: string, cluster: string }} CourtMeta
 * @typedef {{ facility: string, courtId: string, cluster: string, date: string,
 *             slotIndex: number, status: string, isFixed?: boolean,
 *             bookedBy?: { name: string, phone: string } }} OccupiedCell
 */

/**
 * Ô trống: dựng từ timeSlots.json, không đến từ DB.
 * @param {CourtMeta} court
 * @param {string} date
 * @param {number} slotIndex
 */
export function makeEmptyCell(court, date, slotIndex) {
  const list = timeSlotsByCluster[court.cluster];
  const entry = list?.[slotIndex];
  const [from = "", to = ""] = entry ? entry.time.split("-") : [];

  return {
    facility: court.facility,
    court: court.court,
    from: from.trim(),
    to: to.trim(),
    hour: 1,
    status: "empty",
    bookedBy: { name: "", phone: "" },
    isFixed: false,
    availability: true,
    id: court.courtId,
    index: { columnIndex: slotIndex, createdAt: date, cluster: court.cluster },
  };
}

/**
 * Dựng lưới cho MỘT ngày, gom theo cluster — đúng hình dạng `facilities` mà
 * hooks/useBooking.ts giữ trong state.
 *
 * @param {CourtMeta[]} courts
 * @param {OccupiedCell[]} occupied
 * @param {string} date
 */
export function buildGridByCluster(courts, occupied, date) {
  // Đánh index ô đã chiếm theo (sân, ô) để tra O(1) thay vì quét lại mảng.
  const taken = new Map();
  for (const cell of occupied) {
    if (cell.date !== date) continue;
    taken.set(`${cell.facility}|${cell.courtId}|${cell.slotIndex}`, cell);
  }

  /** @type {Record<string, any[]>} */
  const byCluster = {};

  for (const court of courts) {
    const list = timeSlotsByCluster[court.cluster];
    if (!list) continue;

    const row = {
      facility: court.facility,
      courtId: court.courtId,
      court: court.court,
      timeClusterId: court.cluster,
      createdAt: date,
    };

    for (let i = 0; i < list.length; i++) {
      const hit = taken.get(`${court.facility}|${court.courtId}|${i}`);
      const cell = makeEmptyCell(court, date, i);

      if (hit) {
        cell.status = hit.status;
        cell.isFixed = Boolean(hit.isFixed);
        cell.availability = false;
        // bookedBy chỉ có khi server xác định người xem là admin đã xác thực.
        if (hit.bookedBy) cell.bookedBy = hit.bookedBy;
      }
      row[i] = cell;
    }

    (byCluster[court.cluster] ||= []).push(row);
  }

  // Thứ tự sân ổn định, không phụ thuộc thứ tự Mongo trả về.
  for (const rows of Object.values(byCluster)) {
    rows.sort(
      (a, b) => a.facility.localeCompare(b.facility) || a.courtId.localeCompare(b.courtId)
    );
  }

  return byCluster;
}

/**
 * Dựng lưới cho NHIỀU ngày — hình dạng app/admin/useAdmin.ts dùng:
 * `{ [date]: { [cluster]: GridRow[] } }`
 *
 * @param {CourtMeta[]} courts
 * @param {OccupiedCell[]} occupied
 * @param {string[]} dates
 */
export function buildGridByDate(courts, occupied, dates) {
  /** @type {Record<string, Record<string, any[]>>} */
  const out = {};
  for (const date of dates) {
    out[date] = buildGridByCluster(courts, occupied, date);
  }
  return out;
}

/**
 * Đọc một ô an toàn.
 *
 * ScheduleTable.tsx truy cập thẳng `record[columnIndex].from` và
 * `value.bookedBy.name`; một ô thiếu sẽ ném lỗi ngay trong hàm render của antd
 * và làm TRẮNG CẢ BẢNG. Mọi nơi đọc ô đều nên đi qua đây.
 */
export function safeCell(row, slotIndex, cluster) {
  const cell = row?.[slotIndex];
  if (cell) return cell;
  if (!row?.facility || !row?.courtId) return undefined;

  return makeEmptyCell(
    {
      facility: row.facility,
      courtId: row.courtId,
      court: row.court || "",
      cluster: cluster || row.timeClusterId || "cluster1",
    },
    row.createdAt || "",
    slotIndex
  );
}
