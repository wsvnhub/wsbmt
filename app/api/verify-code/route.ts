import clientPromise from "@/lib/mongo";
import { logger } from "@/utils/logger.js";

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
    const { code } = body;
    if (!code) {
      throw new Error("Mã code không hợp lệ");
    }
    console.log("code", code)

    const data = await db.collection("promotions").findOne({ code: code.trim() });
    console.log("data", data)
    if (!data) {
      throw new Error("Mã code không tồn tại");
    }

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
