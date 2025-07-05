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
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function generateTransactionCode() {
  const now = Date.now();
  const timestamp = Math.floor(now / 1000);
  const micro = Math.floor((now % 1000) / 100);
  return `WSB${Math.floor(timestamp / 10) * 10 + micro}`;
}