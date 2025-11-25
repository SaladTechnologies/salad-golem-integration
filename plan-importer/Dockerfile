# Use official Node.js LTS image
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Create data directory
RUN mkdir -p /app/data

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the project files
COPY . .

# Start the app
CMD ["node", "index.mjs"]
