import clientPromise from "@/lib/mongo";

export async function GET() {
    const client = await clientPromise;
    const db = client.db();
    const stats = await db.collection("branch_stats").find({}, { projection: { _id: 0 } }).toArray();
    return Response.json({ data: stats });
}

export async function DELETE(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const body = await request.json();

        if (!body.branchId) {
            return new Response(JSON.stringify({ error: "branchId is required" }), { status: 400 });
        }

        const result = await db.collection("branch_stats").deleteOne({ branchId: body.branchId });

        if (result.deletedCount === 0) {
            return new Response(JSON.stringify({ message: "No matching document found" }), { status: 404 });
        }

        return new Response(JSON.stringify({ message: "Document deleted successfully" }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: "Internal Server Error", details: error }), { status: 500 });
    }
}
