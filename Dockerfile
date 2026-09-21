FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    SEED_VC_DIR=/opt/seed-vc

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git build-essential && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/Plachtaa/seed-vc.git /opt/seed-vc
RUN pip install --no-cache-dir -r /opt/seed-vc/requirements.txt demucs

WORKDIR /app
COPY . /app
RUN python -m demucs --two-stems=vocals -n htdemucs --out /tmp/stems /app/assets/go-beyond-clip.mp3 && \
    mv /tmp/stems/htdemucs/go-beyond-clip/vocals.wav /app/assets/go-beyond-vocals.wav && \
    rm -rf /tmp/stems
ENV ECHO_SOURCE_PATH=/app/assets/go-beyond-vocals.wav
EXPOSE 7860
CMD ["python", "server.py"]
