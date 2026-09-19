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

## Notes

- Downloads run synchronously per request (fine for personal/local use). For multiple concurrent users or very large files, add a task queue (Celery/RQ + Redis) instead of blocking the request.
- Downloaded files are written to a temp directory and deleted right after being streamed to the browser.
- Only use this against content you have the right to download (your own uploads, Creative Commons content, etc.) — downloading YouTube videos generally violates YouTube's Terms of Service.
