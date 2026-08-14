import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractOccupiedSlots, parseLegacyDate } from "../migrateToSparseRows.js";
import { toLegacyDate } from "../rebuildLegacyTimeslots.js";
import { generateTimeArray } from "../genTimeSlotsByJson.js";
import { SLOTS_PER_CLUSTER } from "../bookingConstants.js";

/**
 * Dựng một document `timeslots` đúng hình dạng production: khoá số "0".."21" ở
 * CẤP CAO NHẤT (hệ quả của việc insertTimeSlots.js:31 spread một MẢNG vào một
 * object literal).
 */
function legacyDoc({ occupied = {}, createdAt = "Sat Mar 14 2026" } = {}) {
  const cells = generateTimeArray("cluster1");
  const doc = {
    id: "x",
    facility: "CN NVL",
    courtId: "NVL-2",
    court: "Sân 2",
    timeClusterId: "cluster1",
    ...cells,
    createdAt,
  };
  for (const [idx, patch] of Object.entries(occupied)) {
    doc[idx] = { ...doc[idx], ...patch };
  }
  return doc;
}

describe("parseLegacyDate", () => {
  it("đổi được toDateString() sang YYYY-MM-DD", () => {
    assert.equal(parseLegacyDate("Sat Mar 14 2026"), "2026-03-14");
    assert.equal(parseLegacyDate("Tue Aug 04 2026"), "2026-08-04");
    assert.equal(parseLegacyDate("Thu Jan 01 2026"), "2026-01-01");
  });

  it("trả null cho đầu vào rác thay vì đoán bừa", () => {
    // Đoán bừa ở đây nghĩa là gán booking sang nhầm ngày.
    assert.equal(parseLegacyDate("2026-03-14"), null);
    assert.equal(parseLegacyDate(""), null);
    assert.equal(parseLegacyDate(undefined), null);
    assert.equal(parseLegacyDate("Sat Xxx 14 2026"), null);
  });
});

describe("toLegacyDate", () => {
  it("là nghịch đảo của parseLegacyDate", () => {
    for (const iso of ["2026-01-01", "2026-03-14", "2026-08-04", "2026-12-31"]) {
      assert.equal(parseLegacyDate(toLegacyDate(iso)), iso, `round-trip hỏng ở ${iso}`);
    }
  });

  it("khớp đúng định dạng toDateString() thật", () => {
    assert.equal(toLegacyDate("2026-08-14"), new Date(2026, 7, 14).toDateString());
    assert.equal(toLegacyDate("2026-08-04"), new Date(2026, 7, 4).toDateString());
  });
});

describe("extractOccupiedSlots", () => {
  it("bỏ HẾT ô trống — đây chính là khoản giảm dung lượng", () => {
    const doc = legacyDoc();
    const { slots } = extractOccupiedSlots(doc);
    assert.deepEqual(slots, {}, `${SLOTS_PER_CLUSTER} ô trống phải sinh ra 0 mục`);
  });

  it("giữ ô booked kèm bookedBy", () => {
    const doc = legacyDoc({
      occupied: { 8: { status: "booked", bookedBy: { name: "An", phone: "0900" }, isFixed: false } },
    });
    const { slots } = extractOccupiedSlots(doc);

    assert.deepEqual(Object.keys(slots), ["8"]);
    assert.equal(slots["8"].status, "booked");
    assert.equal(slots["8"].bookedBy.name, "An");
  });

  it("loại from/to/hour/availability (suy ra được từ timeSlots.json)", () => {
    const doc = legacyDoc({ occupied: { 8: { status: "booked" } } });
    const { slots } = extractOccupiedSlots(doc);

    for (const dropped of ["from", "to", "hour", "availability", "index"]) {
      assert.equal(slots["8"][dropped], undefined, `${dropped} không được lưu`);
    }
  });

  it("giữ fixed và pass", () => {
    const doc = legacyDoc({
      occupied: { 3: { status: "fixed", isFixed: true }, 4: { status: "pass" } },
    });
    const { slots } = extractOccupiedSlots(doc);
    assert.deepEqual(Object.keys(slots).sort(), ["3", "4"]);
    assert.equal(slots["3"].isFixed, true);
  });

  it("bỏ qua ô 'wait' và báo cáo lại", () => {
    // Hold chưa thanh toán của hệ cũ: hạn của chúng là một setTimeout trong
    // tiến trình đã chết, không có hạn thật để mang sang.
    const doc = legacyDoc({ occupied: { 5: { status: "wait" }, 6: { status: "booked" } } });
    const { slots, skippedWait } = extractOccupiedSlots(doc);

    assert.deepEqual(Object.keys(slots), ["6"]);
    assert.equal(skippedWait.length, 1);
    assert.equal(skippedWait[0].slotIndex, 5);
  });

  it("bỏ qua field không phải ô (id, facility, createdAt...)", () => {
    const doc = legacyDoc({ occupied: { 0: { status: "booked" } } });
    const { slots } = extractOccupiedSlots(doc);
    assert.deepEqual(Object.keys(slots), ["0"], "chỉ khoá số 0..21 mới là ô");
  });

  it("bỏ qua khoá số ngoài phạm vi 0..21", () => {
    const doc = legacyDoc();
    doc["99"] = { status: "booked" };
    doc["-1"] = { status: "booked" };
    const { slots } = extractOccupiedSlots(doc);
    assert.deepEqual(slots, {});
  });
});

describe("độ lớn dữ liệu", () => {
  it("một ngày kín lịch chỉ lưu số ô thực đặt, không phải 22", () => {
    const occupied = {};
    for (let i = 8; i < 14; i++) occupied[i] = { status: "booked", bookedBy: { name: "A", phone: "1" } };

    const { slots } = extractOccupiedSlots(legacyDoc({ occupied }));
    assert.equal(Object.keys(slots).length, 6);

    const legacyBytes = JSON.stringify(legacyDoc({ occupied })).length;
    const sparseBytes = JSON.stringify({
      facility: "CN NVL", courtId: "NVL-2", court: "Sân 2",
      timeClusterId: "cluster1", date: "2026-03-14", slots, version: 1,
    }).length;

    assert.ok(
      sparseBytes < legacyBytes / 2,
      `sparse (${sparseBytes}B) phải nhỏ hơn nửa legacy (${legacyBytes}B) ngay cả khi 6/22 ô đã đặt`
    );
  });
});
