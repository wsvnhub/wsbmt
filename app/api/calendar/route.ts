import clientPromise from '@/lib/mongo';
import { insertCustomDateTimeslots } from '@/utils/insertTimeSlots';
import { ObjectId } from 'mongodb';

export async function GET(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection("calendar");

        const data = await collection.find({}).toArray();
        return Response.json({ data });
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { selectedDate, notes, facilities } = await request.json();
        const client = await clientPromise;
        const db = client.db();

        const collection = db.collection("calendar");

        const [from, to] = selectedDate

        const fromDate = new Date(from)
        const toDate = new Date(to)
       
        const result = await collection.insertOne({
            id: new ObjectId().toString(),
            fromDate,
            toDate,
            notes,
            createdAt: new Date()
        });
        
        await insertCustomDateTimeslots({
            db,
            courtIds: [],
            fromDate,
            toDate
        })

        return Response.json({ message: "Time slots created", insertedCount: result.insertedId }, { status: 201 });
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}