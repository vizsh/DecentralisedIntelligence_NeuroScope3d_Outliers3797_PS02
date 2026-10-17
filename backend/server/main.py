"""Local FastAPI server: wires the neuroscope pipeline to the browser frontend.

Upload the four sequences, run the same validate -> preprocess -> infer ->
write pipeline predict.py uses on the CLI, and hand the result back to the
browser as the binary payload its existing meshing/slice viewer already
expects. Loopback-oriented: one study processes at a time, nothing is sent
to a third-party service, and uploads are deleted as soon as a result exists.
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime
import html
import json
import logging
import shutil
import sys
import threading
import time
from pathlib import Path

import nibabel as nib
import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from neuroscope import DISCLAIMER, __version__
from neuroscope import nifti_io as nio
from neuroscope.assistant import AssistantUnavailable
from neuroscope.assistant import ask as assistant_ask
from neuroscope.assistant import health as assistant_health
from neuroscope.config import Settings
from neuroscope.infer import HeuristicSegmenter, Segmenter, load_segmenter, stack_channels
from neuroscope.limits import MAX_INFERENCE_VOXELS, BudgetExceeded, check_voxel_budget
from neuroscope.provenance import git_commit, sha256
from neuroscope.regions import (
    agreement_all,
    connectivity_all,
    geometry_all,
    hd95,
    regions_to_label,
    score_all,
    volumes_all,
)
from neuroscope.validate import SEQUENCES, validate_label, validate_study
from server.viewer import prepare_viewer

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = Settings.from_env()
JOBS = SETTINGS.job_dir
JOBS.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = SETTINGS.max_upload_bytes
RETENTION_SECONDS = SETTINGS.retention_seconds
busy = threading.Lock()

logging.basicConfig(
    level=getattr(logging, SETTINGS.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("neuroscope.server")

# In-memory pipeline-stage tracker so the browser can show real progress
# (validating / resampling / segmenting / meshing / reporting) during the one
# in-flight request, instead of a spinner with no information for ~30-90s.
# Polled, not pushed — simplest thing that works for one local demo machine.
_progress_lock = threading.Lock()
PROGRESS: dict[str, dict] = {}
# The job the global `busy` lock is currently held for, if any — read by a
# second uploader's rejection path so "busy" comes with a concrete stage
# ("queued behind <job>, currently: Running 3D segmentation") instead of a
# bare retry-later with no information.
_current_job: str | None = None

STAGES = {
    "received": "Upload received, validating…",
    "validating": "Checking geometry, orientation and anatomy…",
    "resampling": "Reorienting and resampling onto the working grid…",
    "segmenting": "Running 3D segmentation — this is the slow step…",
    "measuring": "Computing region volumes and expert-mask metrics…",
    "meshing": "Building the display grid and binary payload for the viewer…",
    "reporting": "Writing the provenance report…",
    "done": "Complete.",
}


def report_stage(job: str, stage: str) -> None:
    now = time.time()
    with _progress_lock:
        previous = PROGRESS.get(job)
        PROGRESS[job] = {"stage": stage, "message": STAGES[stage], "at": now}
    elapsed = f" (+{now - previous['at']:.2f}s)" if previous else ""
    log.info("job %s -> %s%s", job, stage, elapsed)

_segmenter_cache: Segmenter | HeuristicSegmenter | None = None


def get_segmenter() -> Segmenter | HeuristicSegmenter:
    """Load the MONAI bundle once per process; fall back to the pipeline smoke-test model."""
    global _segmenter_cache
    if _segmenter_cache is not None:
        return _segmenter_cache
    try:
        _segmenter_cache = load_segmenter(str(SETTINGS.bundle_dir), tta_passes=SETTINGS.tta_passes)
        log.info("loaded segmenter: %s", _segmenter_cache.info.name)
    except FileNotFoundError:
        _segmenter_cache = HeuristicSegmenter()
        log.warning("no verified MONAI bundle found; falling back to %s", _segmenter_cache.info.name)
    return _segmenter_cache


def cleanup() -> None:
    now = time.time()
    removed = 0
    for p in JOBS.iterdir():
        if p.is_dir() and now - p.stat().st_mtime > RETENTION_SECONDS:
            shutil.rmtree(p, ignore_errors=True)
            removed += 1
    if removed:
        log.info("cleanup: removed %d expired job director%s", removed, "y" if removed == 1 else "ies")


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    cleanup()

    async def sweeper():
        while True:
            await asyncio.sleep(60)
            await run_in_threadpool(cleanup)

    task = asyncio.create_task(sweeper())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(title="NeuroScope 3D local API", version=__version__, lifespan=lifespan)

# Vite dev server runs on a different origin than the API; loopback-only, no third party.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(SETTINGS.cors_origins),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_store(request: Request, call_next):
    # Five sequences (four required + optional expert) at up to 1 GB each, plus
    # multipart overhead — reject an oversized request before it is ever streamed.
    length = request.headers.get("content-length")
    if length and int(length) > 5 * MAX_UPLOAD_BYTES + 100_000:
        return HTMLResponse("Upload exceeds the request size limit.", status_code=413)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/api/health")
def health():
    # Lightweight liveness check: does not trigger expensive bundle initialization
    global _segmenter_cache
    is_loaded = _segmenter_cache is not None
    model_ready = isinstance(_segmenter_cache, Segmenter) if is_loaded else False
    model_name = _segmenter_cache.info.name if is_loaded else "MONAI SegResNet (lazy load)"
    return {
        "status": "ok",
        "model_ready": model_ready,
        "model_name": model_name,
        "disclaimer": DISCLAIMER,
        "version": __version__,
    }


@app.get("/api/models/status")
def model_status():
    segmenter = get_segmenter()
    info = segmenter.info
    is_real = isinstance(segmenter, Segmenter)
    return {
        "status": "ready" if is_real else "fallback",
        "name": info.name,
        "version": info.version,
        "licence": info.licence,
        "source": info.source,
        "execution_mode": getattr(info, "execution_mode", "model_inference" if is_real else "heuristic_fallback"),
        "checkpoint_sha256": getattr(info, "checkpoint_sha256", None),
        "tta_passes": getattr(segmenter, "tta_passes", 1),
        "hardware_target": "CPU (sliding-window) / T4 CUDA",
    }


@app.get("/api/assistant/health")
def assistant_health_check():
    """Mirrors /api/health's pattern for the segmentation model: checked once on panel open,
    shown live, so the UI never offers a chat box the backend can't actually answer from."""
    return assistant_health(SETTINGS)


