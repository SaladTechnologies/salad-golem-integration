# Use official Node.js LTS image
FROM node:24-alpine AS build

# Set working directory
WORKDIR /app

# Create data directory
RUN mkdir -p /app/data

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the project files
COPY . .

# Build TypeScript
RUN npm run build

# Use official Node.js LTS image
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Create data directory
RUN mkdir -p /app/data

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy the project files
COPY --from=build /app/dist /app/dist

# Start the app
CMD ["node", "dist/index.js"]
