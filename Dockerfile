### BUILD & INSTALL

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

COPY . .

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN pnpm prisma migrate deploy
RUN pnpm prisma generate

### PRODUCTION

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@10.11.0

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app .

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN pnpm prisma migrate deploy
RUN pnpm prisma generate

EXPOSE 3000

CMD ["pnpm", "dev"]
