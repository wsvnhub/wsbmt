import { MongoClient } from "mongodb";
import { config } from "dotenv";
config()
const client = new MongoClient(process.env.MONGODB_URI);
console.log("MONGODB_URI", process.env.MONGODB_URI)
async function run() {
    try {
        await client.connect();
        const db = client.db();
        const timeslotsCollection = db.collection("timeslots");
        const statsCollection = db.collection("branch_stats"); // Collection mới

        const todayStr = new Date().toDateString();

        const query = {
            createdAt: { $gte: todayStr, $lte: todayStr },
        };

        const slots = await timeslotsCollection.find(query).toArray();

        console.log("slots", slots.length)
        const statsByBranch = {}; // Object để lưu thống kê tạm thời theo từng chi nhánh

        // Giả sử bạn có một collection 'branches'
        const branches = await db.collection('facilities').find({}).toArray();
        for (const branch of branches) {
            statsByBranch[branch.id.toString()] = {
                branchId: branch.id,
                branchName: branch.name,
                emptySlotsCount: 0,
                bookedSlotsCount: 0,
                totalSlotsCount: 0
            };
        }


        for (const slot of slots) {
            const branchIdStr = slot.facility;
            if (!statsByBranch[branchIdStr]) continue; // Bỏ qua nếu slot thuộc chi nhánh không còn hoạt động

            // const isToday = new Date(slot.date).toDateString() === todayStr;

            for (const [key, value] of Object.entries(slot)) {
                if (!isNaN(Number(key)) && typeof value === 'object' && value !== null) {
                    statsByBranch[branchIdStr].totalSlotsCount++;
                    if (value.status === "empty") {
                        statsByBranch[branchIdStr].emptySlotsCount++;
                    }
                    if (value.status === "booked") {
                        statsByBranch[branchIdStr].bookedSlotsCount++;
                    }
                }
            }
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Chuẩn bị dữ liệu để insert vào collection branch_stats
        const newStatsDocuments = Object.values(statsByBranch).map(branchData => ({
            date: today,
            branchId: branchData.branchId,
            branchName: branchData.branchName,
            stats: {
                emptySlotsCount: branchData.emptySlotsCount,
                bookedSlotsCount: branchData.bookedSlotsCount,
                totalSlotsCount: branchData.totalSlotsCount
            },
            createdAt: new Date()
        }));

        if (newStatsDocuments.length > 0) {
            // Xóa thống kê cũ của ngày hôm nay (nếu có) để tránh trùng lặp
            await statsCollection.deleteMany({ date: today });
            // Insert thống kê mới
            const result = await statsCollection.insertMany(newStatsDocuments);
            console.log(`Ngày ${new Date().toLocaleString('vi-VN')}: Đã lưu thành công ${result.insertedCount} bản ghi thống kê.`);
        } else {
            console.log(`Ngày ${new Date().toLocaleString('vi-VN')}: Không có dữ liệu thống kê để lưu.`);
        }

    } finally {
        await client.close();
    }
}

run().catch(console.dir);