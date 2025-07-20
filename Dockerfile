FROM node:20-alpine

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

EXPOSE 3000

CMD ["pnpm", "dev"]
