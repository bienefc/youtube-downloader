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

# docker-compose.yml expects this file to exist (see "YouTube blocking the server" below);
# an empty file is fine if you don't need cookies yet
touch backend/cookies.txt

# build and run in the background, restarts on reboot/crash
docker compose up -d --build
```

The app is now listening on port 8000. Open the firewall if needed:

```bash
sudo ufw allow 8000/tcp
```

Visit `http://<your-vps-ip>:8000`.

No domain/TLS is set up — this serves plain HTTP on the raw port. Once you have a domain, point a subdomain at the VPS, switch the `ports` entry in `docker-compose.yml` back to `"127.0.0.1:8000:8000"`, and put Nginx + Let's Encrypt in front using `deploy/nginx.conf.example` as a starting point.

To update after pulling new commits:

```bash
git pull
docker compose up -d --build
```

Logs: `docker compose logs -f`. Stop: `docker compose down`.

## YouTube blocking the server ("Sign in to confirm you're not a bot")

YouTube challenges requests from datacenter/VPS IPs far more aggressively than home IPs. Two independent fixes are wired in — use either or both:

### PO token provider (automatic, no account needed)

`docker-compose.yml` runs a second container, [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider), which generates YouTube's "Proof of Origin" tokens for yt-dlp automatically. It requires no login and no per-user setup — `docker compose up -d --build` starts it alongside the app and yt-dlp picks it up via the `BGUTIL_POT_BASE_URL` environment variable already set in the compose file. Adds ~300-500MB RAM for the sidecar container; check `free -h` on the server has room before relying on it at scale.

### Cookies (manual fallback)

If PO tokens alone aren't enough for a given video, you can additionally feed yt-dlp cookies from a real, logged-in browser session:

1. Install a cookie-export extension (e.g. "Get cookies.txt LOCALLY") in a browser where you're logged into YouTube.
2. Export cookies for `youtube.com` to a Netscape-format `cookies.txt`.
3. Copy it to the server **directly via `scp`** — never paste the file's contents anywhere else (chat, email, etc.): `scp cookies.txt user@vps:~/apps/youtube-downloader/backend/cookies.txt`.
4. Lock down its permissions so only your user can read it: `chmod 600 backend/cookies.txt`.
5. `docker compose up -d --build` to pick it up.

The backend automatically uses `backend/cookies.txt` if present and non-empty, and ignores it otherwise. **Never commit this file** — it's already in `.gitignore`, since it contains your account's session cookies, unencrypted. Treat it like a password: whoever has it can act as your logged-in YouTube session. The cookies also expire periodically, so you'll need to re-export and re-copy them if the error comes back.

**Security tip:** use a separate/throwaway Google account for this instead of your main one. If the cookies file ever leaks, the blast radius is an account you don't care about, not your real one. If you ever suspect it did leak, go to that account's Google Account → Security → "Manage all devices" and sign out everywhere — that immediately invalidates the cookie.

## Notes

- Downloads run synchronously per request (fine for personal/local use). For multiple concurrent users or very large files, add a task queue (Celery/RQ + Redis) instead of blocking the request.
- Downloaded files are written to a temp directory and deleted right after being streamed to the browser.
- Only use this against content you have the right to download (your own uploads, Creative Commons content, etc.) — downloading YouTube videos generally violates YouTube's Terms of Service.
