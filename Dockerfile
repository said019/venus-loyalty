FROM node:22-bookworm-slim

WORKDIR /app

# Python 3.11 and native libraries used by OpenCV, MediaPipe and node-canvas.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl python3 python3-venv make g++ pkg-config \
    libgl1 libegl1 libglib2.0-0 libcairo2-dev libpango1.0-dev \
    libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev --no-audit --no-fund

COPY tools/skin-layers/requirements.txt /tmp/skin-requirements.txt
RUN python3 -m venv /opt/skin-venv \
    && /opt/skin-venv/bin/pip install --no-cache-dir -r /tmp/skin-requirements.txt

ENV NODE_ENV=production \
    SKIN_LAYERS_PYTHON=/opt/skin-venv/bin/python \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1

COPY . .
RUN /opt/skin-venv/bin/python tools/skin-layers/check_runtime.py

CMD ["node", "server.js"]
