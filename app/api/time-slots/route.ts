import clientPromise from '@/lib/mongo';
import { COURT_DAYS, readOccupied, toBookingDate } from '@/utils/courtDays';

/**
 * Đọc các ô ĐÃ BỊ CHIẾM từ hôm nay trở đi.
 *
 * Bản cũ lọc bằng `{ createdAt: { $gte: todayStr } }` với todayStr là chuỗi
 * `toDateString()` — đó là so sánh TỪ ĐIỂN trên chuỗi kiểu "Fri Aug 14 2026",
 * nên thứ tự là "Apr" < "Aug" < "Dec" < "Feb"... hoàn toàn vô nghĩa. Với `date`
 * dạng YYYY-MM-DD thì so sánh chuỗi trùng khớp với so sánh thời gian, và dùng
 * được index.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId");
        const days = Math.min(Number(searchParams.get("days")) || 60, 180);

        const client = await clientPromise;
        const db = client.db();

        const today = toBookingDate(new Date());
        const until = toBookingDate(new Date(Date.now() + days * 86400000));

        const query: any = { date: { $gte: today, $lte: until } };
        if (branchId) query.facility = branchId;

        const docs = await db
            .collection(COURT_DAYS)
            .find(query, { projection: { _id: 0, facility: 1, courtId: 1, date: 1, timeClusterId: 1, slots: 1 } })
            .toArray();

        return Response.json({ data: docs, from: today, to: until });
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}

/**
 * Trước đây endpoint này sinh sẵn document cho MỌI ô của MỌI sân trong 2 tháng
 * (~6.500 document/năm, phần lớn chứa toàn ô trống). Với mô hình sparse, ô trống
 * không cần tồn tại — document được tạo ra ở lần đặt đầu tiên. Không còn gì để
 * sinh sẵn nữa.
 *
 * Giữ endpoint để `app/admin/settings/branchs/page.tsx` gọi xong không lỗi.
 */
export async function POST() {
    return Response.json(
        {
            message:
                "Không cần tạo sẵn ô nữa: ô trống không được lưu, document sẽ tự sinh khi có người đặt.",
            insertedCount: 0,
        },
        { status: 200 }
    );
}

/**
 * Huỷ giữ chỗ / nhả ô.
 *
 * Endpoint DELETE này trước đây KHÔNG TỒN TẠI: components/payments/Wait.tsx gọi
 * `fetch('/api/time-slots', { method: 'DELETE' })` khi hết giờ đếm ngược và luôn
 * nhận 405, nên đường huỷ đơn chưa từng thực sự nhả ô. Client giờ dùng socket
 * `schedules:cancel`; endpoint này giữ lại làm lối vào dự phòng.
 */
export async function DELETE(request: Request) {
    try {
        const { transactionCode } = await request.json();
        if (!transactionCode) {
            return Response.json({ message: "Thiếu transactionCode" }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        const { releaseHold } = await import("@/utils/courtDays");
        const { SCHEDULE_STATUS } = await import("@/utils/bookingConstants");

        const schedule = await db.collection("schedules").findOne({ transactionCode });
        if (!schedule) {
            return Response.json({ message: "Không tìm thấy đơn" }, { status: 404 });
        }
        // Đơn đã thanh toán thì không cho tự huỷ qua đường này.
        if (schedule.status === SCHEDULE_STATUS.BOOKED) {
            return Response.json({ message: "Đơn đã thanh toán" }, { status: 409 });
        }

        const { released } = await releaseHold(db, schedule.holdId);
        await db.collection("schedules").updateOne(
            { id: schedule.id, status: { $in: [SCHEDULE_STATUS.PENDING, SCHEDULE_STATUS.WAIT] } },
            { $set: { status: SCHEDULE_STATUS.CANCELLED, cancelReason: "client_timeout", cancelledAt: new Date() } }
        );

        return Response.json({ message: "Đã huỷ giữ chỗ", released }, { status: 200 });
    } catch (error) {
        console.error("Error:", error);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}
