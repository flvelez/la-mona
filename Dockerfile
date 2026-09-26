# La Mona: un proceso Node de siempre, no una función sin estado.
# Las salas viven en memoria, así que todos los jugadores de una partida
# tienen que caer en ESTA máquina. Ver DESPLIEGUE.md.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Las dependencias primero, para aprovechar la caché entre despliegues.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY core ./core
COPY servidor ./servidor
COPY cliente ./cliente

USER node
EXPOSE 3000

CMD ["node", "servidor/index.js"]
