FROM node:20-alpine

WORKDIR /app

# 零依赖项目：不需要 npm install，直接拷贝源码
COPY package.json ./
COPY src ./src
COPY public ./public

ENV PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "src/index.js"]
