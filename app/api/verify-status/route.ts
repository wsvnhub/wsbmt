import clientPromise from "@/lib/mongo";
import { formatDate } from "@/utils";
import { logger } from "@/utils/logger";

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
    const { code, timslots, amount } = await request.json();

    if (!process.env.BANK_API_BASE_URL) {
      throw new Error("Bank API chưa được cài đặt");
    }
    const url = false ? "http://localhost:3000/api/pay-sanbox" : `${process.env.BANK_API_BASE_URL}/transactions/list?limit=100&amount_in=${amount}&transaction_date_min=${formatDate()}`
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


    client = await clientPromise;
    const db = client.db(process.env.DB);
    const schedules = db.collection("schedules");
    const timeSlots = db.collection("timeslots");

    await schedules.updateOne(
      { transactionCode: code, status: "wait" },
      { $set: { status: "booked" } }
    );

    const updatedData = timslots.map((timeSlot: any) => ({ ...timeSlot, status: "booked" }));

    const updateOperations = updatedData.map((timeSlot: any) => ({
      updateOne: {
        filter: { facility: timeSlot.facility, courtId: timeSlot.id, createdAt: timeSlot.index.createdAt },
        update: { $set: { [timeSlot.index.columnIndex]: timeSlot } }
      }
    }));

    await timeSlots.bulkWrite(updateOperations);

    logger.info(`Verification successful: code=${code}, amount=${amount}`);
    return Response.json({ data: updatedData }, { status: 200, statusText: "success" });
  } catch (error: any) {
    logger.error(`Verification error: ${error.message}`);
    return Response.json({ error }, { status: 202, statusText: "error" });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
