import { createServer } from "node:http";
import { config } from "dotenv";
import { MongoClient } from "mongodb";
import next from "next";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import BookingEngine from "./engine/bookingEngine.js";
import { createLarkRecord } from "./utils/lark.js";
import { logger, errorLogger, larkLogger } from "./utils/logger.js";
import { verifyAdminPassword, isAdminSocket } from "./utils/adminAuth.js";
import { SLOT_STATUS } from "./utils/bookingConstants.js";
import {
  adminClaimGroup,
  adminReleaseGroup,
  getSlotTime,
  groupSlotsForClaim,
  slotIndexFromTime,
  toBookingDate,
} from "./utils/courtDays.js";

config();

const { MONGODB_URI, DB, NODE_ENV, PORT } = process.env;

const dev = NODE_ENV !== "production";
const hostname = "localhost";
const port = PORT || 3000;
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

/** Chặn range vô hạn từ client. Bản cũ không giới hạn gì. */
const MAX_RANGE_DAYS = 62;

let mongoClient;
let mongoPool;
let bookingEngine;

const initDB = async () => {
  // `isConnected()` đã bị bỏ từ driver v4 (repo đang dùng v6) — gọi nó sẽ ném
  // TypeError. Kiểm tra biến đã khởi tạo hay chưa là đủ.
  if (mongoClient && mongoPool) {
    return { mongoPool, mongoClient };
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await mongoClient.connect();
    mongoPool = mongoClient.db(DB || "ways");

    bookingEngine = new BookingEngine(mongoPool);
    // PHẢI await. Hàm này kiểm tra unique index có thật sự tồn tại không và ném
    // lỗi nếu không — thiếu nó thì chẳng có gì chặn đặt trùng sân, nên thà không
    // khởi động còn hơn phục vụ trong tình trạng đó.
    await bookingEngine.start();

    return { mongoPool, mongoClient };
  } catch (error) {
    console.error("❌ Mongo/engine init error:", error);
    throw error;
  }
};

/**
 * Dựng một ô ĐẦY ĐỦ để gửi trong delta.
 *
 * Trong mô hình sparse, "ô vừa trống lại" không còn document nào để gửi. Nhưng
 * client KHÔNG được nhận `null` (ScheduleTable sẽ throw ở `value.from`) cũng
 * không được nhận thiếu (ô sẽ kẹt trạng thái "đã đặt" cho tới khi tải lại
 * trang). Nên delta luôn mang một ô dựng sẵn.
 *
 * `cluster` là BẮT BUỘC: 4 cluster lệch nhau 10 phút nên chỉ số ô không dùng
 * chung được — ô số 5 là "5:40" ở cluster1 nhưng "6:10" ở cluster4.
 */
const buildDeltaCell = (slot, status, bookedBy) => {
  const { from, to, hour } = getSlotTime(slot.cluster, slot.slotIndex);
  return {
    facility: slot.facility,
    id: slot.courtId,
    court: slot.court,
    from,
    to,
    hour,
    status: status || "empty",
    isFixed: false,
    availability: !status,
    bookedBy: bookedBy || { name: "", phone: "" },
    index: {
      columnIndex: slot.slotIndex,
      createdAt: slot.date,
      cluster: slot.cluster,
    },
  };
};

const attachHelpers = (io) => {
  /**
   * Phát thay đổi ô cho các client khác.
   * @param {boolean} toAll true thì gửi cả cho người vừa thao tác (dùng khi xác
   *   nhận/huỷ, vì người đó cũng cần thấy trạng thái cuối).
   */
  const broadcastSlotDeltas = (socket, slots, status, toAll = false) => {
    const cells = slots.map((s) => buildDeltaCell(s, status));
    const target = toAll ? io : socket.broadcast;
    target.emit("schedules:updated", cells);
  };
  return { broadcastSlotDeltas };
};

