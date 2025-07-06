import { logger, errorLogger, larkLogger } from "./logger.js";
import { createLarkRecord } from "./lark.js";

const actionsStatus = {
    add: "empty",
    update: "booked",
    delete: "wait",
}
export const updateTimeSlot = async ({ timeSlotsData, collection, action = "add" }) => {
    logger.info(`Updating time slots status: ${JSON.stringify(timeSlotsData)}`);
    const updatePromises = timeSlotsData.map(({ facility, id, index, ...rest }) => {
        const availability = action === "add" ? true : false
        return collection.updateOne(
            { facility, courtId: id, createdAt: index.createdAt, [index.columnIndex + ".status"]: actionsStatus[action] },
            { $set: { [index.columnIndex]: { facility, id, index, availability, ...rest } } }
        )
    }
    );
    return Promise.allSettled(updatePromises);
};


export const updatedTimeSlotStatus = async ({ code, db }) => {

    try {

        const schedules = db.collection("schedules");
        const collection = db.collection("timeslots");


        const schedule = await schedules.findOne({ transactionCode: code, status: "booked" });
        if (!schedule) {
            errorLogger.error(`"Order not paid yet" ${code}`)
            throw new Error("Order not paid yet");
        }

        larkLogger.info(`Updated record successfully: ${code}`);
        // callback({ success: true, data: schedule.larkRecordId });

        const newRecord = {
            fields: {
                time_order: Date.now(),
                // chi_nhanh: uniqueIds,
                ND_CK: schedule.transactionCode,
                name: schedule.userName,
                phone: schedule.phone,
                email: schedule.email,
                san: schedule.formateddetails,
                address: Object.values(schedule.address).join(", "),
                date: schedule.dates.join(", "),
                time: schedule.totalHours,
                quantity: schedule.timeSlots.length,
                total_money: schedule.totalPrice,
                voucher_code: schedule.applyDiscount,
                trang_thai: "booked",
                dat_co_dinh: schedule.isFixed ? "True" : "False",
            },
        };

        logger.info(`updated payment status ${JSON.stringify(schedule.timeSlots)}`)
        void createLarkRecord(newRecord)
        const timeSlotsData = schedule.timeSlots.map((timeSlot) => ({ ...timeSlot, status: "booked" }))

        const res = await updateTimeSlot({ timeSlotsData, collection, action: "delete" });
        logger.info(`updated action schedules :updateTimeSlot - ${JSON.stringify(res)}`)
    } catch (error) {
        errorLogger.error(`updated timeslot status error:  ${JSON.stringify(error)}`)
    }
}