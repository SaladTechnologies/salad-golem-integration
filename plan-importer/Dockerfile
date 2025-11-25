# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy source files
COPY . .

# Set environment variables (optional)
# ENV NODE_ENV=production

# Command to run the app (edit if needed)
CMD ["node", "index.mjs"]
