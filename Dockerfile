FROM node:22-alpine
WORKDIR /app
COPY server.js index.html config.example.json LICENSE README.md CONTRIBUTING.md ./
ENV BIND_HOST=0.0.0.0
EXPOSE 18790
CMD ["node", "server.js", "--demo"]
