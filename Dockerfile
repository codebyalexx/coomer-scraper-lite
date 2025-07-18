### BUILD & INSTALL

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

### PRODUCTION

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@10.11.0

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

EXPOSE 3000

CMD ["pnpm", "dev"]
