# Technical Architecture

NeuroScope 3D is a three-tier system: a React single-page application in the browser, a local FastAPI inference server, and a pure-Python pipeline library the server wraps. Every tier is independently testable — the pipeline library ships its own command-line tool and judge-scoring harness, entirely separate from the web server.

<p align="center">
  <img src="assets/diagram_architecture.png" alt="System architecture diagram" width="760">
</p>

## Browser tier — React 18 + TypeScript + Vite

| Concern | Implementation |
|---|---|
| State | Zustand — small, explicit stores (crosshair position, region visibility/opacity, active sequence, mask source, live-job status) rather than one large global tree |
| 3D rendering | Three.js via `react-three-fiber`, with a hand-written **Surface Nets** implementation (`src/lib/surfaceNets.ts`) for isosurface extraction and Laplacian smoothing — not a third-party meshing black box |
| Styling | Tailwind CSS v4 — one continuous, scroll-free workspace rather than a multi-page app |
| Live study loading | `src/lib/buildLiveStudy.ts` fetches a completed job's binary payload and drops it into the exact same rendering pipeline the procedural demo phantom uses — no separate code path for "real" vs "demo" data |

Key files:

```
src/components/ThreeBrainTwin.tsx    3D viewport — brain shell, WT/TC/ET isosurfaces, camera, HUD
src/components/LinkedMprGrid.tsx     2×2 linked MPR grid + toolbar
src/components/MprPanel.tsx          one axial/coronal/sagittal panel — slice render, crosshair, overlay
src/components/UploadPanel.tsx       4-sequence upload, live stage progress, health check
src/components/BottomMetricsBar.tsx  volumes, Dice/sensitivity, connectivity, uncertainty, validation status
src/lib/volume.ts                    affine math — voxel↔world, axis orientation, sampling
src/lib/meshing.ts / surfaceNets.ts  isosurface extraction + smoothing
src/lib/api.ts                       typed client for the FastAPI server
src/state/study.tsx                  StudyProvider — builds the render-ready bundle (demo or live)
src/state/liveStudy.ts               upload/poll/status store for a live job
```

## Server tier — FastAPI (`backend/server/`)

| Concern | Implementation |
|---|---|
| Job identity | **Client-minted** job id (32 hex chars) — this is what lets the browser poll `/status` concurrently with the upload itself, since the id exists before the upload finishes, not after |
| Concurrency | A single global processing lock keeps one study running at a time, appropriate for a local single-workstation deployment; a second request is queued (`wait_for_slot`, async-native, no thread blocking) and shown a real queue position and a measured-average ETA via `/status`, not a bare rejection |
| Progress reporting | An in-memory stage tracker (`PROGRESS` dict) updated at each pipeline step, polled by the browser every ~400ms during a live run |
| Data handling | All `/api/v1/` responses are marked `no-store`; the server never trusts a client-supplied filename for an on-disk path; source uploads are deleted immediately after a result exists; job directories auto-expire after 23h with a background sweep |
| Network | Loopback-only, CORS pinned to the Vite dev origin — not designed or intended to be exposed to the open internet |

### API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Reports whether the real model checkpoint is loaded, or the pipeline is running on the heuristic smoke-test fallback |
| `POST /api/v1/segment/{job}` | Upload 4 required sequences + optional expert mask, run the full pipeline synchronously |
| `GET /api/v1/jobs/{job}/status` | Current pipeline stage, polled live during processing |
| `GET /api/v1/jobs/{job}/metadata` | Full provenance + results JSON for a completed job |
| `GET /api/v1/jobs/{job}/volume/{seq}` | Binary uint8 volume for one sequence, on the shared display grid |
| `GET /api/v1/jobs/{job}/labels` | Binary predicted label volume |
| `GET /api/v1/jobs/{job}/uncertainty/{region}` | Binary flip-TTA uncertainty volume for WT/TC/ET |
| `GET /api/v1/jobs/{job}/expert-labels` | Binary expert mask volume, if one was supplied |
| `GET /api/v1/jobs/{job}/prediction` | The predicted label map as NIfTI, on the *original* input grid |
| `GET /api/v1/jobs/{job}/report` | Printable HTML provenance report |
| `GET /api/v1/jobs/{job}/export` | One-click case bundle — report + metadata + prediction NIfTI, zipped |
| `GET /api/v1/metrics` | Real job-outcome counters and inference-time P50/P95 — no claim without a reproducible number applies to "the pipeline is reliable" too |
| `GET /api/v1/models/status` | Which model is actually loaded (real checkpoint vs. heuristic fallback), its checkpoint hash |
| `POST /api/v1/studies/inspect` | Fast pre-flight geometry check (~100ms) without running inference or holding the processing lock |
| `POST /api/v1/studies/inspect-dicom` | Pre-flight for a DICOM series/zip — groups by `SeriesInstanceUID`, auto-detects sequences, checks de-identification |
| `GET /api/v1/assistant/health` | Whether the local tool copilot (Ollama) is reachable and its models are pulled |
| `POST /api/v1/assistant/chat` | Ask the tool copilot a question — see [`docs/ASSISTANT.md`](ASSISTANT.md) for the guardrail design |

