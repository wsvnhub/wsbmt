import clientPromise from "@/lib/mongo";
import { COURT_DAYS, ensureIndexes } from "@/utils/courtDays";
import { verifyWebhookAuth } from "@/utils/webhookAuth";
import { logger } from "@/utils/logger";

/**
 * Sao lưu / khôi phục collection ô sân.
 *
 * Bản cũ có hai vấn đề nghiêm trọng:
 *  1. POST gọi `drop()` — thao tác này XOÁ LUÔN MỌI INDEX. Khôi phục một bản
 *     backup lúc 10h là từ đó tới khi ai đó restart server, unique index không
 *     còn tồn tại và KHÔNG có gì chặn đặt trùng sân nữa.
 *  2. Cả GET lẫn POST đều KHÔNG auth: POST nhận một mảng bất kỳ từ body rồi
 *     thay thế toàn bộ dữ liệu sân.
 */

export async function GET(request: Request) {
    const auth = verifyWebhookAuth(request);
    if (!auth.ok) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const data = await db.collection(COURT_DAYS).find({}).toArray();
        return Response.json({ data, collection: COURT_DAYS }, { status: 200 });
    } catch (error) {
        console.error("Error fetching court_days:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const auth = verifyWebhookAuth(request);
    if (!auth.ok) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let client;
    try {
        client = await clientPromise;
        const db = client.db();
        const docs = await request.json();

        if (!Array.isArray(docs)) {
            return Response.json({ error: "Invalid input: phải là một mảng" }, { status: 400 });
        }

        // deleteMany thay vì drop(): GIỮ LẠI index và validator. Đây là điều duy
        // nhất đảm bảo bản khôi phục không mở lại lỗ đặt trùng, và validator sẽ
        // từ chối ngay những document sai định dạng trong file backup.
        await db.collection(COURT_DAYS).deleteMany({});

        let inserted = 0;
        if (docs.length > 0) {
            const res = await db.collection(COURT_DAYS).insertMany(docs, { ordered: false });
            inserted = res.insertedCount;
        }

        // Tạo lại index cho chắc, phòng khi collection chưa từng tồn tại.
        await ensureIndexes(db);

        logger.info(`Backup restored: ${inserted} document vào ${COURT_DAYS}`);
        return Response.json({ inserted }, { status: 201 });
    } catch (error: any) {
        console.error("Error restoring court_days:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