class AssistantChatRequest(BaseModel):
    question: str
    job_id: str | None = None
    mode: str = "trainee"  # "trainee" | "clinician" — see neuroscope.assistant.Mode


@app.post("/api/assistant/chat")
def assistant_chat(req: AssistantChatRequest):
    mode = req.mode if req.mode in ("trainee", "clinician") else "trainee"
    job_metadata = None
    if req.job_id:
        if not _valid_job_id(req.job_id):
            raise HTTPException(400, "Invalid job id.")
        meta_path = _jobdir(req.job_id) / "metadata.json"
        if meta_path.exists():
            job_metadata = json.loads(meta_path.read_text())
    try:
        result = assistant_ask(req.question, job_metadata=job_metadata, mode=mode, settings=SETTINGS)
    except AssistantUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    return {
        "answer": result.answer,
        "cited_fields": result.cited_fields,
        "caveat": result.caveat,
        "refused": result.refused,
        "mode": result.mode,
    }


@app.post("/api/studies/inspect")
async def inspect_study(
    T1: UploadFile | None = File(None),
    T1Gd: UploadFile | None = File(None),
    T2: UploadFile | None = File(None),
    FLAIR: UploadFile | None = File(None),
    expert: UploadFile | None = File(None),
):
    """Fast pre-flight inspection: validates NIfTI headers, affines, and geometry in ~100ms
    without running GPU/CPU sliding-window inference or holding the global execution lock."""
    scratch = JOBS / f"inspect_{int(time.time() * 1000)}"
    scratch.mkdir(parents=True, exist_ok=True)
    uploads = {"T1": T1, "T1Gd": T1Gd, "T2": T2, "FLAIR": FLAIR}
    paths: dict[str, Path] = {}
    expert_path: Path | None = None
    try:
        for name, upload in {**uploads, **({"expert": expert} if expert else {})}.items():
            if upload is None:
                continue
            filename = (upload.filename or "").lower()
            suffix = ".nii.gz" if filename.endswith(".nii.gz") else ".nii" if filename.endswith(".nii") else None
            if suffix is None:
                return JSONResponse(
                    {
                        "ok": False,
                        "stage": "validation",
                        "file": name,
                        "code": "BAD_EXTENSION",
                        "message": f"{name}: expected .nii or .nii.gz file extension.",
                        "inference_started": False,
                    },
                    status_code=422,
                )
            dest = scratch / f"{name}{suffix}"
            bytes_read = 0
            with dest.open("wb") as fh:
                while chunk := await upload.read(1024 * 1024):
                    bytes_read += len(chunk)
                    if bytes_read > MAX_UPLOAD_BYTES:
                        shutil.rmtree(scratch, ignore_errors=True)
                        raise HTTPException(413, f"Upload {name} exceeds {MAX_UPLOAD_BYTES} bytes.")
                    fh.write(chunk)
            if name == "expert":
                expert_path = dest
            else:
                paths[name] = dest

        val = validate_study(paths)
        seq_info = {}
        for s_name, vol in val.volumes.items():
            seq_info[s_name] = {
                "shape": list(vol.grid.shape),
                "spacing": [round(float(s), 3) for s in vol.spacing],
                "units": "mm",
            }

        ref_vol = val.volumes.get("T1Gd") or next(iter(val.volumes.values()), None)
        geometry = {
            "compatible": val.ok and len(val.volumes) == 4,
            "shape": list(ref_vol.grid.shape) if ref_vol else None,
            "spacing": [round(float(s), 3) for s in ref_vol.spacing] if ref_vol else None,
            "orientation": "RAS+",
        }

        expert_status = None
        if expert_path and ref_vol:
            lv = validate_label(expert_path, ref_vol.grid)
            expert_status = {"valid": lv.ok, "errors": _findings(lv.errors)}

        return {
            "ok": val.ok,
            "stage": "validation",
            "inference_ready": val.ok and len(val.volumes) == 4,
            "sequences_received": list(paths.keys()),
            "sequence_metadata": seq_info,
            "geometry": geometry,
            "expert_mask": expert_status,
            "warnings": _findings(val.warnings),
            "errors": _findings(val.errors) if not val.ok else [],
        }
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
        for upload in [*uploads.values(), expert]:
            if upload:
                await upload.close()


