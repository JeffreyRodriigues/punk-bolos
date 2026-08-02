# ============================================================
# DOCKERFILE — Punk Bolos (servidor estático Node puro)
# Node usa apenas módulos nativos (http, fs, path), sem npm install.
# Build:  docker build -t punk-bolos .
# Rodar:  docker run -p 3000:3000 punk-bolos
# ============================================================
FROM node:20-alpine

WORKDIR /app

# Copia o projeto inteiro (nada de node_modules/.git graças ao .dockerignore)
COPY . .

# Porta padrão; o host pode sobrescrever via variável de ambiente PORT
ENV PORT=3000
EXPOSE 3000

# Verificação de saúde (busybox wget já vem na imagem alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

CMD ["node", "server.js"]
