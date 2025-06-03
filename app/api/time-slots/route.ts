import clientPromise from '@/lib/mongo';
import { insertTimeslots } from '@/utils/insertTimeSlots';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId");

        const client = await clientPromise;
        const db = client.db();
        const timeSlots = db.collection("timeslots");

        const query = branchId ? { branchId } : {};
        const data = await timeSlots.find(query).limit(10).toArray();

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
        await insertTimeslots({ db, courtIds, maxMonth: new Date().getMonth() + 2 })
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

        const [timeSlot] = timeSlotsData
        const res = await timeSlots.findOne({
            facility: timeSlot.facility,
            courtId: timeSlot.courtId,
            timeClusterId: timeSlot.timeClusterId,
            createdAt: new Date(timeSlot.createdAt).toDateString(),
        })
        if (!res) {
            return Response.json({ message: "item not found" }, { status: 404 });
        }
        const updatePromises = timeSlotsData.map((timeSlot: any) => {
            const updateItem = res[timeSlot.index]
            updateItem.status = timeSlot.status
            return timeSlots.updateOne(
                {
                    facility: timeSlot.facility,
                    courtId: timeSlot.courtId,
                    timeClusterId: timeSlot.timeClusterId,
                    createdAt: new Date(timeSlot.createdAt).toDateString()
                },
                {
                    $set: {
                        [timeSlot.index]: updateItem,
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