def _findings(findings) -> list[dict]:
    return [{"code": f.code, "sequence": f.sequence, "message": f.message} for f in findings]


def process(job: str, paths: dict[str, Path], expert_path: Path | None, out: Path, source_mode: str | None = None) -> dict:
    started = time.perf_counter()
    report_stage(job, "validating")
    validation = validate_study(paths)
    if not validation.ok:
        raise InputRejected(_findings(validation.errors))

    reference = validation.volumes["T1Gd"]
    target_grid = reference.grid

    report_stage(job, "resampling")
    canonical = {n: nio.to_canonical(v.image) for n, v in validation.volumes.items()}
    resampled = {n: nio.resample_to_spacing(img, spacing=1.0, order=1) for n, img in canonical.items()}
    work_image = resampled["T1Gd"]
    try:
        check_voxel_budget(work_image.shape[:3], MAX_INFERENCE_VOXELS, "resampled inference grid")
    except BudgetExceeded as exc:
        raise InputRejected([{"code": "budget_exceeded", "sequence": None, "message": str(exc)}]) from exc
    arrays = {n: np.asanyarray(img.dataobj, dtype=np.float32) for n, img in resampled.items()}

    report_stage(job, "segmenting")
    segmenter = get_segmenter()
    channels = stack_channels(arrays)
    prediction = segmenter.predict(channels, threshold=0.5)
    label_work = regions_to_label(prediction.regions["WT"], prediction.regions["TC"], prediction.regions["ET"])

    label_image = nib.Nifti1Image(label_work.astype(np.uint8), work_image.affine)
    on_input_grid = nio.resample_onto(label_image, target_grid, order=0)
    label_out = np.asanyarray(on_input_grid.dataobj).astype(np.uint8)

    nio.save_label(label_out, target_grid, out / "prediction.nii.gz", reference=reference.image)

    uncertainty_on_input_grid = None
    if prediction.tta_passes > 1:
        uncertainty_on_input_grid = {}
        for region in ("WT", "TC", "ET"):
            unc_image = nib.Nifti1Image(prediction.uncertainty[region].astype(np.float32), work_image.affine)
            uncertainty_on_input_grid[region] = np.asanyarray(
                nio.resample_onto(unc_image, target_grid, order=1).dataobj, dtype=np.float32
            )

    report_stage(job, "measuring")
    truth = None
    expert_warning = None
    if expert_path is not None:
        lv = validate_label(expert_path, target_grid)
        if lv.ok:
            truth = np.asanyarray(lv.volumes["label"].image.dataobj).astype(np.uint8)
        else:
            expert_warning = "; ".join(f.message for f in lv.errors)

    report_stage(job, "meshing")
    geometry = prepare_viewer(
        images={n: v.image for n, v in validation.volumes.items()},
        label=label_out,
        reference=reference.image,
        out=out,
        expert=truth,
        uncertainty=uncertainty_on_input_grid,
    )

    report_stage(job, "reporting")

    info = segmenter.info
    if source_mode == "synthetic":
        execution_mode = "synthetic_demo"
    elif isinstance(segmenter, HeuristicSegmenter):
        execution_mode = "heuristic_fallback"
    else:
        execution_mode = "model_inference"

    uncertainty_summary = None
    if uncertainty_on_input_grid is not None:
        uncertainty_summary = {
            region: {
                "mean": round(float(arr.mean()), 4),
                "max": round(float(arr.max()), 4),
            }
            for region, arr in uncertainty_on_input_grid.items()
        }
    metadata = {
        **geometry,
        "tool": "NeuroScope 3D",
        "tool_version": __version__,
        "disclaimer": DISCLAIMER,
        "description": "Suspected tumour regions predicted by the model. Estimated volumes.",
        "execution_mode": execution_mode,
        "regions": volumes_all(label_out, reference.spacing),
        "connectivity": connectivity_all(label_out, reference.spacing),
        "geometry": geometry_all(label_out, reference.spacing),
        "expert": volumes_all(truth, reference.spacing) if truth is not None else None,
        "metrics": {
            k: {**m.as_dict(), **hd95(label_out, truth, k, reference.spacing).as_dict()}
            for k, m in score_all(label_out, truth).items()
        } if truth is not None else None,
        "agreement": agreement_all(label_out, truth, reference.spacing) if truth is not None else None,
        "has_expert": truth is not None,
        "uncertainty": uncertainty_summary,
        "model": {
            "name": info.name, "version": info.version, "licence": info.licence,
            "source": info.source, "deterministic": info.deterministic,
            "tta_passes": prediction.tta_passes,
            "execution_mode": execution_mode,
            "checkpoint_sha256": getattr(info, "checkpoint_sha256", None) if execution_mode == "model_inference" else None,
        },
        "warnings": _findings(validation.warnings) + ([{"code": "bad_expert_mask", "message": expert_warning, "sequence": "expert"}] if expert_warning else []),
        "input_sha256": {k: sha256(Path(p)) for k, p in paths.items()},
        "expert_sha256": sha256(expert_path) if (expert_path and truth is not None) else None,
        "code_commit": git_commit(),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "runtime_seconds": time.perf_counter() - started,
        "limitations": [
            "Research and teaching prototype only; not a diagnostic system.",
            "Skull-strip and brain-anatomy sanity checks are heuristics, not a validated classifier.",
            "Uncertainty is a flip-TTA probability std, a measured disagreement signal, not a calibrated"
            " confidence probability — low uncertainty does not guarantee correctness."
            if uncertainty_summary else "No voxel-level uncertainty estimate is produced (single-pass model).",
            "2-minute T4 budget not benchmarked on this machine.",
        ],
    }
    (out / "metadata.json").write_text(json.dumps(metadata, indent=2))
    (out / "report.html").write_text(_report_html(metadata), encoding="utf-8")

    for p in paths.values():
        Path(p).unlink(missing_ok=True)
    if expert_path:
        Path(expert_path).unlink(missing_ok=True)
    report_stage(job, "done")
    return metadata


