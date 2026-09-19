# YouTube Downloader

FastAPI + yt-dlp backend, vanilla HTML/CSS/JS frontend. Paste a YouTube URL, pick a quality (up to 4K, or audio-only MP3), and download — with a live progress bar and a dark/light mode toggle.

## Prerequisites

- Python 3.10+
- [ffmpeg](https://ffmpeg.org/download.html) installed and on your PATH (needed to merge video+audio streams and to extract MP3 audio)

## Setup

```bash
git clone https://github.com/bienefc/youtube-downloader.git
cd youtube-downloader/backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

(On macOS/Linux, activate with `source venv/bin/activate` instead.)

## Run

```bash
cd backend
venv\Scripts\python -m uvicorn main:app --reload
```

Open http://127.0.0.1:8000 — the backend serves the frontend directly, so there's nothing else to start.

If `--reload` ever seems to not pick up a code change (rare, but file watchers can get stuck), just stop the server (Ctrl+C) and start it again.

## How it works

- `POST /api/info` — fetches title/thumbnail/duration for a URL without downloading.
- `POST /api/download` — starts a download job in the background and returns a `job_id` immediately.
- `GET /api/progress/{job_id}` — polled by the frontend every ~600ms; reports real byte-level percent from yt-dlp, or a "processing" state while ffmpeg merges audio+video.
- `GET /api/file/{job_id}` — once finished, streams the file to the browser and deletes the server-side temp copy right after.

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

No domain/TLS is set up by default — this serves plain HTTP on the raw port. Once you have a domain: point a subdomain at the VPS, change the `ports` entry in `docker-compose.yml` to `"127.0.0.1:8000:8000"` (stop exposing it directly), and put Nginx + Let's Encrypt in front using `deploy/nginx.conf.example` as a starting point (`certbot --nginx -d yourdomain.com` handles the TLS cert).

To update after pulling new commits:

```bash
git pull
docker compose up -d --build
```

Logs: `docker compose logs -f`. Stop: `docker compose down`.

## Notes

- Each download runs as a background job per request; the server-side temp file is deleted immediately after it's streamed to the browser (whether it finishes or fails).
- If YouTube blocks a request with a bot-check ("Sign in to confirm you're not a bot"), that's YouTube flagging the server's IP — more likely on a datacenter/VPS IP than a home connection. There's no built-in workaround for this currently.
- Only use this against content you have the right to download (your own uploads, Creative Commons content, etc.) — downloading YouTube videos generally violates YouTube's Terms of Service.
