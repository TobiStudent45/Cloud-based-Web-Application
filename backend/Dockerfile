# ─────────────────────────────────────────────────────────────
# API Gateway – Node.js
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Zuerst nur die Manifeste kopieren -> besseres Layer-Caching
COPY package*.json ./
RUN npm install --omit=dev

# Danach den restlichen Quellcode
COPY . .

# Interner Port (nicht nach außen veröffentlicht – nur im app-net erreichbar)
EXPOSE 3000

CMD ["node", "server.js"]
