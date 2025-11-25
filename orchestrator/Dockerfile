# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Build TypeScript (if needed)
RUN npm run build || true

# Expose port (if your app listens on one)
# EXPOSE 3000

# Start the app
CMD ["node", "dist/index.js"]
