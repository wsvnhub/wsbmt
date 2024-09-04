import { createServer } from "node:http";
import { CronJob } from "cron";
import { config } from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import next from "next";
import { Server } from "socket.io";
import { insertTimeslots } from "./utils/insertTimeSlots.js";
import axios from "axios";
import { logger } from "./utils/logger.js";

config();
const url =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
};
const data = {
  app_id: process.env.APP_ID,
  app_secret: process.env.APP_SECRET,
};
const app_token = process.env.APP_TOKEN;
const table_id = process.env.TABLE_ID;
async function create_record(new_record) {
  try {
    const response = await axios.post(url, data, { headers });

    // Kiểm tra nếu yêu cầu thành công
    if (response.status !== 200) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    // Lấy dữ liệu từ phản hồi
    const responseData = response.data;

    const url_create_record = `https://open.larksuite.com/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records`;
    const authorizationToken = `Bearer ${responseData.tenant_access_token}`;
    const nextApiHeaders = {
      Authorization: authorizationToken,
      "Content-Type": "application/json",
    };
    const nextResponse = await axios.post(url_create_record, new_record, {
      headers: nextApiHeaders,
    });
    console.log("nextResponse.data---------", nextResponse.data);
    // Trả về dữ liệu phản hồi từ yêu cầu thứ hai
    return nextResponse.data;
  } catch (error) {
    console.error("Error:", error.message);
  }
}
async function update_record(record_id) {
  try {
    const response = await axios.post(url, data, { headers });

    // Kiểm tra nếu yêu cầu thành công
    if (response.status !== 200) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    // Lấy dữ liệu từ phản hồi
    const responseData = response.data;
    const url_create_record = `https://open.larksuite.com/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records/${record_id}`;
    const authorizationToken = `Bearer ${responseData.tenant_access_token}`;
    const nextApiHeaders = {
      Authorization: authorizationToken,
      "Content-Type": "application/json",
    };
    var new_record = {
      fields: {
        trang_thai: "booked",
      },
    };

    const nextResponse = await axios.put(url_create_record, new_record, {
      headers: nextApiHeaders,
    });

    // Trả về dữ liệu phản hồi từ yêu cầu thứ hai
    return nextResponse.data;
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// var record_id = "";
const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000 || process.env.PORT;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();


const initDB = async () => {
  const mongoClient = new MongoClient(process.env.MONGODB_URI);

  try {
    console.log("MongoClient connecting...");
    await mongoClient.connect();
    console.log("Connected to Mongo");
    const mongoPool = mongoClient.db(process.env.DB);
    return { mongoPool, mongoClient };
  } catch (error) {
    logger.error(`MongoClient Error: ${error}`);
    if (mongoClient) {
      await mongoClient.close();
    }
    return null;
  }
};

const { mongoPool, mongoClient } = await initDB();

const job = CronJob.from({
  cronTime: "0 0 1 1 *",
  // cronTime: "0 * * * * *",
  onTick: async function () {
    await insertTimeslots({ db: mongoPool });
    console.log("created 1 year time slots");
  },
  start: false,
  timeZone: "Asia/Ho_Chi_Minh",
});

app.prepare().then(() => {
  const httpServer = createServer(handler);
  job.start();
  console.log("http server started");

  const io = new Server(httpServer);

  const updateTimeSlot = ({ timeSlotsData, collection }) => {
    logger.info(`Updating time slots: ${JSON.stringify(timeSlotsData)}`);
    const updateQuery = timeSlotsData.map((timeSlot) => {
      const { facility, id, index } = timeSlot;
      return collection.updateOne(
        { facility, courtId: id, createdAt: index.createdAt },
        {
          $set: {
            [index.columnIndex]: timeSlot,
          },
        }
      );
    });
    return Promise.allSettled(updateQuery);
  };

  io.on("connection", (socket) => {
    const ip = socket.handshake.headers['x-forwarded-for'] ||
      socket.handshake.address ||
      socket.request.connection.remoteAddress ||
      null;

    logger.info(`User IP ${ip}`);

    socket.on("app:info", async (arg, callback) => {
      const facilities = mongoPool.collection("facilities").find().toArray();
      const paymentInfo = mongoPool.collection("paymentInfo").find().toArray();
      const [facilitiesData, paymentInfoData] = await Promise.allSettled([
        facilities,
        paymentInfo,
      ]);

      return callback({
        facilities: facilitiesData.value,
        paymentInfo: paymentInfoData.value,
      });
    });

    socket.on("schedules:list", async (arg, callback) => {
      const { facilitiyIds, range, dates } = arg;

      const filter = { facility: { $in: facilitiyIds } };
      if (dates.length > 0) {
        filter.createdAt = { $in: dates };
      }
      if (range.startDate && range.endDate) {
        filter.createdAt = {
          $gte: new Date(range.startDate),
          $lte: new Date(range.endDate),
        };
        const data = await mongoPool
          .collection("timeslots")
          .aggregate([
            {
              $addFields: {
                convertedDate: {
                  $toDate: "$createdAt",
                },
              },
            },
            {
              $match: {
                facility: { $in: facilitiyIds },
                convertedDate: {
                  $gte: new Date(range.startDate),
                  $lte: new Date(range.endDate),
                },
              },
            },
          ])
          .toArray();
        return callback({ data });
      }
      const data = await mongoPool
        .collection("timeslots")
        .find(filter)
        .toArray();
      return callback({ data });
    });


    socket.on("schedules:create", async (arg, callback) => {
      logger.info(`Creating schedule: ${JSON.stringify(arg)}`);
      const { timeSlotsData, schedulesData } = arg;

      const schedules = mongoPool.collection("schedules");
      const timeSlots = mongoPool.collection("timeslots");
      const id = new ObjectId().toString();
      try {
        const isExist = await schedules.findOne({
          details: new RegExp(schedulesData.details, "i"),
        });
        if (isExist) {
          throw new Error("Schedule is already exists");
        }
        const currentTimeMillis = Date.now();

        const uniqueIds = [
          ...new Set(timeSlotsData.map((item) => item.id)),
        ].join(", ");

        const new_record = {
          fields: {
            time_order: currentTimeMillis,
            chi_nhanh: uniqueIds,
            ND_CK: schedulesData.transactionCode,
            name: schedulesData.userName,
            phone: schedulesData.phone,
            email: schedulesData.email,
            san: schedulesData.details,
            address: Object.values(schedulesData.facility).join(", "),
            date: schedulesData.dates.join(", "),
            time: schedulesData.totalHours,
            quantity: schedulesData.timeSlots.length,
            total_money: schedulesData.totalPrice,
            voucher_code: schedulesData.applyDiscount,
            trang_thai: "Chờ thanh toán",
            dat_co_dinh: schedulesData.isFixed ? "True" : "False",
          },
        };
        const res = await create_record(new_record)
        const record_id = res.data.record.record_id;
        console.log("schedules:created");
        const updateQuery = timeSlotsData.map((timeSlot) => {
          const { facility, id, index } = timeSlot;
          return timeSlots.updateOne(
            { facility, courtId: id, createdAt: index.createdAt },
            {
              $set: {
                [index.columnIndex]: timeSlot,
              },
            }
          );
        });
        await Promise.allSettled(updateQuery);
        setTimeout(() => {
          const updatedData = timeSlotsData.map((timeSlot) => {
            timeSlot.status = "empty";
            return timeSlot;
          });

          return schedules.deleteOne({ id, status: "wait" }).then((res) => {
            logger.info(`Deleted: ${JSON.stringify(res)}`);
            if (res.deletedCount > 0) {
              logger.info(`Updated: ${JSON.stringify(res)}`);
              socket.broadcast.emit("schedules:updated", updatedData);
              return updateTimeSlot({
                timeSlotsData: updatedData,
                collection: timeSlots,
              });
            }
          });
        }, 600000);

        const insertData = {
          id,
          ...schedulesData,
          larkRecordId: record_id,
          status: "wait",
          createdAt: new Date(),
        };

        return schedules.insertOne(insertData).then((res) => {
          socket.broadcast.emit("schedules:updated", timeSlotsData);

          return callback({ success: true, data: res });
        });
      } catch (error) {
        logger.error(`Error creating schedule: ${error}`);
        return callback({ success: false, data: error });
      }
    });
    socket.on("schedules:send-info", async (arg, callback) => {
      const { timeSlots } = arg;
      socket.broadcast.emit("schedules:updated", timeSlots);
      callback({ success: true });
    });
    socket.on("schedules:update", async (arg, callback) => {
      const { code } = arg;
      const schedules = mongoPool.collection("schedules");
      // const timeSlots = db.collection("timeslots");
      try {
        const res = await schedules.findOne({
          transactionCode: code,
          status: "booked",
        });
        if (!res) {
          throw new Error("Đơn hàng của bạn chưa được thanh toán");
        }
        const record_id = res.larkRecordId
        await update_record(record_id);
        console.log("updated record success")
        return callback({ success: true, data: record_id })
      } catch (error) {
        logger.error(`Error updating schedule: ${error}`);
        return callback({
          error,
        });
      }
    });

    socket.on("schedules:delete", (arg) => {

      const { timeSlotsData, id } = arg;

      const schedules = mongoPool.collection("schedules");
      const timeSlots = mongoPool.collection("timeslots");

      const updatedData = timeSlotsData.map((timeSlot) => {
        timeSlot.status = "empty";
        return timeSlot;
      });

      console.log("schedules:deleted");

      return schedules.deleteOne({ id, status: "wait" }).then((res) => {
        logger.info(`Deleted: ${JSON.stringify(res)}`);
        if (res.deletedCount > 0) {
          logger.info(`Updated: ${JSON.stringify(res)}`);
          socket.broadcast.emit("schedules:updated", updatedData);
          return updateTimeSlot({
            timeSlotsData: updatedData,
            collection: timeSlots,
          });
        }
      });

    });

    console.log("connected", socket.id);
    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.id);
      
      // Close MongoDB connection for this socket if needed
      if (mongoClient) {
        try {
          await mongoClient.close();
          console.log("MongoDB connection closed for socket:", socket.id);
        } catch (error) {
          console.error("Error closing MongoDB connection:", error);
        }
      }
      // Clear any socket-specific data or listeners
      socket.removeAllListeners();

      console.log("Cleanup completed for socket:", socket.id);
    });
  });

  httpServer
    .once("error", (err) => {
      logger.error(`Server error: ${err}`);
      if (mongoClient) {
        mongoClient.close().then(() => {
          logger.info("MongoDB connection closed due to server error");
          process.exit(1);
        });
      } else {
        process.exit(1);
      }
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Closing MongoDB connection and exiting...');
    if (mongoClient) {
      await mongoClient.close();
      logger.info('MongoDB connection closed');
    }
    process.exit(0);
  });
});
