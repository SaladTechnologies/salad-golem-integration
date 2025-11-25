# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the project files
COPY . .

# Set environment variable for production (optional)
ENV NODE_ENV=production

# Expose port if your app listens on one (uncomment if needed)
# EXPOSE 3000

# Start the app (adjust entrypoint if needed)
CMD ["node", "index.mjs"]
