import shutil
import tempfile
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


class InfoRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    quality: str = "best"


def _cleanup_task(path: Path) -> BackgroundTask:
    return BackgroundTask(shutil.rmtree, path, ignore_errors=True)


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
def download(payload: DownloadRequest):
    if payload.quality not in FORMAT_PRESETS:
        raise HTTPException(status_code=400, detail="Invalid quality preset")

    job_dir = DOWNLOAD_DIR / uuid.uuid4().hex
    job_dir.mkdir()

    is_audio = payload.quality == "audio"
    ydl_opts = {
        "quiet": True,
        "format": FORMAT_PRESETS[payload.quality],
        "outtmpl": str(job_dir / "%(title)s.%(ext)s"),
    }
    if is_audio:
        ydl_opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}
        ]
    else:
        ydl_opts["merge_output_format"] = "mp4"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(payload.url, download=True)
    except yt_dlp.utils.DownloadError as e:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(e))

    files = list(job_dir.iterdir())
    if not files:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Download produced no file")

    result_file = files[0]
    return FileResponse(
        path=result_file,
        filename=result_file.name,
        media_type="application/octet-stream",
        background=_cleanup_task(job_dir),
    )


app.mount(
    "/",
    StaticFiles(directory=Path(__file__).parent.parent / "frontend", html=True),
    name="frontend",
)