class InputRejected(Exception):
    def __init__(self, errors: list[dict]):
        self.errors = errors
        super().__init__("; ".join(e["message"] for e in errors))


def _valid_job_id(job: str) -> bool:
    return len(job) == 32 and all(c in "0123456789abcdef" for c in job)


async def _run_pipeline(job: str, paths: dict[str, Path], expert_path: Path | None, out: Path, source_mode: str | None = None) -> dict:
    """Run process() in a threadpool and log/track its outcome; re-raises
    InputRejected / any other exception unchanged for the caller to shape
    into an HTTP response and clean up `out`. Does NOT touch the busy lock
    or _current_job — the caller acquires/releases those, since upload and
    pre-staged-sample runs prepare `paths` differently but both want
    identical behaviour once files exist on disk."""
    try:
        metadata = await run_in_threadpool(process, job, paths, expert_path, out, source_mode)
        log.info("job %s: completed in %.1fs", job, metadata["runtime_seconds"])
        checkpoint_hash = metadata["model"].get("checkpoint_sha256")
        if metadata["model"]["execution_mode"] == "model_inference" and not checkpoint_hash:
            raise RuntimeError("Model checkpoint hash missing for verified model inference.")
        return {
            "job_id": job,
            "study_id": job,
            "run_id": f"run_{job[:8]}",
            "status": "completed",
            "validation": {
                "status": "passed",
                "sequences": {s: "accepted" for s in paths},
                "geometry": "compatible",
            },
            "model": {
                "name": metadata["model"]["name"],
                "execution_mode": metadata["model"]["execution_mode"],
                "checkpoint_hash": checkpoint_hash,
            },
            "results": {
                "mask_available": True,
                "volumes_ml": {k: v["volume_ml"] for k, v in metadata["regions"].items()},
                "expert_evaluation_available": metadata["has_expert"],
            },
            "artifacts": {
                "prediction_nifti": True,
                "uncertainty_volume": metadata["uncertainty"] is not None,
                "report": True,
            },
            "metadata": metadata,
        }
    except InputRejected as exc:
        with _progress_lock:
            PROGRESS.pop(job, None)
        log.info("job %s: rejected — %s", job, "; ".join(e["message"] for e in exc.errors))
        raise
    except Exception:
        with _progress_lock:
            PROGRESS.pop(job, None)
        log.exception("job %s: processing failed", job)
        raise


