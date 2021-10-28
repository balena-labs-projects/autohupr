FROM node:14.18.1-alpine3.14

WORKDIR /usr/src/app

COPY package.json package-lock.json tsconfig.json ./

COPY src/ ./src/

RUN npm install && npm run build && npm prune --production

CMD [ "node", "./build/main.js" ]
