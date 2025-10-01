FROM mcr.microsoft.com/playwright:v1.55.1-jammy

WORKDIR /app

COPY package.json package-lock.json* /app/
RUN npm i

COPY tsconfig.json /app/
COPY src /app/src
RUN npx tsc -p tsconfig.json

ENV PORT=8787
EXPOSE 8787
CMD ["node", "dist/server.js"]

