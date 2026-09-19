# YouTube Downloader

FastAPI + yt-dlp backend, vanilla HTML/CSS/JS frontend with a dark/light mode toggle.

## Prerequisites

- Python 3.10+
- [ffmpeg](https://ffmpeg.org/download.html) installed and on your PATH (needed to merge video+audio and to extract MP3 audio)

## Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
cd backend
uvicorn main:app --reload
```

Open http://127.0.0.1:8000 — the backend serves the frontend directly, so there's nothing else to start.

## Deploy (Docker, e.g. on a VPS)

Prerequisites on the server: Docker + the Compose plugin.

```bash
# install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out/in (or `newgrp docker`) after this

# get the code
git clone https://github.com/bienefc/youtube-downloader.git
cd youtube-downloader

# build and run in the background, restarts on reboot/crash
docker compose up -d --build
```

The app is now listening on port 8000. Open the firewall if needed:

```bash
sudo ufw allow 8000/tcp
```

Visit `http://<your-vps-ip>:8000`.

To update after pulling new commits:

```bash
git pull
docker compose up -d --build
```

Logs: `docker compose logs -f`. Stop: `docker compose down`.

No domain/TLS is set up — this serves plain HTTP on the raw port. Put Nginx + Let's Encrypt in front later if you point a domain at it.

## Notes

- Downloads run synchronously per request (fine for personal/local use). For multiple concurrent users or very large files, add a task queue (Celery/RQ + Redis) instead of blocking the request.
- Downloaded files are written to a temp directory and deleted right after being streamed to the browser.
- Only use this against content you have the right to download (your own uploads, Creative Commons content, etc.) — downloading YouTube videos generally violates YouTube's Terms of Service.
