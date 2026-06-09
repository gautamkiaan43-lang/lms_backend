FROM node:22-bookworm

# Install Chromium and required fonts/dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and prisma directory
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies, skipping puppeteer's chromium download to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm ci

# Copy application source
COPY . .

# Generate Prisma Client and push DB schema
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
