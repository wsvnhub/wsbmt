import clientPromise from "@/lib/mongo";

export async function GET(request: Request) {
  let client;
  try {
    client = await clientPromise;
    const db = client.db();
    const courts = await db.collection("courts").find({}).toArray();
    return Response.json({ data: courts }, { status: 200 });
  } catch (error) {
    console.error("Error fetching courts:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
  }
}

export async function POST(request: Request) {
  let client;
  try {
    client = await clientPromise;
    const db = client.db();
    const courtData = await request.json();

    if (!courtData.id || !courtData.name || !courtData.facilityId) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await db.collection("courts").insertOne({
      ...courtData,
      createdAt: new Date().getTime(),
    });

    return Response.json({ message: "Court created successfully", id: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error("Error creating court:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
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

    const result = await db.collection("courts").updateOne(
      { id: id },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return Response.json({ error: "Court not found" }, { status: 404 });
    }

    return Response.json({ message: "Court updated successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error updating court:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    if (client) {
      await client.close();
    }
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

    const result = await db.collection("courts").deleteOne({ id: id });

    if (result.deletedCount === 0) {
      return Response.json({ error: "Court not found" }, { status: 404 });
    }

    return Response.json({ message: "Court deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error deleting court:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