@app.post("/api/segment/{job}")
async def segment(
    job: str,
    T1: UploadFile = File(...),
    T1Gd: UploadFile = File(...),
    T2: UploadFile = File(...),
    FLAIR: UploadFile = File(...),
    expert: UploadFile | None = File(None),
):
    # The job id is minted client-side (32 hex chars) so the browser can start
    # polling /status for this id before this request finishes uploading.
    global _current_job
    if not _valid_job_id(job):
        raise HTTPException(400, "Invalid job id.")
    uploads = {"T1": T1, "T1Gd": T1Gd, "T2": T2, "FLAIR": FLAIR}
    if not busy.acquire(blocking=False):
        with _progress_lock:
            current = PROGRESS.get(_current_job) if _current_job else None
        detail = f" Current job {_current_job} is at: {current['message']}" if current else ""
        log.info("job %s rejected: busy with %s", job, _current_job)
        raise HTTPException(
            409,
            f"One study is already processing.{detail} Wait for it to finish, "
            f"or poll /api/jobs/{_current_job}/status for its progress.",
        )

    _current_job = job
    out = JOBS / job
    if out.exists():
        busy.release()
        _current_job = None
        raise HTTPException(409, "Job id already in use.")
    out.mkdir()
    log.info("job %s: received, sequences=%s expert=%s", job, list(uploads), bool(expert))
    report_stage(job, "received")
    paths: dict[str, Path] = {}
    expert_path: Path | None = None
    try:
        items = {**uploads, **({"expert": expert} if expert else {})}
        for name, upload in items.items():
            filename = (upload.filename or "").lower()
            suffix = ".nii.gz" if filename.endswith(".nii.gz") else ".nii" if filename.endswith(".nii") else None
            if suffix is None:
                raise InputRejected([{"code": "bad_extension", "sequence": name, "message": f"{name}: expected .nii or .nii.gz."}])
            path = out / (name + suffix)
            total = 0
            with path.open("wb") as fh:
                while chunk := await upload.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_UPLOAD_BYTES:
                        raise InputRejected([{"code": "too_large", "sequence": name, "message": f"{name}: exceeds 1 GB."}])
                    fh.write(chunk)
            if name == "expert":
                expert_path = path
            else:
                paths[name] = path

        return await _run_pipeline(job, paths, expert_path, out)
    except InputRejected as exc:
        shutil.rmtree(out, ignore_errors=True)
        first = exc.errors[0] if exc.errors else {"code": "unknown", "sequence": None, "message": "Input rejected"}
        return JSONResponse(
            {
                "status": "rejected",
                "stage": "validation",
                "file": first.get("sequence") or "input",
                "code": first.get("code", "rejected").upper(),
                "message": first.get("message", "Input rejected during validation."),
                "inference_started": False,
                "errors": exc.errors,
            },
            status_code=422,
        )
    except Exception as exc:  # pragma: no cover - last-resort guard, never return a partial result
        shutil.rmtree(out, ignore_errors=True)
        raise HTTPException(500, f"Processing failed; no result is available ({exc.__class__.__name__}).") from exc
    finally:
        _current_job = None
        busy.release()
        for upload in [*uploads.values(), expert]:
            if upload:
                await upload.close()


