import clientPromise from "@/lib/mongo";

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
const dummyData = {
  status: 200,
  error: null,
  messages: { success: true },
  transactions: [
    {
      id: "1291436",
      bank_brand_name: "MBBank",
      account_number: "688112688",
      transaction_date: "2024-08-09 16:00:40",
      amount_out: "0.00",
      amount_in: "2000.00",
      accumulated: "0.00",
      transaction_content: "LY QUANG DIEU CHUYEN TIEN- Ma GD ACSP/ Ud269904",
      reference_number: "FT24222008103706",
      code: null,
      sub_account: null,
      bank_account_id: "2375",
    },
    {
      id: "1291437",
      bank_brand_name: "MBBank",
      account_number: "688112688",
      transaction_date: "2024-08-12 16:00:40",
      amount_out: "0.00",
      amount_in: "200000.00",
      accumulated: "0.00",
      transaction_content: "WSB123456789",
      reference_number: "FT24222008103706",
      code: null,
      sub_account: null,
      bank_account_id: "2375",
    },
  ],
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { code, timslots, amount } = body;
    if (!process.env.BANK_API_BASE_URL) {
      throw new Error("Bank API chưa được cài đặt");
    }

    const { status, transactions }: MBBankResponse = await fetch(
      `${process.env.BANK_API_BASE_URL}/transactions/list?limit=100&amount_in=${amount}`,
      {
        headers: {
          Authorization: "Bearer FHJ6FOHAR9S0DDGMRTZGQRWAPBAGSXOICWBKLU2N1EQXGWEBH2E85YPKXCY7SQAD",
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
      if (transaction_content.trim() === code && Number(amount_in) === amount) {
        message.error = false;
        message.text = "Thanh toán thành công";
      }
      index++;
    }
    if (message.error) {
      throw new Error(message.text);
    }
    const client = await clientPromise;
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
    await client.close();
    return Response.json(
      {
        data: updatedData,
      },
      { status: 200, statusText: "success" }
    );
  } catch (error: any) {
    console.log(error);
    return Response.json(
      {
        error,
      },
      {
        status: 202,
        statusText: "error",
      }
    );
  }
}
