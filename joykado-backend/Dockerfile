FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create upload directories
RUN mkdir -p uploads/songs uploads/beatmaps && \
    mkdir -p uploads/songs/HipHop uploads/songs/Anime uploads/songs/JPOP uploads/songs/Rock uploads/songs/Misc && \
    mkdir -p uploads/beatmaps/HipHop uploads/beatmaps/Anime uploads/beatmaps/JPOP uploads/beatmaps/Rock uploads/beatmaps/Misc

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]

