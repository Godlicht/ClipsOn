"""Loopback-only API. Uploads stream to disk; one transcription runs at a time."""
import asyncio
from contextlib import asynccontextmanager
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import time
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
JOBS = ROOT / "backend" / ".runtime" / "jobs"
JOBS.mkdir(parents=True, exist_ok=True)
TERMINAL = {"completed", "failed", "cancelled"}
LANGUAGES = {"pl", "en", "de", "es", "fr", "uk", "auto"}
MODELS = {"large-v3", "medium"}
ALLOWED_ORIGINS = ["https://clipson-studio.earthyash12.chatgpt.site", "http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8765", "http://localhost:8765"]


class JobManager:
    def __init__(self):
        self.jobs = {}
        self.lock = threading.Lock()

    def reserve(self, identifier=None):
        with self.lock:
            self.cleanup()
            if any(job["state"] not in TERMINAL for job in self.jobs.values()):
                raise HTTPException(409, "Inne nagranie jest już przetwarzane. Poczekaj lub je anuluj.")
            identifier = identifier or uuid4().hex
            if not re.fullmatch(r"[a-f0-9]{32}", identifier) or identifier in self.jobs:
                raise HTTPException(400, "Nieprawidłowy identyfikator zadania.")
            directory = JOBS / identifier
            directory.mkdir()
            self.jobs[identifier] = {"state": "uploading", "directory": directory, "process": None, "created": time.time()}
            return identifier, directory

    def cleanup(self):
        for identifier, job in list(self.jobs.items()):
            if job["state"] in TERMINAL and time.time() - job["created"] > 3600:
                shutil.rmtree(job["directory"], ignore_errors=True)
                del self.jobs[identifier]

    def launch(self, identifier, language, model):
        job = self.jobs[identifier]
        with self.lock:
            if job["state"] == "cancelled":
                raise HTTPException(409, "Transkrypcja została anulowana.")
            log = open(job["directory"] / "worker.log", "w", encoding="utf-8")
            try:
                process = subprocess.Popen([sys.executable, "-m", "backend.worker", str(job["directory"]), language, model],
                    cwd=ROOT, stdout=log, stderr=log,
                    creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
                    start_new_session=os.name != "nt")
            finally:
                log.close()
            job.update(state="processing", process=process)
        threading.Thread(target=self.finish, args=(identifier,), daemon=True).start()

    def finish(self, identifier):
        job = self.jobs[identifier]
        code = job["process"].wait()
        with self.lock:
            if job["state"] != "cancelled":
                job["state"] = "completed" if code == 0 and (job["directory"] / "result.json").exists() else "failed"
            # Original video and extracted audio are temporary, even on errors.
            for name in ("source.media", "audio.wav"):
                (job["directory"] / name).unlink(missing_ok=True)

    def cancel(self, identifier):
        job = self.jobs.get(identifier)
        if job is None:
            return
        with self.lock:
            job["state"] = "cancelled"
        if job["process"] is None:
            return  # An in-flight request owns its open upload file.
        process = job["process"]
        if process and process.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            process.wait()
        for name in ("source.media", "audio.wav"):
            (job["directory"] / name).unlink(missing_ok=True)


manager = JobManager()


@asynccontextmanager
async def lifespan(_app):
    yield
    for identifier in list(manager.jobs):
        manager.cancel(identifier)


app = FastAPI(title="ClipsON local WhisperX", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
                   allow_headers=["Content-Type", "X-ClipsON-Client"], allow_credentials=False)


@app.middleware("http")
async def local_access(request, call_next):
    if request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse({"detail": "Niedozwolone źródło żądania."}, status_code=403)
        if request.method in {"POST", "DELETE"} and request.headers.get("x-clipson-client") != "1":
            return JSONResponse({"detail": "Brak nagłówka klienta ClipsON."}, status_code=403)
    response = await call_next(request)
    # Chromium may require explicit local network consent for a hosted page.
    if request.headers.get("origin") in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    ready = all(importlib.util.find_spec(module) for module in ("whisperx", "imageio_ffmpeg", "soundfile"))
    return {"ready": ready, "engine": "whisperx", "local": True, "version": 1}


@app.post("/api/transcriptions", status_code=202)
async def create_transcription(request: Request, language: str = "pl", model: str = "large-v3", identifier: str | None = None):
    if language not in LANGUAGES or model not in MODELS:
        raise HTTPException(400, "Nieobsługiwany język lub model.")
    if not health()["ready"]:
        raise HTTPException(503, "Zainstaluj zależności lokalnego silnika przez backend/setup.ps1.")
    identifier, directory = manager.reserve(identifier)
    written = 0
    try:
        with open(directory / "source.media", "wb") as target:
            async for chunk in request.stream():
                if manager.jobs[identifier]["state"] == "cancelled":
                    raise HTTPException(409, "Transkrypcja została anulowana.")
                written += len(chunk)
                await asyncio.to_thread(target.write, chunk)
        if not written:
            raise HTTPException(400, "Ten plik jest pusty.")
        manager.launch(identifier, language, model)
    except BaseException:
        manager.jobs[identifier]["state"] = "failed"
        (directory / "source.media").unlink(missing_ok=True)
        raise
    return {"id": identifier, "state": "processing"}


@app.get("/api/transcriptions/{identifier}")
def get_transcription(identifier: str):
    job = manager.jobs.get(identifier)
    if not job:
        raise HTTPException(404, "Transkrypcja wygasła. Uruchom ją ponownie.")
    if job["state"] == "cancelled":
        return {"state": "cancelled"}
    status_path = job["directory"] / "status.json"
    try:
        status = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {"state": job["state"], "stage": "starting"}
    except (OSError, ValueError):
        status = {"state": job["state"], "stage": "starting"}
    # The worker atomically writes result before announcing completion; its
    # process may still be exiting when the browser's next poll arrives.
    if job["state"] == "completed" or (status.get("state") == "completed" and (job["directory"] / "result.json").exists()):
        return {"state": "completed", "result": json.loads((job["directory"] / "result.json").read_text(encoding="utf-8"))}
    if job["state"] == "failed":
        return {"state": "failed", "error": status.get("error", "Silnik zatrzymał się. Szczegóły są w lokalnym pliku worker.log.")}
    return status


@app.delete("/api/transcriptions/{identifier}")
async def cancel_transcription(identifier: str):
    await asyncio.to_thread(manager.cancel, identifier)
    return {"state": "cancelled"}


for filename in ("landscape.svg", "favicon.svg"):
    def asset(path=ROOT / "web" / "public" / filename):
        return FileResponse(path, media_type="image/svg+xml")
    app.add_api_route("/" + filename, asset, methods=["GET"])
app.mount("/src", StaticFiles(directory=ROOT / "web" / "src"), name="src")


@app.get("/")
def index():
    return FileResponse(ROOT / "web" / "index.html")