# Curated cases the "Datasets" panel offers for one-click, no-upload demoing —
# each a real run through the same pipeline (same validation, same model, same
# uncertainty/connectivity analysis), not a canned result. Populated by
# make_demo_gallery.py (synthetic, distinct lesion geometry) and optionally by
# fetch_decathlon_sample.py + convert_decathlon.py (real cases, small-N,
# honestly labelled as such in the manifest — never presented as a held-out
# accuracy benchmark).
SAMPLES_DIR = ROOT / "samples"


def _samples_manifest() -> list[dict]:
    manifest_path = SAMPLES_DIR / "manifest.json"
    if not manifest_path.exists():
        return []
    try:
        entries = json.loads(manifest_path.read_text())
    except json.JSONDecodeError:
        return []
    out = []
    for e in entries:
        case_dir = SAMPLES_DIR / e["id"]
        available = all((case_dir / f"{s}.nii.gz").exists() for s in SEQUENCES)
        out.append({**e, "available": available})
    return out


@app.get("/api/samples")
def list_samples():
    return {"samples": _samples_manifest()}


@app.post("/api/samples/{sample_id}/run/{job}")
async def run_sample(sample_id: str, job: str):
    """Run a pre-staged sample case exactly like an uploaded one — the only
    difference is where the four sequence files come from."""
    global _current_job
    if not _valid_job_id(job):
        raise HTTPException(400, "Invalid job id.")

    catalog = {e["id"] for e in _samples_manifest()}
    if sample_id not in catalog or ".." in sample_id or "/" in sample_id or "\\" in sample_id:
        raise HTTPException(404, f"Invalid or uncatalogued sample '{sample_id}'.")

    case_dir = SAMPLES_DIR / sample_id
    if not case_dir.is_dir():
        raise HTTPException(404, f"Unknown sample '{sample_id}'.")
    missing = [s for s in SEQUENCES if not (case_dir / f"{s}.nii.gz").exists()]
    if missing:
        raise HTTPException(409, f"Sample '{sample_id}' is missing {', '.join(missing)} on the server.")

    if not busy.acquire(blocking=False):
        with _progress_lock:
            current = PROGRESS.get(_current_job) if _current_job else None
        detail = f" Current job {_current_job} is at: {current['message']}" if current else ""
        log.info("job %s rejected: busy with %s", job, _current_job)
        raise HTTPException(
            409,
            f"One study is already processing.{detail} Wait for it to finish, "
            f"or poll /api/jobs/{_current_job}/status for its progress.",
        )

    _current_job = job
    out = JOBS / job
    if out.exists():
        busy.release()
        _current_job = None
        raise HTTPException(409, "Job id already in use.")
    out.mkdir()
    log.info("job %s: running pre-staged sample '%s'", job, sample_id)
    report_stage(job, "received")

    paths = {s: out / f"{s}.nii.gz" for s in SEQUENCES}
    for s, dest in paths.items():
        shutil.copyfile(case_dir / f"{s}.nii.gz", dest)
    expert_src = case_dir / "label.nii.gz"
    expert_path = None
    if expert_src.exists():
        expert_path = out / "expert.nii.gz"
        shutil.copyfile(expert_src, expert_path)

    sample_entry = next((e for e in _samples_manifest() if e["id"] == sample_id), None)
    source_mode = sample_entry.get("source") if sample_entry else None

    try:
        return await _run_pipeline(job, paths, expert_path, out, source_mode=source_mode)
    except InputRejected as exc:
        shutil.rmtree(out, ignore_errors=True)
        first = exc.errors[0] if exc.errors else {"code": "unknown", "sequence": None, "message": "Input rejected"}
        return JSONResponse(
            {
                "status": "rejected",
                "stage": "validation",
                "file": first.get("sequence") or "sample",
                "code": first.get("code", "rejected").upper(),
                "message": first.get("message", "Sample input rejected during validation."),
                "inference_started": False,
                "errors": exc.errors,
            },
            status_code=422,
        )
    except Exception as exc:  # pragma: no cover - last-resort guard, never return a partial result
        shutil.rmtree(out, ignore_errors=True)
        raise HTTPException(500, f"Processing failed; no result is available ({exc.__class__.__name__}).") from exc
    finally:
        _current_job = None
        busy.release()


