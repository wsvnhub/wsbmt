import { generateTimeArray } from "./genTimeSlotsByJson.js";
import { ObjectId } from "mongodb";


export const insertTimeslots = async ({ db, courtIds = [], maxMonth = 12 }) => {
    let month = new Date().getMonth()
    while (month < maxMonth) {
        const lastDate = new Date(
            new Date().getFullYear(),
            month + 1,
            0
        ).getDate();
        let i = new Date(new Date().getFullYear(), month, 1).getDate();
        const filterCourt = courtIds.length > 0 ? { id: { $in: courtIds } } : {};
        const courts = await db.collection("courts").find(filterCourt).toArray();
        console.log(i, lastDate);

        while (i <= lastDate) {
            const date = new Date();
            date.setMonth(month)
            date.setDate(i);
            console.log(date.toDateString());
            const insertData = courts.map((court) => {
                const timeslots = generateTimeArray(court.timeClusterId);
                return {
                    id: new ObjectId().toString(),
                    facility: court.facilitiyId,
                    courtId: court.id,
                    court: court.name,
                    timeClusterId: court.timeClusterId,
                    ...timeslots,
                    createdAt: date.toDateString(),
                };
            });
            await db.collection("timeslots").insertMany(insertData);
            i++;
        }
        month++
    }
}

export const insertCustomDateTimeslots = async ({ db, courtIds = [], fromDate, toDate }) => {
    // Chuẩn hoá về 00:00 theo ngày, bỏ phần giờ để so sánh/duyệt theo ngày.
    const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error(`Ngày không hợp lệ: from=${fromDate}, to=${toDate}`);
    }
    if (start > end) {
        throw new Error(`Ngày bắt đầu lớn hơn ngày kết thúc: ${start.toDateString()} > ${end.toDateString()}`);
    }

    const filterCourt = courtIds.length > 0 ? { id: { $in: courtIds } } : {};
    const courts = await db.collection("courts").find(filterCourt).toArray();
    if (courts.length === 0) return;

    // Duyệt từng ngày từ start -> end (đúng kể cả khi qua nhiều tháng/năm).
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const createdAt = d.toDateString();
        const insertData = courts.map((court) => {
            const timeslots = generateTimeArray(court.timeClusterId);
            return {
                id: new ObjectId().toString(),
                facility: court.facilitiyId,
                courtId: court.id,
                court: court.name,
                timeClusterId: court.timeClusterId,
                ...timeslots,
                createdAt,
            };
        });
        await db.collection("timeslots").insertMany(insertData);
    }
}