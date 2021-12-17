FROM node:16
WORKDIR /app
COPY ./package.json ./
COPY ./tsconfig.json ./
COPY ./src ./src
RUN npm install
RUN npm build
CMD npm run start:prod