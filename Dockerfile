FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js index.html ./
COPY config.example.json ./
ENV BIND_HOST=0.0.0.0
EXPOSE 18790
CMD ["node", "server.js"]
