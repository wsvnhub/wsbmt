import clientPromise from "@/lib/mongo";
import { logger } from "@/utils/logger";
import { confirmPaidOrder } from "@/utils/confirmOrder";
import { verifyPaymentRequest } from "@/utils/webhookAuth";

export async function GET(request: Request) {
    let client;
    try {
        client = await clientPromise;
        const db = client.db();

        // Parse URL and query parameters
        const url = new URL(request.url);
        const amount = url.searchParams.get("amount") || "";
        const transactionContent = url.searchParams.get("transaction_content") || "";

        const query: any = {};
        if (amount) query.totalPrice = Number(amount);
        if (transactionContent) query.transactionCode = transactionContent;

        // Find one matching document
        const schedule = await db.collection("schedules").findOne(query);

        return Response.json({ data: schedule }, { status: 200 });

    } catch (error) {
        console.error("Error fetching data:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * Webhook ngân hàng: tiền đã về -> xác nhận đơn.
 *
 * Bản cũ KHÔNG auth, KHÔNG so `amount` với `totalPrice` (chỉ log ra), rồi gọi
 * `void updatedTimeSlotStatus(...)` fire-and-forget vốn ghi đè cả subdocument ô
 * bằng dữ liệu từ đơn và nuốt mọi lỗi vào một catch chỉ ghi log. Vì mã giao dịch
 * cũ chỉ phân giải tới 10 giây nên nó đoán được: đoán đúng mã là đặt được sân mà
 * không trả đồng nào.
 */
export async function POST(request: Request) {
    let client;
    try {
        // Đọc raw body trước để verify được HMAC (chữ ký tính trên đúng bytes gửi lên).
        const rawBody = await request.text();

        const auth = verifyPaymentRequest(request, rawBody);
        if (!auth.ok) {
            logger.error(`Booking webhook rejected: ${auth.reason}`);
            return Response.json({ error: "Unauthorized", data: null }, { status: 401 });
        }

        const { code, amount } = JSON.parse(rawBody);

        if (!code) {
            return Response.json({ error: "Thiếu mã giao dịch", data: null }, { status: 400 });
        }

        client = await clientPromise;
        const db = client.db();
        const order = await db.collection("schedules").findOne({ transactionCode: code });

        if (!order) {
            throw new Error("Đơn hàng của bạn đã bị xoá!!!!!!");
        }

        if (Number(amount) < Number(order.totalPrice)) {
            logger.error(
                `Booking underpaid: code=${code} received=${amount} expected=${order.totalPrice}`
            );
            return Response.json(
                { error: "Số tiền chuyển khoản không khớp với đơn hàng", data: null },
                { status: 402 }
            );
        }

        // Điểm vào DUY NHẤT cho việc xác nhận, dùng chung với socket server.
        // Atomic, idempotent (webhook gửi lại vẫn trả success), và khi hold đã
        // hết hạn thì tự thử giành lại ô — đây chính là kịch bản đã sinh ra 139
        // dòng "Đơn hàng của bạn đã bị xoá" trong app.log.
        const result = await confirmPaidOrder(db, code, { amount, source: "bank_webhook" });

        if (!result.success) {
            if (result.needsManualReview) {
                // Tiền đã về nhưng thiếu sân. Trả 200 để ngân hàng không gửi lại
                // vô hạn, nhưng đánh dấu rõ là cần người xử lý — trường hợp này
                // đã được ghi vào `payment_exceptions`.
                logger.error(`PAYMENT EXCEPTION cần xử lý tay: ${code}`);
                return Response.json(
                    { error: result.error, needsManualReview: true, data: null },
                    { status: 200, statusText: "manual-review" }
                );
            }
            throw new Error(result.error);
        }

        logger.info(
            `Booking confirmed: code=${code} amount=${amount}${result.replay ? " (replay)" : ""}`
        );

        return Response.json(
            { data: result.schedule?.timeSlots ?? [], replay: Boolean(result.replay) },
            { status: 200, statusText: "success" }
        );
    } catch (error: any) {
        logger.info(`Verification error: ${error.message}`);
        return Response.json({ error: error.message, data: null }, { status: 202, statusText: "error" });
    }
}
