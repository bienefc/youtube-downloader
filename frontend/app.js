(function initTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) {
    // localStorage unavailable; fall back to system preference
  }
})();

const themeToggle = document.getElementById("theme-toggle");
themeToggle.addEventListener("click", () => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const current = root.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch (e) {
    // ignore
  }
});

const urlInput = document.getElementById("url-input");
const fetchBtn = document.getElementById("fetch-btn");
const downloadBtn = document.getElementById("download-btn");
const qualitySelect = document.getElementById("quality-select");
const errorMsg = document.getElementById("error-msg");
const statusMsg = document.getElementById("status-msg");
const progressWrap = document.getElementById("progress-wrap");
const progressFill = document.getElementById("progress-fill");
const videoCard = document.getElementById("video-card");
const videoThumb = document.getElementById("video-thumb");
const videoTitle = document.getElementById("video-title");
const videoUploader = document.getElementById("video-uploader");
const videoDuration = document.getElementById("video-duration");

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.hidden = false;
}

function clearError() {
  errorMsg.hidden = true;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

async function fetchInfo() {
  const url = urlInput.value.trim();
  if (!url) {
    showError("Paste a YouTube URL first.");
    return;
  }
  clearError();
  videoCard.hidden = true;
  fetchBtn.disabled = true;
  fetchBtn.textContent = "Loading...";

  try {
    const res = await fetch("/api/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Could not fetch video info.");
    }

    videoThumb.src = data.thumbnail || "";
    videoTitle.textContent = data.title || "Untitled";
    videoUploader.textContent = data.uploader || "";
    videoDuration.textContent = formatDuration(data.duration);
    videoCard.hidden = false;
  } catch (err) {
    showError(err.message);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = "Fetch";
  }
}

function setProgress(percent, indeterminate) {
  progressWrap.hidden = false;
  progressFill.classList.toggle("indeterminate", indeterminate);
  progressFill.style.width = indeterminate ? "" : `${percent}%`;
}

function hideProgress() {
  progressWrap.hidden = true;
  progressFill.classList.remove("indeterminate");
  progressFill.style.width = "0%";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollProgress(jobId) {
  while (true) {
    const res = await fetch(`/api/progress/${jobId}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Lost track of the download.");
    }

    if (data.status === "error") {
      throw new Error(data.error || "Download failed.");
    }

    if (data.status === "processing") {
      statusMsg.textContent = "Merging audio and video...";
      setProgress(0, true);
    } else if (data.status === "finished") {
      statusMsg.textContent = "Finishing up...";
      setProgress(100, false);
      return;
    } else if (data.percent != null) {
      statusMsg.textContent = `Downloading... ${data.percent}%`;
      setProgress(data.percent, false);
    } else {
      statusMsg.textContent = "Downloading...";
      setProgress(0, true);
    }

    await sleep(600);
  }
}

async function downloadVideo() {
  const url = urlInput.value.trim();
  const quality = qualitySelect.value;
  clearError();
  downloadBtn.disabled = true;
  statusMsg.hidden = false;
  statusMsg.textContent = "Starting download...";
  setProgress(0, true);

  try {
    const startRes = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, quality }),
    });
    const startData = await startRes.json();
    if (!startRes.ok) {
      throw new Error(startData.detail || "Download failed to start.");
    }

    await pollProgress(startData.job_id);

    const fileRes = await fetch(`/api/file/${startData.job_id}`);
    if (!fileRes.ok) {
      const data = await fileRes.json().catch(() => ({}));
      throw new Error(data.detail || "Download failed.");
    }

    const disposition = fileRes.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/);
    const filename = match ? decodeURIComponent(match[1]) : "video";

    const blob = await fileRes.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);

    statusMsg.textContent = "Done.";
  } catch (err) {
    showError(err.message);
    statusMsg.hidden = true;
    hideProgress();
  } finally {
    downloadBtn.disabled = false;
  }
}

fetchBtn.addEventListener("click", fetchInfo);
downloadBtn.addEventListener("click", downloadVideo);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchInfo();
});
