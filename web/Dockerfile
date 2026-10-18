FROM node:22-alpine

WORKDIR /workspace/web
RUN chown node:node /workspace/web
USER node
COPY --chown=node:node web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node web ./

EXPOSE 5173
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=20 \
    CMD node -e "fetch('http://127.0.0.1:5173').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
