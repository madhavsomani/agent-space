FROM node:22-alpine

WORKDIR /app

# Copy full app (runtime has zero npm deps).
# .dockerignore keeps secrets/local state out of the image.
COPY . .

# Ensure no local runtime state/secrets are baked into image layers.
RUN rm -f config.json memory-history.json agent-space.db agent-space.db-shm agent-space.db-wal || true

ENV PORT=18790 \
    BIND_HOST=0.0.0.0

EXPOSE 18790

CMD ["node", "server.js"]