app.prepare().then(async () => {
  const httpServer = createServer(handler);
  const { mongoPool } = await initDB();
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Store active sessions
  const activeSessions = new Map();

  const { broadcastSlotDeltas } = attachHelpers(io);

  /**
   * Ghi một đơn đã thanh toán sang Lark. Lỗi ở đây không được làm hỏng việc xác
   * nhận đơn — tiền đã về rồi.
   */
  const recordLarkBooking = async (schedule) => {
    try {
      await createLarkRecord({
        fields: {
          time_order: Date.now(),
          ND_CK: schedule.transactionCode,
          name: schedule.userName,
          phone: schedule.phone,
          email: schedule.email,
          san: schedule.formateddetails,
          address: Object.values(schedule.address || {}).join(", "),
          date: (schedule.dates || []).join(", "),
          time: schedule.totalHours,
          quantity: (schedule.timeSlots || []).length,
          total_money: schedule.totalPrice,
          voucher_code: schedule.applyDiscount,
          trang_thai: "Đã thanh toán",
          dat_co_dinh: schedule.isFixed ? "True" : "False",
        },
      });
      larkLogger.info(`Lark record created: ${schedule.transactionCode}`);
    } catch (err) {
      errorLogger.error(`Lark error for ${schedule.transactionCode}: ${err.message}`);
    }
  };

  /**
   * Một đơn ĐÃ THANH TOÁN mà không phục vụ được thì phải có NGƯỜI biết. Bản cũ
   * để những ca này rơi vào catch chỉ ghi log (139 dòng "Đơn hàng của bạn đã bị
   * xoá" trong app.log), khách mất tiền mà không ai được báo.
   */
  const notifyPaymentException = async (exception) => {
    errorLogger.error(`PAYMENT EXCEPTION: ${JSON.stringify(exception)}`);
    try {
      await createLarkRecord({
        fields: {
          time_order: Date.now(),
          ND_CK: exception.transactionCode,
          name: exception.userName,
          phone: exception.phone,
          total_money: exception.totalPrice,
          trang_thai: "CẦN XỬ LÝ TAY - đã thu tiền, thiếu sân",
          san: JSON.stringify(exception.missing).slice(0, 500),
        },
      });
    } catch (err) {
      errorLogger.error(`Không gửi được cảnh báo Lark: ${err.message}`);
    }
  };

  io.on("connection", async (socket) => {
    const sessionId = uuidv4();
    activeSessions.set(socket.id, sessionId);

    // Mọi socket bắt đầu là KHÔNG phải admin. Quyền admin chỉ được cấp sau khi
    // xác thực mật khẩu ở phía server qua "admin:auth".
    socket.data.isAdmin = false;

    logger.info(`Client connected: ${socket.id}, Session: ${sessionId}`);

    /**
     * Xác thực admin. Mật khẩu chỉ được so sánh ở server (ADMIN_PASSWORD),
     * không bao giờ gửi xuống client — bản cũ hardcode nó trong bundle.
     */
    socket.on("admin:auth", async ({ password }, callback) => {
      const res = verifyAdminPassword(password);
      if (!res.ok) {
        errorLogger.error(`Admin auth failed from ${socket.id}: ${res.reason}`);
        return callback({ success: false, error: res.reason });
      }
      socket.data.isAdmin = true;
      logger.info(`Admin authenticated: ${socket.id}`);
      return callback({ success: true });
    });

    socket.on("app:info", async (args, callback) => {
      const { selectedDate, isAdmin } = args;

      let facilitiesData = await mongoPool.collection("facilities").find({
        $or: [
          { isAvaliable: true },
          { isAvaliable: { $exists: false } }
        ],
      }).toArray();

      if (!isAdmin) {
        const selectedDateTime = new Date(selectedDate).getTime();
        facilitiesData = facilitiesData.filter(item => {
          const openAtTime = item.openAt ? new Date(item.openAt).getTime() : new Date(item.createdAt).getTime();
          return openAtTime <= selectedDateTime;
        });
      }

      const paymentInfoData = await mongoPool.collection("paymentInfo").find().toArray();

      return callback({ facilities: facilitiesData, paymentInfo: paymentInfoData });
    });

    /**
     * DANH SÁCH Ô ĐÃ ĐẶT
     *
     * Trả về hai phần thay vì nguyên document:
     *   - courts  : bộ khung lưới (sân nào thuộc chi nhánh nào, cluster nào)
     *   - occupied: CHỈ những ô đã bị chiếm
     *
     * Ô trống không được lưu và cũng không được truyền. Client tự dựng 22 ô mỗi
     * sân từ data/timeSlots.json rồi phủ `occupied` lên — xem utils/buildGrid.ts.
     *
     * Bản cũ `find().toArray()` không có $project, trả nguyên document gồm cả 22
     * ô lẫn bookedBy: một range 30 ngày là ~2MB trong một ack frame, và MỌI khách
     * vô danh nhận được tên + số điện thoại của MỌI khách khác.
     */
    socket.on("schedules:list", async ({ facilitiyIds, range, dates }, callback) => {
      try {
        if (!facilitiyIds?.length) return callback({ courts: [], occupied: [], dates: [] });

        // Chuẩn hoá mọi kiểu ngày client gửi lên về YYYY-MM-DD ở SERVER.
        let wanted = [];
        if (dates?.length) {
          wanted = dates.map(toBookingDate);
        } else if (range?.startDate && range?.endDate) {
          const cur = new Date(range.startDate);
          const end = new Date(range.endDate);
          // Chặn range vô hạn: bản cũ không giới hạn gì cả.
          for (let i = 0; cur <= end && i < MAX_RANGE_DAYS; i++) {
            wanted.push(toBookingDate(cur));
            cur.setDate(cur.getDate() + 1);
          }
        }
        if (wanted.length === 0) return callback({ courts: [], occupied: [], dates: [] });

        const courts = await mongoPool
          .collection("courts")
          .find(
            { facilitiyId: { $in: facilitiyIds } },
            { projection: { _id: 0, id: 1, name: 1, facilitiyId: 1, timeClusterId: 1 } }
          )
          .toArray();

        const occupied = await bookingEngine.listOccupied({
          facilities: facilitiyIds,
          dates: wanted,
          // bookedBy CHỈ dành cho admin đã xác thực ở phía server.
          includeBookedBy: isAdminSocket(socket),
        });

        return callback({
          courts: courts.map((c) => ({
            facility: c.facilitiyId,
            courtId: c.id,
            court: c.name,
            cluster: c.timeClusterId,
          })),
          occupied,
          dates: wanted,
        });
      } catch (error) {
        errorLogger.error(`schedules:list error: ${error.message}`);
        return callback({ courts: [], occupied: [], dates: [], error: error.message });
      }
    });

    /**
     * Chuyển ô do client gửi lên sang dạng chuẩn của server.
     *
     * MỌI field định danh đều được server tính lại hoặc kiểm tra; không có gì từ
     * client được tin. Trước đây `...rest` của client được ghi thẳng xuống DB,
     * nên client kiểm soát được cả facility, courtId, ngày và chỉ số ô.
     */
    const normalizeSlots = (rawSlots) =>
      rawSlots.map((slot) => {
        const cluster = slot.index?.cluster || slot.cluster;
        const slotIndex =
          slot.index?.columnIndex ?? slot.slotIndex ?? slotIndexFromTime(cluster, slot.from);

        if (slotIndex === -1 || slotIndex == null) {
          throw new Error(`Không xác định được ô giờ cho ${slot.court} ${slot.from}`);
        }

        return {
          facility: slot.facility,
          courtId: slot.id ?? slot.courtId,
          court: slot.court,
          cluster,
          // Ngày do SERVER chuẩn hoá. Browser gửi toDateString() ở UTC+7 còn
          // container chạy UTC, nên cùng một đêm ra hai chuỗi khác nhau.
          date: toBookingDate(slot.index?.createdAt ?? slot.date),
          slotIndex: Number(slotIndex),
        };
      });

    /** BƯỚC 1: kiểm tra còn trống (tư vấn, không phải quyết định) */
    socket.on("schedules:check-availability", async (payload, callback) => {
      try {
        const details = await bookingEngine.checkAvailability(normalizeSlots(payload.timeSlots));
        return callback({
          success: true,
          available: details.every((d) => d.available),
          details,
        });
      } catch (error) {
        errorLogger.error(`Error checking availability: ${error.message}`);
        return callback({ success: false, error: error.message });
      }
    });

    /** BƯỚC 2: giữ sân */
    const handleHold = async (payload, callback) => {
      try {
        const { timeSlotsData, schedulesData } = payload;
        const sessionIdFromMap = activeSessions.get(socket.id);

        const slots = normalizeSlots(timeSlotsData);

        const result = await bookingEngine.holdSlots(slots, sessionIdFromMap, {
          // Dùng ĐÚNG mã client đã in lên QR. Bản cũ bỏ mã này đi rồi tự sinh
          // `WSB${Date.now()}` khác, nên mã trên QR không bao giờ khớp mã trong DB.
          transactionCode: schedulesData.transactionCode,
          userName: schedulesData.userName,
          phone: schedulesData.phone,
          email: schedulesData.email,
          totalPrice: schedulesData.totalPrice,
          totalHours: schedulesData.totalHours,
          details: schedulesData.details,
          formateddetails: schedulesData.formateddetails,
          dates: schedulesData.dates,
          isFixed: schedulesData.isFixed,
          applyDiscount: schedulesData.applyDiscount,
          address: schedulesData.address,
        });

        if (!result.success) {
          errorLogger.error(`Hold failed: ${result.error} ${JSON.stringify(result.conflicts || [])}`);
          return callback({
            success: false,
            error: result.error,
            conflicts: result.conflicts,
          });
        }

        broadcastSlotDeltas(socket, slots, SLOT_STATUS.WAIT);

        return callback({
          success: true,
          lockId: result.holdId,
          holdId: result.holdId,
          schedulesId: result.scheduleId,
          scheduleId: result.scheduleId,
          transactionCode: result.transactionCode,
          holdExpiresAt: result.holdExpiresAt,
        });
      } catch (error) {
        errorLogger.error(`Error holding slots: ${error.message}`);
        return callback({ success: false, error: error.message });
      }
    };

    socket.on("schedules:lock", handleHold);
    // Endpoint client hiện tại đang dùng — cùng một luồng.
    socket.on("schedules:create", handleHold);

    /** Gia hạn giữ sân */
    socket.on("schedules:extend-lock", async ({ lockId, holdId, minutes = 5 }, callback) => {
      try {
        const result = await bookingEngine.extendLock(holdId || lockId, minutes * 60 * 1000);
        return callback(result);
      } catch (error) {
        errorLogger.error(`Error extending hold: ${error.message}`);
        return callback({ success: false, error: error.message });
      }
    });

    /** BƯỚC 3: xác nhận sau khi tiền về */
    socket.on("schedules:confirm", async ({ transactionCode, paymentInfo }, callback) => {
      try {
        const result = await bookingEngine.confirmBooking(transactionCode, paymentInfo || {});

        if (!result.success) {
          // Đơn đã trả tiền mà không phục vụ được: cảnh báo người thật ngay.
          if (result.needsManualReview) {
            await notifyPaymentException(result.exception);
          }
          return callback(result);
        }

        if (!result.replay && result.schedule) {
          await recordLarkBooking(result.schedule);
          broadcastSlotDeltas(
            socket,
            normalizeSlots(result.schedule.timeSlots || []),
            SLOT_STATUS.BOOKED,
            true
          );
        }

        return callback({
          success: true,
          scheduleId: result.scheduleId,
          transactionCode: result.transactionCode,
        });
      } catch (error) {
        errorLogger.error(`Error confirming booking: ${error.message}`);
        return callback({ success: false, error: error.message });
      }
    });

    /** BƯỚC 4: huỷ */
    socket.on("schedules:cancel", async (payload, callback) => {
      try {
        const { lockId, holdId, scheduleId, transactionCode, reason } = payload;

        const result = await bookingEngine.cancelBooking(
          { holdId: holdId || lockId, scheduleId, transactionCode },
          reason || "User cancelled"
        );

        if (result.success && result.releasedSlots?.length) {
          // Ô vừa TRỐNG LẠI. Trong mô hình sparse không còn document để gửi, nên
          // delta phải mang một ô trống đã dựng sẵn — client không được nhận
          // null (ScheduleTable sẽ throw) cũng không được nhận thiếu (ô sẽ kẹt
          // trạng thái "đã đặt" cho tới khi tải lại trang).
          try {
            broadcastSlotDeltas(socket, normalizeSlots(result.releasedSlots), null, true);
          } catch (e) {
            errorLogger.error(`Không phát được delta huỷ: ${e.message}`);
          }
        }

        return callback(result);
      } catch (error) {
        errorLogger.error(`Error cancelling booking: ${error.message}`);
        return callback({ success: false, error: error.message });
      }
    });


    /**
     * MANUAL BOOKING - Dành cho admin
     */
    socket.on("schedules:manual", async ({ timeSlots, data, action }, callback) => {
      try {
        // Bản cũ nhận lệnh này từ BẤT KỲ socket nào, không kiểm tra gì. Ai cũng
        // emit được {action:"delete"} để nhả toàn bộ sân trong hệ thống.
        if (!isAdminSocket(socket)) {
          errorLogger.error(`Unauthorized schedules:manual từ ${socket.id}`);
          return callback({ success: false, error: "Unauthorized" });
        }

        logger.info(`Manual booking action: ${action} (${timeSlots?.length ?? 0} ô)`);

        const slots = normalizeSlots(timeSlots);
        const groups = groupSlotsForClaim(slots);

        /* ── Nhả ô ─────────────────────────────────────────────────────── */
        if (action === "delete") {
          let released = 0;
          for (const g of groups) {
            const res = await adminReleaseGroup(mongoPool, g, {
              actor: socket.id,
              reason: "admin_manual_delete",
            });
            released += res.released;
          }
          broadcastSlotDeltas(socket, slots, null, true);
          return callback({ success: true, released, timeSlots });
        }

        /* ── Đặt / khoá ô ──────────────────────────────────────────────── */
        const status =
          action === "fixed" ? SLOT_STATUS.FIXED
            : action === "pass" ? SLOT_STATUS.PASS
              : SLOT_STATUS.BOOKED;

        const bookedBy = {
          name: timeSlots[0]?.bookedBy?.name || "",
          phone: timeSlots[0]?.bookedBy?.phone || "",
        };

        // Tất-cả-hoặc-không-gì: claim theo thứ tự chuẩn, gặp lỗi thì hoàn tác
        // những nhóm đã ghi. Bản cũ bỏ qua kết quả updateOne rồi trả
        // success:true, nên admin thấy "thành công" kể cả khi không ô nào đổi.
        const done = [];
        for (const g of groups) {
          const res = await adminClaimGroup(mongoPool, g, {
            status,
            bookedBy,
            isFixed: action === "fixed",
            actor: socket.id,
          });

          if (res.ok) {
            done.push(g);
            continue;
          }

          for (const undo of done) {
            await adminReleaseGroup(mongoPool, undo, {
              actor: socket.id,
              reason: "rollback_manual_partial",
            }).catch(() => {});
          }

          const labels = res.conflicts.map((c) => c.label);
          errorLogger.error(`Manual booking bị chặn: ${labels.join(", ")}`);
          return callback({
            success: false,
            error: `Các ô sau đã có người đặt: ${labels.join(", ")}`,
            rejected: labels,
            conflictDetails: res.conflicts,
          });
        }

        broadcastSlotDeltas(socket, slots, status, true);

        if (action === "add" || action === "fixed") {
          await recordLarkBooking({
            transactionCode: "Đặt thủ công",
            userName: bookedBy.name,
            phone: bookedBy.phone,
            email: "",
            formateddetails: data?.formateddetails?.join(", ") || "",
            address: data?.address || {},
            dates: (data?.dates || []).map((d) => new Date(d).toLocaleDateString("vi-VN")),
            totalHours: data?.totalHours || 0,
            timeSlots,
            totalPrice: data?.totalPrice || 0,
            applyDiscount: "",
            isFixed: action === "fixed",
          });
        }

        return callback({ success: true, timeSlots });
      } catch (error) {
        errorLogger.error(`Manual booking error: ${error.message}`);
        return callback({ success: false, error: error.message });
      }
    });

    socket.on("disconnect", () => {
      logger.info(`Client disconnected: ${socket.id}`);
      activeSessions.delete(socket.id);
      socket.removeAllListeners();
    });
  });

  httpServer
    .once("error", (err) => {
      logger.error(`Server error: ${err}`);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      // Engine KHÔNG dùng transaction: chống trùng dựa vào unique index +
      // single-document atomicity, nên chạy được trên cả standalone lẫn
      // replica set. Xem utils/courtDays.js.
      logger.info("Booking engine sẵn sàng (sparse row, unique index, không transaction)");
    });
});

const shutdown = async (signal) => {
  console.log(`${signal}: đang tắt...`);
  try {
    await bookingEngine?.stop();
    if (mongoClient) await mongoClient.close();
  } catch (err) {
    console.error("Lỗi khi tắt:", err.message);
  }
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));