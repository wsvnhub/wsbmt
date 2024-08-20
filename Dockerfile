# Sử dụng Node.js làm hình ảnh cơ sở
FROM node:18-alpine

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Sao chép các tệp package.json và package-lock.json (nếu có)
COPY package*.json ./

# Cài đặt các phụ thuộc của ứng dụng
RUN npm install

# Sao chép toàn bộ mã nguồn ứng dụng vào container
COPY . .

# Mở cổng 3000 để truy cập ứng dụng
EXPOSE 3000

# Lệnh để chạy ứng dụng Next.js
CMD ["npm", "run", "dev"]