All routes are versioned under `/api/v1/` — an internal API with one consumer (this project's own frontend), so there's no backward-compat alias for the old unversioned paths; they correctly 404.

## Pipeline tier — `backend/neuroscope/` (pure Python library)

This is the part that's genuinely reusable and independently verifiable — no FastAPI, no web concerns, just validated functions the server (and the CLI) both call.

| Module | Role |
|---|---|
| `nifti_io.py` | Reads/writes NIfTI, keeps the input grid and affine authoritative through every transform |
| `validate.py` | All-or-nothing fail-safe gate — geometry, finiteness, affine singularity, field-of-view, edge-occupancy, skull-strip and head-shape heuristics |
| `infer.py` | `Segmenter.predict()` — flip-TTA ensemble inference, checkpoint sha256 verification, deterministic seeding |
| `regions.py` | BraTS code → WT/TC/ET nesting, volumes, Dice/sensitivity, 26-connected-component analysis |
| `provenance.py` | File hashing (sha256), git commit identification — shared by the CLI and the server |
| `limits.py` | Resource budgets (voxel caps) enforced identically by the CLI and the live server |
| `model_base.py` | A formal `Protocol` every segmentation backend must satisfy, so adding a second model is implementing one interface, not restructuring the pipeline |
| `config.py` | One `Settings` object for every tunable (job dir, TTA passes, CORS, upload/retention limits, Ollama URL/models) instead of scattered `os.environ.get()` calls |
| `dicom_io.py` | DICOM series ingestion — groups slices by `SeriesInstanceUID`, sorts along the slice normal, builds a verified LPS→RAS affine, detects BraTS sequences from `SeriesDescription`/contrast tags |
| `assistant.py` + `assistant_corpus.py` | The local tool copilot — retrieval over a small hand-written corpus, an explicit allow-list of job-metadata fields, defense-in-depth guardrails. Never touches raw image/voxel data. See [`docs/ASSISTANT.md`](ASSISTANT.md) |

### The segmentation model

| Property | Value |
|---|---|
| Name | MONAI `brats_mri_segmentation` |
| Architecture | SegResNet (3D CNN encoder-decoder) |
| Licence | Apache-2.0 |
| Training data | BraTS 2018 |
| Input | 4 channels, 1mm isotropic, order **T1Gd → T1 → T2 → FLAIR** (not alphabetical — this is a known footgun) |
| Output | 3 channels (TC, WT, ET), sigmoid, nested at inference time (ET ⊆ TC ⊆ WT enforced in code) |
| Inference | 128³ sliding window, Gaussian blending, overlap 0.5, **flip-TTA ×2 passes** by default |
| Integrity | sha256-verified against a pinned `model-lock.json` before every load — a corrupted or swapped checkpoint is refused, not silently used |

Full model card: [`docs/MODEL_CARD.md`](MODEL_CARD.md).

## The inference pipeline, stage by stage

A single study moves through seven explicit, independently testable stages. Each reports its own status to the browser in real time, and a failure at **Validate** is terminal — nothing downstream ever runs on a study that didn't pass.

<p align="center">
  <img src="assets/diagram_pipeline.png" alt="Pipeline stages with measured timing" width="760">
</p>

| Stage | What happens |
|---|---|
| **Validate** | Geometry, orientation, finiteness, affine/shape agreement across sequences, skull-strip and head-shape heuristics |
| **Resample** | Reorient to closest-canonical RAS+, resample to an isotropic 1mm working grid |
| **Segment** | Flip-TTA ensemble through the verified SegResNet checkpoint, sliding-window inference |
| **Measure** | Region volumes, Dice/sensitivity vs. expert mask, 26-connected-component analysis |
| **Mesh** | Resample sequences, labels and uncertainty onto one shared display grid; export as binary payloads |
| **Report** | Provenance record assembled, printable HTML report written, original-grid NIfTI saved |

Measured end to end on this development machine, CPU-only, real model weights, 2-pass TTA: **~65–75 seconds per case**, against the problem statement's 120-second budget on a dedicated GPU.

The original-grid NIfTI and provenance JSON are the literal artefacts an automated judge scorer reads — `backend/predict.py` is the same command-line tool that powers the live pipeline, so there's no difference between what a judge's script sees and what the web workspace shows.

```bash
python backend/predict.py \
  --t1 T1.nii.gz --t1gd T1Gd.nii.gz --t2 T2.nii.gz --flair FLAIR.nii.gz \
  --out prediction.nii.gz --report report.json --model bundle --tta-passes 2
```

## Uncertainty — how it's actually computed

Rather than a single forward pass, inference runs as a small flip-based test-time-augmentation ensemble:

1. Run the unflipped volume through the network — one full sliding-window forward pass.
2. Flip the volume along one spatial axis, run it again, then **un-flip the resulting probability map** back to the original orientation.
3. The **mean** across passes becomes the (slightly more robust) final probability, thresholded for the mask.
4. The **standard deviation** across passes, per voxel, is the uncertainty signal — concentrated, as expected, at tumour boundaries where the model's own self-consistency breaks down.

This is deliberately *not* full Monte-Carlo dropout or a large ensemble — published findings show naive uncertainty signals in medical segmentation can correlate only weakly with true boundary error, and the platform would rather use a cheap, honestly-caveated signal than imply more confidence than the method can support. See `backend/neuroscope/infer.py` (`TTA_FLIP_AXES`, `Segmenter.predict`) for the implementation.

## Resource and timing guards

- A hard voxel-count cap on the resampled inference grid (`neuroscope/limits.py`) prevents an unusually large or finely-spaced input from exhausting memory mid-run.
- A request-level upload-size guard rejects an oversized multipart upload by its declared `Content-Length` before a single byte is streamed.
- A single global processing lock keeps the server to one study at a time, matching the local single-workstation deployment model this prototype targets — a second study queues (capped at 10 waiting) rather than being rejected outright; see the job queue row above.
- Every failure path raises a structured `ApiError(status, code, message)`, normalised into one consistent `{code, message, status}` envelope by a global exception handler — a client (or a judge's scorer) can branch on `code` instead of parsing prose.

## DICOM ingestion

A real DICOM series (or a zip of one) can be uploaded directly, not just pre-converted NIfTI. `neuroscope/dicom_io.py` groups files by `SeriesInstanceUID`, sorts slices along the series' own slice normal (via `ImageOrientationPatient`/`ImagePositionPatient`, not filename order), and builds a verified affine by converting the DICOM LPS convention to NIfTI's RAS. Sequence identity (T1/T1Gd/T2/FLAIR) is detected from `SeriesDescription` and contrast-bolus tags, the same heuristic spirit as the existing filename-based auto-routing for NIfTI uploads. De-identification is checked, not assumed: a non-anonymized `PatientName` produces an explicit warning rather than silently proceeding. The pre-flight endpoint (`POST /api/v1/studies/inspect-dicom`) reports series geometry and sequence mapping before anything reaches the inference pipeline or the processing lock.

## Cutaway view (3D)

The 3D viewport supports an interactive clipping plane (axial/coronal/sagittal, adjustable depth) to see inside the rendered mesh — the same cut-plane technique any CAD or medical-imaging 3D viewer offers. This is a visualization tool only: it makes no claim about anatomy relevant to an incision or any other clinical/surgical utility, and is deliberately never labelled that way in the UI — see CLAUDE.md's hard rule 4 and the PS's own "surgical or radiotherapy planning" exclusion.
