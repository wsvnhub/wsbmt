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
  code: any;
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
    const body = await request.json();

    const { code, timslots, amount } = body;
    if (!process.env.BANK_API_BASE_URL) {
      throw new Error("Bank API chưa được cài đặt");
    }
    const { status, transactions }: MBBankResponse = await fetch(
      `${process.env.BANK_API_BASE_URL}/transactions/list?limit=100&amount_in=${amount}&transaction_date_min=${formatDate()}`,
      {
        headers: {
          Authorization: "Bearer " + process.env.BANK_API_KEY,
        },
      }
    ).then((response) => response.json());
    console.log(status, transactions);
    if (status !== 200 && transactions.length === 0) {
      throw new Error("Không thể lấy được thông tin giao dịch");
    }

    const message = {
      text: "Đơn hàng của bạn chưa được thanh toán",
      error: true,
    };

    let index = 0;
    while (index < transactions.length) {
      const { transaction_content, amount_in } = transactions[index];
      if (transaction_content.trim().includes(code) && Number(amount_in) === Number(amount)) {
        message.error = false;
        message.text = "Thanh toán thành công";
        break;
      }
      index++;
    }
    if (message.error) {
      throw new Error(message.text);
    }
    client = await clientPromise;
    const db = client.db(process.env.DB);
    const schedules = db.collection("schedules");
    const timeSlots = db.collection("timeslots");

    await schedules.updateOne(
      { transactionCode: code, status: "wait" },
      {
        $set: {
          status: "booked",
        },
      }
    );

    const updatedData = timslots.map((timeSlot: any) => {
      timeSlot.status = "booked";
      return timeSlot;
    });
    const updateQuery = updatedData.map((timeSlot: any) => {
      const { facility, id, index } = timeSlot;
      return timeSlots.updateOne(
        { facility, courtId: id, createdAt: index.createdAt },
        {
          $set: {
            [index.columnIndex]: timeSlot,
          },
        }
      );
    });
    await Promise.allSettled(updateQuery);
    logger.info(`Verification successful: code=${code}, amount=${amount}`);
    return Response.json(
      {
        data: updatedData,
      },
      { status: 200, statusText: "success" }
    );
  } catch (error: any) {
    logger.error(`Verification error: ${error.message}`);
    return Response.json(
      {
        error,
      },
      {
        status: 202,
        statusText: "error",
      }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
