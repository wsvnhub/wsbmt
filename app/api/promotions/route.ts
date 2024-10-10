import clientPromise from "@/lib/mongo";

export async function GET(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const promotions = await db.collection("promotions").find({}).toArray();
        return Response.json({ data: promotions }, { status: 200 });
    } catch (error) {
        console.error("Error fetching promotions:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const promotionData = await request.json();

        if (!promotionData.code || !promotionData.value || !promotionData.unit || !promotionData.limit || !promotionData.expired) {
            return Response.json({ error: "Missing required fields" }, { status: 400 });
        }
        const result = await db.collection("promotions").insertOne(promotionData);
        return Response.json({ message: "Promotion created successfully", id: result.insertedId }, { status: 201 });
    } catch (error) {
        console.error("Error creating promotion:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const { id, ...updateData } = await request.json();

        if (!id) {
            return Response.json({ error: "ID is required" }, { status: 400 });
        }

        const result = await db.collection("promotions").updateOne(
            { id: id },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return Response.json({ error: "Promotion not found" }, { status: 404 });
        }

        return Response.json({ message: "Promotion updated successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error updating promotion:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const { id } = await request.json();

        if (!id) {
            return Response.json({ error: "ID is required" }, { status: 400 });
        }

        const result = await db.collection("promotions").deleteOne({ id: id });

        if (result.deletedCount === 0) {
            return Response.json({ error: "Promotion not found" }, { status: 404 });
        }

        return Response.json({ message: "Promotion deleted successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting promotion:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}