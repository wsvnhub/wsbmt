import clientPromise from "@/lib/mongo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data } = body;
    const client = await clientPromise;
    const db = client.db(process.env.DB);
    if (!data) {
      throw new Error("not found payment info");
    }
    const result = { _ok: 0 };
    for (let i = 0; i < data.length; i++) {
      result._ok = 1; //important: xác nhận webhook đã xử lý

      //lấy nội dung chuyển khoản
      //   if (is_JSON(data[i].description)) {
      //     var jsonDes =
      //       typeof data[i].description == "string"
      //         ? JSON.parse(data[i].description)
      //         : data[i].description;
      //     if (jsonDes.code) data[i].description = jsonDes.code;
      //   }
      //số tiền mà khách hàng chuyển khoản
      data[i].amount;

      //your code..
      await db.collection("schedules").updateOne(
        {
          transactionCode: "",
          totalPrice: 0,
        },
        { $set: { status: "booked" } }
      );
    }
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
