import shutil
import tempfile
import threading
import uuid
from pathlib import Path

import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.background import BackgroundTask

app = FastAPI(title="YouTube Downloader")

DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "yt-downloader"
DOWNLOAD_DIR.mkdir(exist_ok=True)

FORMAT_PRESETS = {
    "best": "bestvideo+bestaudio/best",
    "2160p": "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
    "1440p": "bestvideo[height<=1440]+bestaudio/best[height<=1440]",
    "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "720p": "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "480p": "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "audio": "bestaudio/best",
}


JOBS: dict = {}
JOBS_LOCK = threading.Lock()


class InfoRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    quality: str = "best"


def _run_download(job_id: str, url: str, quality: str, job_dir: Path):
    def progress_hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)
            percent = round(downloaded / total * 100, 1) if total else None
            with JOBS_LOCK:
                JOBS[job_id]["status"] = "downloading"
                JOBS[job_id]["percent"] = percent
        elif d["status"] == "finished":
            with JOBS_LOCK:
                JOBS[job_id]["percent"] = 100.0

    def postprocessor_hook(d):
        if d["status"] == "started":
            with JOBS_LOCK:
                JOBS[job_id]["status"] = "processing"
                JOBS[job_id]["percent"] = None

    is_audio = quality == "audio"
    ydl_opts = {
        "quiet": True,
        "format": FORMAT_PRESETS[quality],
        "outtmpl": str(job_dir / "%(title)s.%(ext)s"),
        "progress_hooks": [progress_hook],
        "postprocessor_hooks": [postprocessor_hook],
    }
    if is_audio:
        ydl_opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}
        ]
    else:
        ydl_opts["merge_output_format"] = "mp4"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)
    except Exception as e:
        with JOBS_LOCK:
            JOBS[job_id]["status"] = "error"
            JOBS[job_id]["error"] = str(e)
        shutil.rmtree(job_dir, ignore_errors=True)
        return

    files = list(job_dir.iterdir())
    with JOBS_LOCK:
        if not files:
            JOBS[job_id]["status"] = "error"
            JOBS[job_id]["error"] = "Download produced no file"
        else:
            JOBS[job_id]["status"] = "finished"
            JOBS[job_id]["percent"] = 100.0
            JOBS[job_id]["filename"] = files[0].name
    if not files:
        shutil.rmtree(job_dir, ignore_errors=True)


@app.post("/api/info")
def get_info(payload: InfoRequest):
    ydl_opts = {"quiet": True, "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(payload.url, download=False)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "title": info.get("title"),
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
    }


@app.post("/api/download")
def start_download(payload: DownloadRequest):
    if payload.quality not in FORMAT_PRESETS:
        raise HTTPException(status_code=400, detail="Invalid quality preset")

    job_id = uuid.uuid4().hex
    job_dir = DOWNLOAD_DIR / job_id
    job_dir.mkdir()

    with JOBS_LOCK:
        JOBS[job_id] = {
            "status": "downloading",
            "percent": 0.0,
            "filename": None,
            "error": None,
            "dir": str(job_dir),
        }

    threading.Thread(
        target=_run_download,
        args=(job_id, payload.url, payload.quality, job_dir),
        daemon=True,
    ).start()

    return {"job_id": job_id}


@app.get("/api/progress/{job_id}")
def get_progress(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return {
            "status": job["status"],
            "percent": job["percent"],
            "error": job["error"],
        }


@app.get("/api/file/{job_id}")
def get_file(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job or job["status"] != "finished":
            raise HTTPException(status_code=404, detail="File not ready")
        job_dir = Path(job["dir"])
        filename = job["filename"]

    result_file = job_dir / filename
    if not result_file.exists():
        raise HTTPException(status_code=404, detail="File not found")

    def cleanup():
        shutil.rmtree(job_dir, ignore_errors=True)
        with JOBS_LOCK:
            JOBS.pop(job_id, None)

    return FileResponse(
        path=result_file,
        filename=filename,
        media_type="application/octet-stream",
        background=BackgroundTask(cleanup),
    )


app.mount(
    "/",
    StaticFiles(directory=Path(__file__).parent.parent / "frontend", html=True),
    name="frontend",
)
