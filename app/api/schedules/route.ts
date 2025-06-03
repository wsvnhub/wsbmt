import clientPromise from "@/lib/mongo";

export async function GET(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();

        // Lấy query params từ URL
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('pageSize') || '20');
        const skip = (page - 1) * limit;

        // Đếm tổng số tài liệu
        const totalItems = await db.collection('schedules').countDocuments();

        // Lấy dữ liệu phân trang
        const schedules = await db
            .collection('schedules')
            .find()
            .skip(skip)
            .limit(limit)
            .toArray();

        const totalPages = Math.ceil(totalItems / limit);

        return Response.json({
            data: schedules,
            totalItems,
            totalPages,
            currentPage: page,
        });
    } catch (error) {
        console.error('Error fetching schedules:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
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