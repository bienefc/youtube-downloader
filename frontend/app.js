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

async function downloadVideo() {
  const url = urlInput.value.trim();
  const quality = qualitySelect.value;
  clearError();
  downloadBtn.disabled = true;
  statusMsg.hidden = false;
  statusMsg.textContent = "Downloading... this can take a while for large videos.";

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, quality }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Download failed.");
    }

    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/);
    const filename = match ? decodeURIComponent(match[1]) : "video";

    const blob = await res.blob();
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
  } finally {
    downloadBtn.disabled = false;
  }
}

fetchBtn.addEventListener("click", fetchInfo);
downloadBtn.addEventListener("click", downloadVideo);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchInfo();
});
