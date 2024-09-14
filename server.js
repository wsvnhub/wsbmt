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

const LARK_API_URL = "https://open.larksuite.com/open-apis";
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

const { APP_ID, APP_SECRET, APP_TOKEN, TABLE_ID, MONGODB_URI, DB, NODE_ENV, PORT } = process.env;

const getLarkAccessToken = async () => {
  const response = await axios.post(`${LARK_API_URL}/auth/v3/tenant_access_token/internal`, {
    app_id: APP_ID,
    app_secret: APP_SECRET,
  }, { headers: HEADERS });

  if (response.status !== 200) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.data.tenant_access_token;
};

const createLarkRecord = async (newRecord) => {
  const token = await getLarkAccessToken();
  const url = `${LARK_API_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await axios.post(url, newRecord, { headers });
  return response.data;
};

const updateLarkRecord = async (recordId, newData) => {
  const token = await getLarkAccessToken();
  const url = `${LARK_API_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await axios.put(url, newData, { headers });
  return response.data;
};

const dev = NODE_ENV !== "production";
const hostname = "localhost";
const port = PORT || 3000;
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

let mongoClient;
let mongoPool;

const initDB = async () => {
  if (mongoClient && mongoClient.isConnected()) {
    return { mongoPool, mongoClient };
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await mongoClient.connect();
    mongoPool = mongoClient.db(DB);
    return { mongoPool, mongoClient };
  } catch (error) {
    logger.error(`MongoClient Error: ${error}`);
    // if (mongoClient) {
    //   await mongoClient.close();
    // }
    return null;
  }
};
const actionsStatus = {
  add: "empty",
  update: "wait",
  delete: "wait"
}
const updateTimeSlot = async ({ timeSlotsData, collection, action = "add" }) => {
  logger.info(`Updating time slots: ${JSON.stringify(timeSlotsData)}`);
  const updatePromises = timeSlotsData.map(({ facility, id, index, ...rest }) => {
    return collection.updateOne(
      { facility, courtId: id, createdAt: index.createdAt, [index.columnIndex + ".status"]: actionsStatus[action] },
      { $set: { [index.columnIndex]: { facility, id, index, ...rest } } }
    )
  }

  );
  return Promise.allSettled(updatePromises);
};

app.prepare().then(async () => {
  const httpServer = createServer(handler);
  const { mongoPool } = await initDB();

  new CronJob('0 0 1 1 *', async () => {
    await insertTimeslots({ db: mongoPool });
    console.log("Created 1 year time slots");
  }, null, true, 'Asia/Ho_Chi_Minh').start();

  const io = new Server(httpServer);

  io.on("connection", async (socket) => {
    const ip = socket.handshake.headers['x-forwarded-for'] ||
      socket.handshake.address ||
      socket.request.connection.remoteAddress ||
      null;

    console.log("Connected", socket.id);
    logger.info(`User IP ${ip}`);

    socket.on("app:info", async (arg, callback) => {
      const [facilitiesData, paymentInfoData] = await Promise.all([
        mongoPool.collection("facilities").find().toArray(),
        mongoPool.collection("paymentInfo").find().toArray(),
      ]);

      callback({ facilities: facilitiesData, paymentInfo: paymentInfoData });
    });

    socket.on("schedules:list", async ({ facilitiyIds, range, dates }, callback) => {
      const filter = { facility: { $in: facilitiyIds } };
      if (dates.length > 0) {
        filter.createdAt = { $in: dates };
      }
      if (range.startDate && range.endDate) {
        filter.createdAt = {
          $gte: new Date(range.startDate),
          $lte: new Date(range.endDate),
        };
      }

      const data = await mongoPool.collection("timeslots").find(filter).toArray();
      callback({ data });
    });

    socket.on("schedules:create", async ({ timeSlotsData, schedulesData }, callback) => {
      logger.info(`Creating schedule: ${JSON.stringify({ timeSlotsData, schedulesData })}`);
      const schedules = mongoPool.collection("schedules");
      const timeSlots = mongoPool.collection("timeslots");
      const id = new ObjectId().toString();

      try {
        const isExist = await schedules.findOne({
          details: new RegExp(schedulesData.details, "i"),
          status: "wait",
          timeSlots: {
            $elemMatch: {
              $or: schedulesData.timeSlots.map(({ facility, court, from, to, id }) =>
                ({ facility, court, from, to, id })
              )
            }
          }
        });
        if (isExist !== null) {
          throw new Error("Schedule already exists");
        }

        const uniqueIds = [...new Set(timeSlotsData.map(item => item.id))].join(", ");
        const newRecord = {
          fields: {
            time_order: Date.now(),
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

        const res = await createLarkRecord(newRecord);
        const recordId = res.data.record.record_id;

        await updateTimeSlot({ timeSlotsData, collection: timeSlots });

        setTimeout(async () => {
          const deleteResult = await schedules.deleteOne({ id, status: "wait" });

          if (deleteResult.deletedCount > 0) {
            const updatedData = timeSlotsData.map(timeSlot => ({ ...timeSlot, status: "empty" }));

            logger.info(`Updated: ${JSON.stringify(deleteResult)}`);
            socket.broadcast.emit("schedules:updated", updatedData);
            await updateTimeSlot({ timeSlotsData: updatedData, collection: timeSlots, action: "delete" });
          }
        }, 605000);

        const insertData = {
          id,
          ...schedulesData,
          larkRecordId: recordId,
          status: "wait",
          createdAt: new Date(),
        };

        const insertResult = await schedules.insertOne(insertData);
        socket.broadcast.emit("schedules:updated", timeSlotsData);

        callback({ success: true, data: insertResult, schedulesId: id });
      } catch (error) {
        logger.error(`Error creating schedule: ${error}`);
        callback({ success: false, data: error });
      }
    });

    socket.on("schedules:send-info", async ({ timeSlots }, callback) => {
      socket.broadcast.emit("schedules:updated", timeSlots);
      callback({ success: true });
    });

    socket.on("schedules:update", async ({ code }, callback) => {
      const schedules = mongoPool.collection("schedules");
      try {
        const schedule = await schedules.findOne({ transactionCode: code, status: "booked" });
        if (!schedule) {
          throw new Error("Order not paid yet");
        }
        await updateLarkRecord(schedule.larkRecordId, { fields: { trang_thai: "booked" } });
        console.log("Updated record successfully");
        callback({ success: true, data: schedule.larkRecordId });
      } catch (error) {
        logger.error(`Error updating schedule: ${error}`);
        callback({ error });
      }
    });

    socket.on("schedules:delete", async ({ timeSlotsData, id }) => {
      const schedules = mongoPool.collection("schedules");
      const timeSlots = mongoPool.collection("timeslots");

      const updatedData = timeSlotsData.map(timeSlot => ({ ...timeSlot, status: "empty" }));

      const deleteResult = await schedules.deleteOne({ id, status: "wait" });
      logger.info(`Deleted: ${JSON.stringify(deleteResult)}`);

      if (deleteResult.deletedCount > 0) {
        logger.info(`Updated: ${JSON.stringify(deleteResult)}`);
        socket.broadcast.emit("schedules:updated", updatedData);
        await updateTimeSlot({ timeSlotsData: updatedData, collection: timeSlots, action: "delete" });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      socket.removeAllListeners();
      console.log("Cleanup completed for socket:", socket.id);
    });
  });

  httpServer
    .once("error", (err) => {
      logger.error(`Server error: ${err}`);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});
