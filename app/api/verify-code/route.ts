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
    const body = await request.json();

    const { code } = body;
    const client = await clientPromise;
    const db = client.db(process.env.DB);
    const data = await db.collection("promotions").findOne({ code });
    logger.info(`POST /api/verify-code ${JSON.stringify(body)}`);
    return Response.json(
      {
        data,
      },
      { status: 200, statusText: "success" }
    );
  } catch (error) {
    logger.error(`POST /api/verify-code ${JSON.stringify(error)}`);

    return Response.json({
      error,
    });
  }
}
