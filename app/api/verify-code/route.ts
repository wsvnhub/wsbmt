import clientPromise from "@/lib/mongo";

export async function GET(request: Request) {
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
    return Response.json(
      {
        data,
      },
      { status: 200, statusText: "success" }
    );
  } catch (error) {
    return Response.json({
      error,
    });
  }
}
