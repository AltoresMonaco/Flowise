# Stage 1: Build frontend and backend
FROM node:20-alpine AS build

WORKDIR /app

# Copy your local Flowise repo into image
COPY . .

# Skip puppeteer chromium download during install
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install dependencies
RUN yarn install

# Build everything (both frontend and backend)
RUN yarn build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache chromium git python3 py3-pip make g++ build-base cairo-dev pango-dev curl

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy built app from previous stage
COPY --from=build /app /app

# Optional: expose port
EXPOSE 3000

# Start Flowise
CMD ["yarn", "start"]
