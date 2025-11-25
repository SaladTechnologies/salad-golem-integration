# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Create data directory
RUN mkdir -p /app/data

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the project files
COPY . .

# Start the app (adjust entrypoint if needed)
CMD ["node", "index.mjs"]
