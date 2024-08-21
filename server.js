import { createServer } from "node:http";
import { CronJob } from "cron";
import { config } from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import next from "next";
import { Server } from "socket.io";
import { generateTimeArray } from "./utils/genTimeSlotsByJson.js";

config();
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
    console.log("MongoClient Error", error);
    return null;
  }
};

const { mongoPool } = await initDB();

const job = CronJob.from({
  cronTime: "0 0 0 1 * *",
  // cronTime: "0 * * * * *",
  onTick: async function () {
    console.log("You will see this message every second");

  const currentDate = new Date();
let futureMonth = currentDate.getMonth() + 4;
let futureYear = currentDate.getFullYear();

if (futureMonth > 11) {
  futureMonth -= 12;
  futureYear += 1;
}

let lastDate = new Date(futureYear, futureMonth + 1, 0).getDate();




    let i = currentDate.getDate();  // Bắt đầu từ ngày hiện tại

    const courts = await mongoPool.collection("courts").find().toArray();
    console.log(i, lastDate);
    while (futureYear < currentDate.getFullYear() + 1 || (futureYear === currentDate.getFullYear() + 1 && futureMonth <= currentDate.getMonth())) {
  const date = new Date(futureYear, futureMonth, i);
  
  if (i > lastDate) {
    i = 1;
    futureMonth++;
    if (futureMonth > 11) {
      futureMonth = 0;
      futureYear++;
    }
    lastDate = new Date(futureYear, futureMonth + 1, 0).getDate();
  } else {
    i++;
  }


      const insertData = courts.map((court) => {
        const timeslots = generateTimeArray(court.timeClusterId);
        return {
          id: new ObjectId().toString(),
          facilitiyId: court.facilitiyId,
          courtId: court.id,
          court: court.name,
          timeClusterId: court.timeClusterId,
          timeslots,
          createdAt: date.toDateString(),
        };
      });
      await mongoPool.collection("timeslots").insertMany(insertData);
      i++;
    }
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
        // .sort({ court: 1 })
        .toArray();
      return callback({ data });
    });

    // socket.on("schedules:list", async (arg, callback) => {
    //   const { facilitiyIds, range, dates } = arg;

    //   const filter = { facilitiyId: { $in: facilitiyIds } };
    //   const schedulesFilter = { status: { $in: ["booked", "wait"] } };
    //   if (dates.length > 0) {
    //     schedulesFilter.date = { $in: dates };
    //   }
    //   if (range.startDate !== "" && range.endDate !== "") {
    //     schedulesFilter.createdAt = {
    //       $gte: new Date(range.startDate),
    //       $lte: new Date(range.endDate),
    //     };
    //   }
    //   const schedules = await mongoPool
    //     .collection("schedules")
    //     .find(schedulesFilter)
    //     .toArray();
    //   const data = await mongoPool.collection("courts").find(filter).toArray();
    //   return callback({ data, schedules });
    // });

    socket.on("schedules:create", async (arg, callback) => {
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
            console.log("deleted", res);
            if (res.deletedCount > 0) {
              console.log("updated", res);
              socket.broadcast.emit("schedules:updated", updatedData);
              return updateTimeSlot({
                timeSlotsData: updatedData,
                collection: timeSlots,
              });
            }
          });
        }, 60000);

        const insertData = {
          id,
          ...schedulesData,
          status: "wait",
          createdAt: new Date(),
        };

        return schedules.insertOne(insertData).then((res) => {
          socket.broadcast.emit("schedules:updated", timeSlotsData);

          return callback({ success: true, data: res });
        });
      } catch (error) {
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
      const timeSlots = db.collection("timeslots");
      try {
        const res = await schedules.findOne({
          transactionCode: code,
          status: "booked",
        });
        if (!res) {
          throw new Error("Đơn hàng của bạn chưa được thanh toán");
        }
        const updatedData = res.timslots.map((timeSlot) => {
          timeSlot.status = "booked";
          return timeSlot;
        });
        await updateTimeSlot({
          collection: timeSlots,
          timeSlotsData: updatedData,
        });
        console.log("schedules:updated");
        socket.broadcast.emit("schedules:updated", updatedData);
      } catch (error) {
        callback({
          error,
        });
      }
    });

    socket.on("schedules:delete", () => {
      console.log("schedules:deleted");
      socket.broadcast.emit("schedules:deleted", {});
    });

    console.log("connected");
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
