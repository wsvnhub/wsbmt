import { generateTimeArray } from "./genTimeSlotsByJson.js";
import { ObjectId } from "mongodb";


export const insertTimeslots = async ({ db }) => {
    let month = new Date().getMonth()
    while (month < 12) {
        const lastDate = new Date(
            new Date().getFullYear(),
            month + 1,
            0
        ).getDate();
        let i = new Date(new Date().getFullYear(), month, 1).getDate();

        const courts = await db.collection("courts").find().toArray();
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