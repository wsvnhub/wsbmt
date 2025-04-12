import clientPromise from "@/lib/mongo";
import { formatDate } from "@/utils";
import { logger } from "@/utils/logger";

export async function GET(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();

        // Parse URL and query parameters
        const url = new URL(request.url);
        const phone = url.searchParams.get("phone") || "";
        const transactionContent = url.searchParams.get("transaction_content") || "";

        const query: any = {};
        if (phone) query.phone = phone;
        if (transactionContent) query.transactionCode = transactionContent;

        // Find one matching document
        const schedule = await db.collection("schedules").findOne(query);

        return Response.json({ data: schedule }, { status: 200 });

    } catch (error) {
        console.error("Error fetching data:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}



export async function POST(request: Request) {
    let client;
    try {
        const { code, amount } = await request.json();

        client = await clientPromise;
        const db = client.db(process.env.DB);
        const schedules = db.collection("schedules");
        const isExist = await schedules.findOne({ transactionCode: code, status: "wait" })

        if (!isExist) {
            throw new Error("Đơn hàng của bạn đã bị xoá!!!!!!");
        }
        const timslots = isExist.timeSlots

        const timeSlots = db.collection("timeslots");

        await schedules.updateOne(
            { transactionCode: code, status: "wait" },
            { $set: { status: "booked" } }
        );

        const updatedData = timslots.map((timeSlot: any) => ({ ...timeSlot, status: "booked" }));

        const updateOperations = updatedData.map((timeSlot: any) => ({
            updateOne: {
                filter: { facility: timeSlot.facility, courtId: timeSlot.id, createdAt: timeSlot.index.createdAt },
                update: { $set: { [timeSlot.index.columnIndex]: timeSlot } }
            }
        }));

        await timeSlots.bulkWrite(updateOperations);

        logger.info(`Verification successful: code=${code}, amount=${amount}`);
        return Response.json(
            { data: updatedData },
            { status: 200, statusText: "success" }
        );
    } catch (error: any) {
        logger.error(`Verification error: ${error.message}`);
        return Response.json({ error: error.message, data: null }, { status: 202, statusText: "error" });
    }
}
