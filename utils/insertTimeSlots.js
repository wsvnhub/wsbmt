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
    let month = fromDate.getMonth()
    const lastDate = toDate.getDate();

    let i = fromDate.getDate();
    const filterCourt = courtIds.length > 0 ? { id: { $in: courtIds } } : {};
    const courts = await db.collection("courts").find(filterCourt).toArray();
    console.log(i, lastDate, month);
    do {
        while (i <= lastDate) {
            const date = new Date();
            date.setFullYear(fromDate.getFullYear())
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
        month++;
    } while (month < toDate.getMonth())


}