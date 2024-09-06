import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongo';

export async function GET(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const timeSlots = db.collection("timeslots");

        const data = await timeSlots.find({}).toArray();
        return Response.json(data);
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { timeSlotsData } = await request.json();
        const client = await clientPromise;
        const db = client.db();
        const timeSlots = db.collection("timeslots");

        const result = await timeSlots.insertMany(timeSlotsData);
        return Response.json({ message: "Time slots created", insertedCount: result.insertedCount }, { status: 201 });
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const { timeSlotsData } = await request.json();
        const client = await clientPromise;
        const db = client.db();
        const timeSlots = db.collection("timeslots");

        const updatePromises = timeSlotsData.map((timeSlot: any) => {
            return timeSlots.updateOne(
                {
                    facility: timeSlot.facility,
                    courtId: timeSlot.id,
                    createdAt: timeSlot.index.createdAt
                },
                {
                    $set: {
                        [timeSlot.index.columnIndex]: timeSlot,
                    },
                }
            );
        });

        await Promise.all(updatePromises);
        return Response.json({ message: "Time slots updated" }, { status: 200 });
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { id, timeSlotsData } = await request.json();
        const client = await clientPromise;
        const db = client.db();
        const schedules = db.collection("schedules");
        const timeSlots = db.collection("timeslots");

        const result = await schedules.deleteOne({ id, status: "wait" });

        if (result.deletedCount > 0) {
            console.log("schedules:deleted");
            console.log(`Deleted: ${JSON.stringify(result)}`);

            const updatedData = timeSlotsData.map((timeSlot: any) => {
                timeSlot.status = "empty";
                return timeSlot;
            });

            const updatePromises = updatedData.map((timeSlot: any) => {
                return timeSlots.updateOne(
                    {
                        facility: timeSlot.facility,
                        courtId: timeSlot.id,
                        createdAt: timeSlot.index.createdAt
                    },
                    {
                        $set: {
                            [timeSlot.index.columnIndex]: timeSlot,
                        },
                    }
                );
            });

            await Promise.all(updatePromises);

            console.log(`Updated: ${JSON.stringify(updatedData)}`);

            return Response.json({ message: "Schedule deleted and time slots updated" }, { status: 200 });
        } else {
            return Response.json({ message: "Schedule not found or already deleted" }, { status: 404 });
        }
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}
