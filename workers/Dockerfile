# Worker node image — README §9.
# Zero npm dependencies, so there is nothing to install: just copy the script in.
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./

ENV PORT=4000
EXPOSE 4000

# Run as the built-in unprivileged user.
USER node

CMD ["node", "server.js"]
