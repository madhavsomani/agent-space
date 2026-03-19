FROM node:22-alpine
WORKDIR /app
COPY *.js *.html *.css ./
COPY config.example.json LICENSE README.md CONTRIBUTING.md CHANGELOG.md ARCHITECTURE.md ./
COPY test/ ./test/
ENV BIND_HOST=0.0.0.0
ENV PORT=18790
EXPOSE 18790
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:18790/api/health || exit 1
CMD ["node", "server.js", "--demo"]
