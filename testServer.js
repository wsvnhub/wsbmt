import { createServer } from "node:http";
import { CronJob } from "cron";
import { config } from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import next from "next";
import { Server } from "socket.io";
import { generateTimeArray } from "./utils/genTimeSlots.js";

config();
const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 4000;
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
    console.error("MongoClient Error", error);
    throw error;
  }
};

const { mongoPool } = await initDB();

const job = new CronJob(
  "0 0 0 1 * *",
  async function () {
    console.log("Cron job started");

    const lastDate = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 4,
      0
    ).getDate();
    let i = new Date().getDate();
    const timeslots = generateTimeArray("0:15", 60, "0:10");
    const courts = await mongoPool.collection("courts").find().toArray();

    console.log(i, lastDate);
    while (i <= lastDate) {
      const date = new Date();
      date.setDate(i);
      const insertData = courts.map((court) => ({
        id: new ObjectId().toString(),
        facilitiyId: court.facilitiyId,
        courtId: court.id,
        court: court.name,
        timeslots,
        createdAt: date.toDateString(),
      }));
      await mongoPool.collection("timeslots").insertMany(insertData);
      i++;
    }
  },
  null,
  true,
  "Asia/Ho_Chi_Minh"
);

app.prepare().then(() => {
  const httpServer = createServer(handler);
  job.start();
  console.log("HTTP server started");

  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    socket.on("app:info", async (arg, callback) => {
      try {
        const [facilities, paymentInfo] = await Promise.all([
          mongoPool.collection("facilities").find().toArray(),
          mongoPool.collection("paymentInfo").find().toArray(),
        ]);
        callback({ facilities, paymentInfo });
      } catch (error) {
        console.error("app:info error", error);
        callback({ error: "Failed to fetch data" });
      }
    });

    socket.on("schedules:list", async (arg, callback) => {
      const { facilitiyIds, range } = arg;
      try {
        const data = await mongoPool
          .collection("timeslots")
          .find({
            facilitiyId: { $in: facilitiyIds },
            createdAt: range.startDate,
          })
          .sort({ court: 1 })
          .toArray();
        callback({ data });
      } catch (error) {
        console.error("schedules:list error", error);
        callback({ error: "Failed to fetch schedules" });
      }
    });

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
          throw new Error("Schedule already exists");
        }

        const updateQueries = timeSlotsData.map((update) => ({
          updateOne: {
            filter: { courtId: update.id },
            update: {
              $set: { [`timeslots.${update.index.columnIndex}`]: update },
            },
          },
        }));

        const result = await timeSlots.bulkWrite(updateQueries);
        console.log(result);

        setTimeout(() => {
          socket.broadcast.emit("schedules:updated", timeSlotsData);
          schedules.deleteOne({ id, status: "wait" });
        }, 60000);

        const insertData = {
          id,
          ...schedulesData,
          status: "wait",
          createdAt: new Date(),
        };
        await schedules.insertOne(insertData);

        socket.broadcast.emit("schedules:updated", timeSlotsData);
        callback({ success: true });
      } catch (error) {
        console.error("schedules:create error", error);
        callback({ error: "Failed to create schedule" });
      }
    });

    socket.on("schedules:update", (arg) => {
      const { id } = arg;
      console.log("schedules:updated");
      socket.broadcast.emit("schedules:updated", {});
    });

    socket.on("schedules:delete", () => {
      console.log("schedules:deleted");
      socket.broadcast.emit("schedules:deleted", {});
    });

    console.log("Socket connected");
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
