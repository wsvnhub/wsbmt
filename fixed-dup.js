import { readFileSync } from "fs";

const FILE_PATH = "./exported_data.json";

const TARGET_DATE = "Wed Jul 01 2026";

const content = readFileSync(FILE_PATH, "utf8");
const lines = content.split("\n");

let foundLine = -1;
let recordCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Đếm record
  if (line.trim() === "{") {
    recordCount++;
  }

  // Tìm ngày
  if (
    line.includes('"createdAt"') &&
    line.includes(TARGET_DATE)
  ) {
    foundLine = i + 1;
    break;
  }
}

console.log("Tổng dòng:", lines.length.toLocaleString());
console.log("Tổng record (ước lượng):", recordCount);

if (foundLine !== -1) {
  console.log(
    `Ngày ${TARGET_DATE} xuất hiện đầu tiên tại dòng:`,
    foundLine.toLocaleString()
  );
} else {
  console.log("Không tìm thấy ngày:", TARGET_DATE);
}