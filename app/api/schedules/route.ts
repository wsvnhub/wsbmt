import clientPromise from "@/lib/mongo";

export async function GET(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const schedules = await db.collection("schedules").find({}).toArray();
        return Response.json({ data: schedules }, { status: 200 });
    } catch (error) {
        console.error("Error fetching timeslots:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        // const {} = await request.json();

       
        const result = await db.collection("schedules").deleteMany({});
        return Response.json({ data: result }, { status: 201 });
    } catch (error) {
        console.error("Error inserting timeslots:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}