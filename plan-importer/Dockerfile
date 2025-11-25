# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Create data directory
RUN mkdir -p /app/data

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy source files
COPY . .

# Command to run the app (edit if needed)
CMD ["node", "index.mjs"]
