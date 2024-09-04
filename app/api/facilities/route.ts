import clientPromise from "@/lib/mongo";

export async function GET(request: Request) {
  let client;
  try {
    client = await clientPromise;
    const db = client.db();
    const facilities = await db.collection("facilities").find({}).toArray();
    return Response.json({ data: facilities }, { status: 200 });
  } catch (error) {
    console.error("Error fetching facilities:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  } 
}

export async function POST(request: Request) {
  let client;
  try {
    client = await clientPromise;
    const db = client.db();
    const facilityData = await request.json();

    if (!facilityData.id || !facilityData.name || !facilityData.address || !facilityData.pricePerHour) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await db.collection("facilities").insertOne({
      ...facilityData,
      createdAt: new Date().getTime(),
    });

    return Response.json({ message: "Facility created successfully", id: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error("Error creating facility:", error);
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

    const result = await db.collection("facilities").updateOne(
      { id: id },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return Response.json({ error: "Facility not found" }, { status: 404 });
    }

    return Response.json({ message: "Facility updated successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error updating facility:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let client;
  try {
    client = await clientPromise;
    const db = client.db();
    const { id } = await request.json();

    if (!id) {
      return Response.json({ error: "ID is required" }, { status: 400 });
    }

    const result = await db.collection("facilities").deleteOne({ id: id });

    if (result.deletedCount === 0) {
      return Response.json({ error: "Facility not found" }, { status: 404 });
    }

    return Response.json({ message: "Facility deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error deleting facility:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
