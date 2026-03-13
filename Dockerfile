FROM node:20-slim

WORKDIR /app

# Copy package files first (for better caching)
COPY package.json package-lock.json ./

# Install all deps (including devDeps for build)
RUN npm ci

# Copy source files
COPY . .

# Build TypeScript
RUN npx tsc

# Remove devDeps for smaller image
RUN npm prune --production

# Expose port
EXPOSE 3000

# Railway sets PORT env var
ENV NODE_ENV=production

# Start the server
CMD ["node", "dist/server.js"]