@app.get("/api/jobs/{job}/status")
def job_status(job: str):
    with _progress_lock:
        entry = PROGRESS.get(job)
    if entry is None:
        raise HTTPException(404, "Unknown job id.")
    return entry


def _jobdir(job: str) -> Path:
    if len(job) != 32 or any(c not in "0123456789abcdef" for c in job):
        raise HTTPException(404, "Study not found.")
    path = JOBS / job
    if not (path / "metadata.json").exists():
        raise HTTPException(404, "No completed study is available.")
    if time.time() - path.stat().st_mtime > RETENTION_SECONDS:
        raise HTTPException(410, "Study has expired and is being removed.")
    return path


@app.get("/api/jobs/{job}/metadata")
def metadata(job: str):
    return FileResponse(_jobdir(job) / "metadata.json", media_type="application/json")


@app.get("/api/jobs/{job}/volume/{seq}")
def volume(job: str, seq: str):
    if seq not in SEQUENCES:
        raise HTTPException(404, "Sequence not found.")
    return FileResponse(_jobdir(job) / f"{seq}.bin", media_type="application/octet-stream")


@app.get("/api/jobs/{job}/labels")
def labels(job: str):
    return FileResponse(_jobdir(job) / "labels.bin", media_type="application/octet-stream")


@app.get("/api/jobs/{job}/uncertainty/{region}")
def uncertainty(job: str, region: str):
    if region not in ("WT", "TC", "ET"):
        raise HTTPException(404, "Region not found.")
    p = _jobdir(job) / f"uncertainty_{region}.bin"
    if not p.exists():
        raise HTTPException(404, "No uncertainty estimate for this study (single-pass model run).")
    return FileResponse(p, media_type="application/octet-stream")


@app.get("/api/jobs/{job}/expert-labels")
def expert_labels(job: str):
    p = _jobdir(job) / "expert-labels.bin"
    if not p.exists():
        raise HTTPException(404, "No expert mask was provided.")
    return FileResponse(p, media_type="application/octet-stream")


@app.get("/api/jobs/{job}/prediction")
def prediction(job: str):
    return FileResponse(_jobdir(job) / "prediction.nii.gz", filename="prediction.nii.gz", media_type="application/gzip")


@app.get("/api/jobs/{job}/report")
def report(job: str):
    return FileResponse(_jobdir(job) / "report.html", media_type="text/html")


def _report_html(m: dict) -> str:
    rows = "".join(
        f"<tr><td>{k}</td><td>{v['voxels']:,}</td><td>{v['volume_ml']:.3f}</td><td>{v['formula']}</td></tr>"
        for k, v in m["regions"].items()
    )
    metrics_block = (
        json.dumps({"expert_volumes": m["expert"], "metrics": m["metrics"]}, indent=2)
        if m["has_expert"] else "No expert mask was provided for this study."
    )
    return (
        '<!doctype html><html><head><meta charset="utf-8"><title>NeuroScope 3D report</title>'
        "<style>body{font:14px system-ui;max-width:880px;margin:40px auto;padding:20px;color:#182a42}"
        "p{line-height:1.7}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;"
        "border-bottom:1px solid #ccc}pre{white-space:pre-wrap;font-size:11px;background:#f0f4f8;padding:18px;"
        "overflow-wrap:anywhere}.note{background:#edf2f7;padding:16px}@media print{button{display:none}}</style>"
        "</head><body><h1>NeuroScope 3D report</h1>"
        f'<p class="note"><b>{html.escape(m["disclaimer"])}</b></p>'
        "<p>Suspected tumour regions predicted by the model. Estimated volumes below do not establish a diagnosis.</p>"
        "<h2>Estimated volumes</h2><table><tr><th>Region</th><th>Voxels</th><th>mL</th><th>Formula</th></tr>"
        f"{rows}</table><h2>Expert comparison</h2><pre>{html.escape(metrics_block)}</pre>"
        f"<h2>Provenance, warnings and limitations</h2><pre>{html.escape(json.dumps(m, indent=2))}</pre>"
        '<button onclick="print()">Print / Save as PDF</button></body></html>'
    )


