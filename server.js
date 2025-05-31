import { createServer } from "node:http";

import { config } from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import next from "next";
import { Server } from "socket.io";
import { createLarkRecord, updateLarkRecord } from "./utils/lark.js";
import { logger } from "./utils/logger.js";
import { checkOrderExist } from "./utils/checkOrderExist.js";

config();

const { MONGODB_URI, DB, NODE_ENV, PORT } = process.env;

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
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
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
  update: "booked",
  delete: "wait",
}
const updateTimeSlot = async ({ timeSlotsData, collection, action = "add" }) => {
  logger.info(`Updating time slots: ${JSON.stringify(timeSlotsData)}`);
  const updatePromises = timeSlotsData.map(({ facility, id, index, ...rest }) => {
    const availability = action === "add" ? true : false
    return collection.updateOne(
      { facility, courtId: id, createdAt: index.createdAt, [index.columnIndex + ".status"]: actionsStatus[action] },
      { $set: { [index.columnIndex]: { facility, id, index, availability, ...rest } } }
    )
  }

  );
  return Promise.allSettled(updatePromises);
};

// const statificBookedHours = ({ collection }) => {
//   const results = collection.find({})
// }

app.prepare().then(async () => {
  const httpServer = createServer(handler);
  const { mongoPool } = await initDB();
  const io = new Server(httpServer);

  io.on("connection", async (socket) => {

    socket.on("app:info", async (args, callback) => {
      const { selectedDate, isAdmin } = args

      console.log("Connected", socket.id);
      // logger.info(`User IP ${ip}`);

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

    socket.on("schedules:list", async ({ facilitiyIds, range, dates }, callback) => {

      if ((!range.startDate || !range.endDate) && dates.length === 0) {

        return callback({ data: [] })
      }
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

    socket.on("schedules:create", async ({ timeSlotsData, schedulesData }, callback) => {
      logger.info(`Creating schedule: ${JSON.stringify({ schedulesData })}`);
      const schedules = mongoPool.collection("schedules");
      const timeSlots = mongoPool.collection("timeslots");
      const id = new ObjectId().toString();

      try {


        const isExist = await checkOrderExist(schedulesData, schedules)

        console.log("isExist", isExist)

        if (isExist) {
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
            san: schedulesData.formateddetails,
            address: Object.values(schedulesData.address).join(", "),
            date: schedulesData.dates.join(", "),
            time: schedulesData.totalHours,
            quantity: schedulesData.timeSlots.length,
            total_money: schedulesData.totalPrice,
            voucher_code: schedulesData.applyDiscount,
            trang_thai: "Chờ thanh toán",
            dat_co_dinh: schedulesData.isFixed ? "True" : "False",
          },
        };

        // const recordId = res.data.record.record_id;

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
          // larkRecordId: recordId,
          status: "wait",
          createdAt: new Date(),
        };

        const insertResult = await schedules.insertOne(insertData);
        socket.broadcast.emit("schedules:updated", timeSlotsData);

        callback({ success: true, data: insertResult, schedulesId: id });
        return createLarkRecord(newRecord);
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

        console.log("Updated record successfully");
        // callback({ success: true, data: schedule.larkRecordId });
        callback({ success: true, data: schedule.id });

        const newRecord = {
          fields: {
            time_order: Date.now(),
            // chi_nhanh: uniqueIds,
            ND_CK: schedule.transactionCode,
            name: schedule.userName,
            phone: schedule.phone,
            email: schedule.email,
            san: schedule.formateddetails,
            address: Object.values(schedule.address).join(", "),
            date: schedule.dates.join(", "),
            time: schedule.totalHours,
            quantity: schedule.timeSlots.length,
            total_money: schedule.totalPrice,
            voucher_code: schedule.applyDiscount,
            trang_thai: "booked",
            dat_co_dinh: schedule.isFixed ? "True" : "False",
          },
        };

        return createLarkRecord(newRecord);
        // return updateLarkRecord(schedule.larkRecordId, { fields: { trang_thai: "booked" } });
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

    socket.on("schedules:manual", async ({ timeSlots, action }, callback) => {
      logger.info(`Updated: schedules:manual`);
      const collection = mongoPool.collection("timeslots");
      // const res = await createLarkRecord(newRecord);
      await updateTimeSlot({ timeSlotsData: timeSlots, collection, action });
      io.emit("schedules:updated", timeSlots);
      return callback({ success: true, timeSlots });
    })

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
