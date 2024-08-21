import clientPromise from "@/lib/mongo";
import { generateTimeArray } from "@/utils/genTimeSlotsByJson";
import { ObjectId } from "mongodb";

const collections = [
  "facilities",
  "schedules",
  "paymentInfo",
  "promotions",
  "courts",
  "timeslots",
];

export async function GET(request: Request) {
  const client = await clientPromise;
  const db = client.db(process.env.DB);

  for (let index = 0; index < collections.length; index++) {
    const collection = collections[index];
    const isExists = await db.listCollections({ name: collection }).hasNext();
    if (isExists) {
      await db.collection(collection).drop();
    }
  }

  await db.collection("facilities").insertMany([
    {
      id: "CN NVL",
      name: "CN Nguyễn Văn Lượng",
      address: "70 Nguyễn Văn Lượng, P. 10, Gò Vấp",
      pricePerHour: "139000",
      createdAt: new Date().getTime(),
    },
    {
      id: "CN DQH",
      name: "CN Dương Quảng Hàm",
      address: "262 Dương Quảng Hàm, Gò Vấp",
      pricePerHour: "139000",
      createdAt: new Date().getTime(),
    },
  ]);

  await db.collection("schedules").insertMany([
    {
      id: new ObjectId().toString(),
      totalHours: 0,
      totalPrice: 0,
      detail: "Sân 1 - 2:35 đến 4:30",
      facility: "NVL",
      phone: "",
      userName: "",
      email: "",
      isFixed: false,
      applyDiscount: false,
      status: "",
      transactionCode: "",
      createdAt: new Date(),
    },
  ]);
  await db.collection("paymentInfo").insertOne({
    id: new ObjectId().toString(),
    bankName: "MB (Quân đội)",
    bankCode: "688112688",
    bankUserName: "NGUYEN THI AI NHAN",
    qrCode: "https://w.ladicdn.com/5dc39976770cd34186edd2d3/qr-wsb-20240820045649-u73w2.png",
  });
  await db.collection("promotions").insertMany([
    {
      id: new ObjectId().toString(),
      code: "open-day",
      value: 20,
      unit: "percent",
    },
  ]);
  await db.collection("courts").insertMany([
    {
      facilitiyId: "CN NVL",
      id: "NVL-1",
      name: "Sân 1",
      timeClusterId: "cluster1",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN NVL",
      id: "NVL-2",
      name: "Sân 2",
      timeClusterId: "cluster1",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN NVL",
      id: "NVL-3",
      name: "Sân 3",
      timeClusterId: "cluster2",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN NVL",
      id: "NVL-4",
      name: "Sân 4",
      timeClusterId: "cluster2",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN NVL",
      id: "NVL-5",
      name: "Sân 5",
      timeClusterId: "cluster3",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN NVL",
      id: "NVL-6",
      name: "Sân 6",
      timeClusterId: "cluster3",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN NVL",
      id: "NVL-7",
      name: "Sân 7",
      timeClusterId: "cluster4",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN DQH",
      id: "DQH-1",
      name: "Sân 1",
      timeClusterId: "cluster1",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN DQH",
      id: "DQH-2",
      name: "Sân 2",
      timeClusterId: "cluster2",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN DQH",
      id: "DQH-3",
      name: "Sân 3",
      timeClusterId: "cluster3",
      createdAt: new Date().getTime(),
    },
    {
      facilitiyId: "CN DQH",
      id: "DQH-4",
      name: "Sân 4",
      timeClusterId: "cluster4",
      createdAt: new Date().getTime(),
    },
  ]);


const currentDate = new Date();
const futureMonth = currentDate.getMonth() + 4;
const futureYear = currentDate.getFullYear() + Math.floor(futureMonth / 12);
const correctedMonth = futureMonth % 12;
const lastDate = new Date(futureYear, correctedMonth + 1, 0).getDate();



  let i = new Date().getDate();

  const courts = await db.collection("courts").find().toArray();
  console.log(i, lastDate);

  while (i <= lastDate) {
    const date = new Date(futureYear, correctedMonth, i);

    console.log(date.toDateString());
    const insertData = courts.map((court) => {
      const timeslots = generateTimeArray(court.timeClusterId);
      return {
        id: new ObjectId().toString(),
        facility: court.facilitiyId,
        courtId: court.id,
        court: court.name,
        timeClusterId: court.timeClusterId,
        ...timeslots,
        createdAt: date.toDateString(),
      };
    });
    await db.collection("timeslots").insertMany(insertData);
    i++;
  }
  await client.close();
  return Response.json({
    data: "success",
  });
}
