FROM node:20-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
