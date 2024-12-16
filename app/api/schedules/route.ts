import clientPromise from "@/lib/mongo";

export async function GET(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const page = parseInt(request.url.split('page=')[1]) || 1; // Get the page number from the request URL
        const limit = 20; // Set the limit for items per page
        const skip = (page - 1) * limit; // Calculate the number of items to skip
        const schedules = await db.collection("schedules").find().skip(skip).limit(limit).toArray();
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