FROM node:20-bullseye

WORKDIR /app

# Install basic development tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

CMD ["sleep", "infinity"]
