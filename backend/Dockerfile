FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=7778
EXPOSE 7778

CMD ["node", "./bin/www"]
