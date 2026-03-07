FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built frontend and server source
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Install tsx for running TypeScript
RUN npm install -g tsx

ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000

VOLUME ["/data"]

CMD ["tsx", "src/local.ts"]
