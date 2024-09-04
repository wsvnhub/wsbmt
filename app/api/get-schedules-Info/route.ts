import clientPromise from "@/lib/mongo";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  let client;
  try {
    client = await clientPromise;

    const db = client.db(process.env.DB);
    if (!id) {
      throw new Error("Không tìm thấy id đơn hàng");
    }
    const schedules = await db
      .collection("schedules")
      .findOne({ _id: new ObjectId(id) });

    return Response.json({
      data: schedules,
    });
  } catch (error) {
    return Response.json({
      error: error,
    });
  }
}
