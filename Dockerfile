FROM node:22-alpine
WORKDIR /app
COPY *.js *.html *.json ./
COPY assets/ ./assets/
RUN rm -f config.json memory-history.json
EXPOSE 18790
ENV PORT=18790
CMD ["node", "server.js"]
