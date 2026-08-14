import clientPromise from "@/lib/mongo";
import { formatDate } from "@/utils";
import { logger } from "@/utils/logger";
import { confirmPaidOrder } from "@/utils/confirmOrder";

interface MBBankTransaction {
  id: string;
  bank_brand_name: string;
  account_number: string;
  transaction_date: string;
  amount_out: string;
  amount_in: string;
  accumulated: string;
  transaction_content: string;
  reference_number: string;
  code: string | null;
  sub_account: any;
  bank_account_id: string;
}

interface MBBankResponse {
  status: number;
  error: any;
  messages: any;
  transactions: Array<MBBankTransaction>;
}

export async function POST(request: Request) {
  let client;
  try {
    // `timslots` KHÔNG còn được đọc từ body. Bản cũ lấy cả danh sách ô từ
    // request rồi $set đè nguyên subdocument mà không có điều kiện status nào,
    // nên bất kỳ ai cũng ghi đè được booking đã thanh toán của người khác. Danh
    // sách ô hợp lệ duy nhất là danh sách đã lưu trong đơn.
    const { code, amount } = await request.json();

    if (!process.env.BANK_API_BASE_URL) {
      throw new Error("Bank API chưa được cài đặt");
    }

    client = await clientPromise;
    const db = client.db(process.env.DB);
    const schedules = db.collection("schedules");
    const isExist = await schedules.findOne({ transactionCode: code });

    if (!isExist) {
      throw new Error("Đơn hàng của bạn đã bị xoá!!!!!!");
    }

    // Idempotency cho lần gọi lại: đơn đã booked bằng mã này là thành công rồi.
    if (isExist.status === "booked") {
      logger.info(`Verify-status replay ignored: ${code}`);
      return Response.json(
        { data: isExist.timeSlots, replay: true },
        { status: 200, statusText: "success" }
      );
    }

    if (Number(amount) < Number(isExist.totalPrice)) {
      logger.error(
        `Verify-status underpaid: code=${code} received=${amount} expected=${isExist.totalPrice}`
      );
      throw new Error("Số tiền chuyển khoản không khớp với đơn hàng");
    }

    const url = `${process.env.BANK_API_BASE_URL}/transactions/list?limit=100&amount_in=${amount}&transaction_date_min=${formatDate()}`
    const response = await fetch(
      url,
      {
        headers: {
          Authorization: `Bearer ${process.env.BANK_API_KEY}`,
        },
      }
    );

    const { status, transactions }: MBBankResponse = await response.json();
    if (status !== 200 || transactions.length === 0) {
      throw new Error("Không thể lấy được thông tin giao dịch");
    }
    const transaction = transactions.find(
      (t) => {
        // console.log("transaction code ", t.transaction_content.trim().includes(code) || (code.includes(t.code)))
        // console.log("amount", Number(t.amount_in) === Number(amount), Number(t.amount_in), amount)
        return (t.transaction_content.trim().includes(code) || (code.includes(t.code))) && Number(t.amount_in) === Number(amount)
      }
    );
    if (!transaction) {
      throw new Error("Đơn hàng của bạn chưa được thanh toán");
    }


    // Điểm vào DUY NHẤT cho việc xác nhận, dùng chung với socket server và
    // /api/booking. Bản cũ bulkWrite thẳng vào `timeslots` với dữ liệu lấy từ
    // request body và KHÔNG có điều kiện status nào, nên nó ghi đè được cả
    // booking đã thanh toán của người khác.
    const result = await confirmPaidOrder(db, code, { amount, source: "verify_status" });

    if (!result.success) {
      if (result.needsManualReview) {
        logger.error(`PAYMENT EXCEPTION cần xử lý tay: ${code}`);
        return Response.json(
          { error: result.error, needsManualReview: true, data: null },
          { status: 200, statusText: "manual-review" }
        );
      }
      throw new Error(result.error);
    }

    logger.info(`Verification successful: code=${code}, amount=${amount}`);
    return Response.json({ data: result.schedule?.timeSlots ?? [] }, { status: 200, statusText: "success" });
  } catch (error: any) {
    logger.error(`Verification error: ${error.message}`);
    return Response.json({ error: error.message, data: null }, { status: 202, statusText: "error" });
  }
}
