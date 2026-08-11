FROM node:20-alpine
ENV NODE_ENV=production PORT=8888
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
USER node
EXPOSE 8888
CMD ["node", "src/server.js"]
