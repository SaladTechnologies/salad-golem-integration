# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Create data directory
RUN mkdir -p /app/data

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Build TypeScript (if needed)
RUN npm run build

# Start the app
CMD ["node", "dist/index.js"]
