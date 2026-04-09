FROM node:lts-alpine3.22

WORKDIR /app

COPY package.json /app

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 2000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "2000"]