@app.get("/api/jobs/{job}/manifest")
def job_manifest(job: str):
    path = _jobdir(job)
    meta = json.loads((path / "metadata.json").read_text())
    artifacts = {
        "prediction_nifti": (path / "prediction.nii.gz").exists(),
        "report_html": (path / "report.html").exists(),
        "labels_bin": (path / "labels.bin").exists(),
        "expert_labels_bin": (path / "expert-labels.bin").exists(),
        "uncertainty_wt": (path / "uncertainty_WT.bin").exists(),
    }
    return {
        "job_id": job,
        "study_id": job,
        "execution_mode": meta.get("execution_mode"),
        "model": meta.get("model"),
        "input_sha256": meta.get("input_sha256"),
        "expert_sha256": meta.get("expert_sha256"),
        "code_commit": meta.get("code_commit"),
        "timestamp": meta.get("timestamp"),
        "runtime_seconds": meta.get("runtime_seconds"),
        "artifacts": artifacts,
    }


@app.get("/api/jobs/{job}/components/{region}")
def job_components(job: str, region: str):
    if region not in ("WT", "TC", "ET"):
        raise HTTPException(404, "Region must be WT, TC, or ET.")
    meta = json.loads((_jobdir(job) / "metadata.json").read_text())
    connectivity = meta.get("connectivity", {}).get(region)
    geometry = meta.get("geometry", {}).get(region)
    if not connectivity:
        raise HTTPException(404, f"No component data for region {region}")
    return {
        "region": region,
        "component_count": connectivity.get("component_count", 0),
        "component_volumes_ml": connectivity.get("component_volumes_ml", []),
        "largest_fraction": connectivity.get("largest_fraction", 0),
        "max_diameter_mm": geometry.get("max_diameter_mm") if geometry else None,
        "centroid_voxel": geometry.get("centroid_voxel") if geometry else None,
        "bbox_mm": geometry.get("bbox_mm") if geometry else None,
    }


@app.get("/api/jobs/{job}/errors/{region}")
def job_errors(job: str, region: str):
    if region not in ("WT", "TC", "ET"):
        raise HTTPException(404, "Region must be WT, TC, or ET.")
    meta = json.loads((_jobdir(job) / "metadata.json").read_text())
    if not meta.get("has_expert"):
        raise HTTPException(404, "No expert ground truth was provided for this study.")
    agreement = meta.get("agreement", {}).get(region)
    metrics = meta.get("metrics", {}).get(region)
    return {
        "region": region,
        "agreement": agreement,
        "metrics": metrics,
    }


class ComparisonRequest(BaseModel):
    job_a: str
    job_b: str


@app.post("/api/comparisons")
def compare_jobs(req: ComparisonRequest):
    dir_a = _jobdir(req.job_a)
    dir_b = _jobdir(req.job_b)
    meta_a = json.loads((dir_a / "metadata.json").read_text())
    meta_b = json.loads((dir_b / "metadata.json").read_text())

    # Verify spatial geometry compatibility
    if meta_a.get("dims") != meta_b.get("dims"):
        raise HTTPException(400, "Jobs have incompatible grid dimensions.")

    deltas = {}
    for region in ("WT", "TC", "ET"):
        vol_a = meta_a.get("regions", {}).get(region, {}).get("volume_ml", 0.0)
        vol_b = meta_b.get("regions", {}).get(region, {}).get("volume_ml", 0.0)
        deltas[region] = {
            "volume_a_ml": vol_a,
            "volume_b_ml": vol_b,
            "delta_ml": round(vol_b - vol_a, 3),
            "pct_change": round(((vol_b - vol_a) / vol_a * 100), 1) if vol_a > 0 else 0.0,
        }

    return {
        "job_a": {
            "id": req.job_a,
            "execution_mode": meta_a.get("execution_mode"),
            "model_name": meta_a.get("model", {}).get("name"),
            "runtime_seconds": meta_a.get("runtime_seconds"),
        },
        "job_b": {
            "id": req.job_b,
            "execution_mode": meta_b.get("execution_mode"),
            "model_name": meta_b.get("model", {}).get("name"),
            "runtime_seconds": meta_b.get("runtime_seconds"),
        },
        "deltas": deltas,
        "shared_geometry": {
            "dims": meta_a.get("dims"),
            "spacing": meta_a.get("spacing"),
        },
    }
