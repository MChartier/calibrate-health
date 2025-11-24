FROM node:20-bullseye-slim
WORKDIR /app

# Install dependencies for Prisma (libssl1.1 compat via openssl + ca-certificates)
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
COPY tsconfig.json ./tsconfig.json
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate

CMD ["npm", "run", "dev"]
