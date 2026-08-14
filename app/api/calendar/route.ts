import clientPromise from '@/lib/mongo';
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
        
        // KHÔNG còn sinh sẵn document ô nữa. Trước đây endpoint này gọi
        // insertCustomDateTimeslots để tạo ô trống cho cả khoảng ngày, và sự tồn
        // tại của document chính là cách hệ thống ngầm hiểu "ngày này đã mở".
        // Với mô hình sparse, ô trống không tồn tại nên cách ngầm hiểu đó không
        // dùng được — bản ghi trong `calendar` mới là nguồn duy nhất cho biết
        // ngày nào mở, và lưới phải tra nó.
        return Response.json(
            { message: "Đã tạo khoảng ngày mở", insertedCount: result.insertedId },
            { status: 201 }
        );
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}