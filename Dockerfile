# Agent 可观测平台 Dockerfile
# 构建: docker build -t agent-telemetry .
# 运行: docker compose up

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY public/ ./public/
COPY data/ ./data/

ENV PORT=3000
ENV AGENT_TELEMETRY_TOKEN=""

EXPOSE 3000

CMD ["npx", "tsx", "src/demo-server.ts"]
