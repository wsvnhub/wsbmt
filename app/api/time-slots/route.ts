import clientPromise from '@/lib/mongo';
import { insertTimeslots } from '@/utils/insertTimeSlots';

export async function GET(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const timeSlots = db.collection("timeslots");

        const data = await timeSlots.find().limit(10).toArray();
        return Response.json(data);
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { courtIds } = await request.json();
        const client = await clientPromise;
        const db = client.db();
        // const timeSlots = db.collection("timeslots");
        await insertTimeslots({ db, courtIds })
        // const result = await timeSlots.insertMany(timeSlotsData);
        return Response.json({ message: "Time slots created", insertedCount: courtIds }, { status: 201 });
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

