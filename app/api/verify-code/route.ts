import clientPromise from "@/lib/mongo";
import { logger } from "@/utils/logger.js";

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export async function GET(request: Request) {
  logger.info(`GET /api/verify-code ${JSON.stringify(request)}`);
  return Response.json({
    data: [],
  });
}

export async function POST(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB);
    const body = await request.json();
    const { code, timesSlots } = body;
    if (!code) {
      throw new Error("Mã code không hợp lệ");
    }
    console.log("code", code)

    const data = await db.collection("promotions").findOne({ code: code.trim() });

    if (!data) {
      throw new Error("Mã code không tồn tại hoặc hết hạn");
    }
    const today = new Date()

    const { count, limit, expired, days, dates, times } = data

    if (count >= limit || new Date(expired).getTime() < today.getTime()) {
      throw new Error("Mã code đã đạt giới hạn");
    }
    console.log("pass limit", days.includes(today.getDay()))
    if (!days.includes(today.getDay())) {
      throw new Error("Mã code không áp dụng cho hôm nay!");
    }

    const { date, month, year } = dates
    if (!date.includes(today.getDate()) || !month.includes(today.getMonth() + 1) || !year.includes(today.getFullYear())) {
      throw new Error(`Mã code không áp dụng cho ngày ${today.toDateString()}!`);
    }

    const { from, to } = times

    const startMinutes = timeToMinutes(from);
    const endMinutes = timeToMinutes(to);

    const slots: any = Array.isArray(timesSlots) ? timesSlots : Object.values(timesSlots)[0];

    let index = 0;
    while (index < slots.length) {
      const t = slots[index]
      const fromTime = timeToMinutes(t.from)
      const toTime = timeToMinutes(t.to)
      console.log(`${t.from}:${t.to}!`)
      if (fromTime >= endMinutes || toTime <= startMinutes) {
        throw new Error(`Mã chỉ áp dụng cho khung giờ ${from}:${to}!`);
      }
      index++
    }


    await db.collection("promotions").updateOne(
      { code: code.trim() },
      { $inc: { count: 1 } }
    );

    logger.info(`POST /api/verify-code ${JSON.stringify({ code })}`);

    return Response.json(
      {
        data,
      },
      { status: 200, statusText: "success" }
    );
  } catch (error) {
    logger.error(`POST /api/verify-code ${error instanceof Error ? error.message : JSON.stringify(error)}`);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 400, statusText: "error" }
    );
  }
}
