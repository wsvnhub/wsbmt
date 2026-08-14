export const VND = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

export const formatDate = () => {
  const date = new Date();
  date.setHours(date.getHours() - 3)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  return formattedDate
}

export function timeToMinutes(time: string) {
  if (!time) {
    return ''
  }
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Mã nội dung chuyển khoản, phải là duy nhất trên toàn hệ thống.
 *
 * Bản cũ là `WSB${floor(timestamp/10)*10 + micro}` với micro ∈ 0..9, tức chỉ
 * phân giải tới 10 giây + 1 chữ số. Hai đơn trong cùng cửa sổ 10 giây có ~1/10
 * khả năng trùng mã, và khi trùng thì findOne({transactionCode}) ở
 * app/api/booking/route.ts lấy đơn bất kỳ — tiền của khách A xác nhận đơn của
 * khách B. Có unique index trên schedules.transactionCode thì thành E11000 khi
 * tạo đơn; không có index thì thành đặt trùng sân.
 *
 * Giữ nguyên định dạng "WSB + toàn chữ số" để không phá vỡ cách SePay/MBBank
 * trích mã từ nội dung chuyển khoản (xem app/api/verify-status/route.ts:64).
 */
export function generateTransactionCode() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const suffix = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2])
    .toString()
    .padStart(8, "0");
  return `WSB${Date.now()}${suffix}`;
}