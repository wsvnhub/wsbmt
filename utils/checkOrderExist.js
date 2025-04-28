// Dữ liệu mới bạn muốn kiểm tra
// const schedulesData = {
//     totalHours: 1,
//     totalPrice: 139000,
//     details: 'Sân 2 - 15:35 đến 16:35',
//     formateddetails: 'Sân 2 - 15:35 đến 16:35 (28/04/2025 - CN NQA)',
//     facility: { 'CN NQA': 'CN NQA' },
//     phone: '0912345678',
//     userName: 'test dup 1',
//     email: 'test@gamil.com',
//     dates: ['4/28/2025'], // Quan trọng: Cần xem xét cả ngày nếu cần
//     isFixed: false,
//     applyDiscount: '',
//     transactionCode: 'WSB1745829722',
//     timeSlots: [
//         {
//             facility: 'CN NQA',
//             court: 'Sân 2',
//             from: '15:35',
//             to: '16:35',
//             hour: 1,
//             // status và availability của dữ liệu mới không quan trọng cho việc kiểm tra trùng lặp
//             bookedBy: {}, // Giả sử là object
//             isFixed: false,
//             // availability: true, // Không cần thiết khi kiểm tra
//             id: 'NQA-2',
//             index: {} // Giả sử là object
//         }
//         // Có thể có nhiều timeSlot khác ở đây
//     ],
//     address: ['CN NQA']
// };

// --- Query kiểm tra trùng lặp ---

export const checkOrderExist = async (schedulesData, collection) => {
    const timeSlotConditions = schedulesData.timeSlots.map(newSlot => ({
        timeSlots: {
            $elemMatch: {
                facility: newSlot.facility,
                court: newSlot.court,
                from: newSlot.from,
                to: newSlot.to,
                // id: newSlot.id, // Thêm ID nếu nó là một phần của định danh duy nhất cho slot thời gian này
                // availability: false // Điều kiện quan trọng: kiểm tra với các slot đã tồn tại và không khả dụng
            }
        }
    }));

    const query = {
        status: "wait",
        dates: { $in: schedulesData.dates },
        $or: timeSlotConditions
    };
    const data = await collection.findOne(query);

    // 4. Kiểm tra kết quả
    if (data) {
        return true
    }
    return false

}