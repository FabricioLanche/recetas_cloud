# Dockerfile for medical-prescriptions-service
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

# Copy source code
COPY . .

# Expose service port
EXPOSE 3000

# Environment defaults (can be overridden at runtime)
ENV NODE_ENV=production

# Start the service
CMD ["node", "src/app.js"]
