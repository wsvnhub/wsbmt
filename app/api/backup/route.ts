import clientPromise from "@/lib/mongo";

export async function GET(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const courts = await db.collection("timeslots").find({}).toArray();
        return Response.json({ data: courts }, { status: 200 });
    } catch (error) {
        console.error("Error fetching timeslots:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const timeslots = await request.json();

        // Check if timeslots is an array
        if (!Array.isArray(timeslots)) {
            return Response.json({ error: "Invalid input: timeslots must be an array" }, { status: 400 });
        }

        await db.collection("timeslots").drop();
        const result = await db.collection("timeslots").insertMany(timeslots);
        return Response.json({ data: result }, { status: 201 });
    } catch (error) {
        console.error("Error inserting timeslots:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}