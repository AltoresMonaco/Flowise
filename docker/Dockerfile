# Stage 1: Build frontend and backend
FROM node:20-alpine AS build

WORKDIR /app

# Copy your local Flowise repo into image
COPY . .

# Skip Puppeteer Chromium download during install
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install all dependencies
RUN yarn install

# Build frontend and backend
RUN yarn build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache chromium git python3 py3-pip make g++ build-base cairo-dev pango-dev curl

# Set Puppeteer Chromium path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy built app from the previous stage
COPY --from=build /app /app

# Expose Flowise default port
EXPOSE 3000

# Start Flowise
CMD ["yarn", "start"]
