# NeuroScope 3D

**See a brain tumour in 3D, measure it exactly, and know how far to trust it.**

`DI-02` · Health-tech · 3D medical image segmentation + web visualisation · research & teaching prototype

[![Status](https://img.shields.io/badge/judge%20pipeline%20tests-17%2F17%20passing-15803d?style=flat-square)](docs/VERIFICATION.md)
[![Model](https://img.shields.io/badge/model-MONAI%20SegResNet%20(verified)-0284c7?style=flat-square)](docs/MODEL_CARD.md)
[![Licence](https://img.shields.io/badge/base%20model%20licence-Apache--2.0-f59e0b?style=flat-square)](#licence--credits)
[![Prototype](https://img.shields.io/badge/scope-research%20%26%20teaching%20only-be185d?style=flat-square)](#disclaimer)

<p align="center">
  <img src="docs/assets/screenshot_dashboard_main.jpg" alt="NeuroScope 3D workspace — 3D tumour mesh linked to synchronised MPR slices" width="820">
</p>

<p align="center"><em>The live workspace: a 3D digital twin of the brain with nested WT / TC / ET isosurfaces, linked to synchronised axial, coronal and sagittal MRI views sharing one crosshair — with volumes, Dice, and model confidence shown next to the result, not buried in a separate report.</em></p>

> **Research and teaching prototype only.** Suspected tumour regions predicted by the model. Estimated volumes only. Never a diagnosis, never a substitute for a radiologist. See [Disclaimer](#disclaimer).

---

## Why this exists

A brain MRI study for suspected glioma isn't one image — it's four 3D sequences (T1, T1Gd, T2, FLAIR), each roughly 155 slices, 620 flat images per case. Today, understanding a tumour's true 3D shape means scrolling through all of them and reconstructing it mentally: *is it one mass or two, which side is it on, how big is it in millilitres* — and a confident-looking AI overlay on one 2D slice doesn't tell you whether the 3D prediction underneath it is actually correct.

**NeuroScope 3D is built around one thesis: a 3D viewer alone isn't new — a 3D viewer that tells you whether to trust what it's showing you is.** That's the gap a structured review of the existing landscape (open-source viewers, commercial clinical AI, prior hackathon prototypes) found nowhere filled in one lightweight tool. See [`docs/PROBLEM_AND_APPROACH.md`](docs/PROBLEM_AND_APPROACH.md) for the full breakdown.

<p align="center">
  <img src="docs/assets/diagram_layers.png" alt="Three layers: image interpretation, AI segmentation, verification and trust" width="640">
</p>

## What's actually working today

This isn't a mockup. Every claim below is a measured result, reproducible from this repository:

| | |
|---|---|
| **17 / 17** | judges' own pipeline tests pass — failure pack, volume calibration, reproducibility, anisotropic, both orientation tests ([details](docs/VERIFICATION.md)) |
| **Real model** | MONAI `brats_mri_segmentation` (SegResNet, Apache-2.0, BraTS-2018), checkpoint sha256-verified before every load |
| **Dice 0.88 / 0.87 / 0.79** | WT / TC / ET, measured on **10 real, held-out** Medical Segmentation Decathlon cases — the PS's ≥10-case requirement, closed ([details](docs/VERIFICATION.md#real-data-accuracy-10-held-out-medical-segmentation-decathlon-cases)) |
| **~60–75s / case** | measured end-to-end, CPU-only, against a 120s budget on a T4 GPU |
| **Live uncertainty** | flip-based TTA ensemble — a *measured* confidence signal, not a guess, visible as a heat-map overlay |
| **0 cloud calls** | fully local inference; uploads deleted immediately after processing, derived artefacts expire in 23h |

## Feature highlights

- **Strict, fail-safe validation** — geometry, orientation, affine agreement, finite values, skull-strip and head-shape heuristics. A partially valid study produces zero output, never a degraded one.
- **Live 3D + linked MPR workspace** — a translucent brain shell with nested WT/TC/ET isosurfaces (custom Surface Nets extraction), linked axial/coronal/sagittal views sharing one crosshair, voxel *and* world-mm coordinates.
- **Flip-TTA model confidence** — the platform's actual differentiator: a measured disagreement signal shown as a toggleable heat-map, with an honest caveat attached everywhere it appears.
- **Connected-component summary** — answers "is it one mass or two?" automatically, for every region.
- **Transparent volumetrics** — every volume shows its formula: voxel count × spacing, on the original acquisition grid, plus max diameter and boundary surface area, each naming its own definition on hover.
- **Agreement overlay** — green where model and expert agree, amber where only the model flags tumour, red where only the expert does; "largest miss → go" flies the crosshair straight to the biggest thing the model left out.
- **Measure & window/contrast** — click two points for a real distance in mm from the scan's own spacing; drag to re-window the display, same way a clinical viewer does.
- **Quality Check Centre** — an itemised, real-validator-driven report (not a single PASS badge) of every check a study was put through.
- **A curated dataset gallery** — three synthetic reference cases plus real, de-identified Decathlon cases, runnable from the UI in one click.
- **Provenance & reporting** — checkpoint hash, input hashes, code commit, every validation warning, bundled into a printable report.

See [`docs/FEATURES.md`](docs/FEATURES.md) for the full breakdown by category.

<p align="center">
  <img src="docs/assets/screenshot_upload_panel.jpg" alt="Upload panel showing live pipeline stage progress" width="520">
</p>
<p align="center"><em>Upload triggers real, visible pipeline progress — validating → resampling → segmenting → measuring → meshing → reporting — not a silent spinner.</em></p>

## Architecture

A three-tier system: a React single-page app in the browser, a local FastAPI inference server, and a pure-Python pipeline library the server wraps — independently testable, with the pipeline shipping its own CLI and judge-scoring harness separate from the web server.

<p align="center">
  <img src="docs/assets/diagram_architecture.png" alt="System architecture: browser, FastAPI server, neuroscope pipeline, MONAI model" width="720">
</p>

| Tier | Stack |
|---|---|
| Browser | React 18 + TypeScript + Vite, Three.js via react-three-fiber, Zustand, Tailwind CSS v4 |
| Server | FastAPI, uvicorn — job lifecycle, live stage-progress reporting, the public HTTP API |
| Pipeline | Python — nibabel, PyTorch, MONAI, scipy; `backend/neuroscope/` is a standalone library with its own CLI |
| Model | MONAI `brats_mri_segmentation` (SegResNet), Apache-2.0, sha256-pinned at load |

Full technical deep-dive, the inference pipeline stage-by-stage, and the module reference table: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

<p align="center">
  <img src="docs/assets/diagram_pipeline.png" alt="Pipeline stages with measured timing" width="680">
</p>

## Quickstart

```bash
# Frontend
npm install
npm run dev                 # → http://localhost:5173 (renders a procedural demo case immediately)

# Backend (separate shell)
cd backend
pip install -r requirements.txt
python setup_model.py       # downloads + sha256-verifies the real checkpoint (~19MB)
uvicorn server.main:app --host 127.0.0.1 --port 8008

# Judges' scorer (no server needed)
python backend/make_testcase.py --out ./testdata
python backend/run_judge_tests.py --data ./testdata --model bundle

# Real tumour data, without a 7.6 GB download — see "Real data" below
python backend/tools/fetch_decathlon_sample.py --count 4 --out backend/data/raw_sample --index-cache backend/data/raw_sample/index_cache.json
python backend/tools/convert_decathlon.py --root backend/data/raw_sample/Task01_BrainTumour --out backend/data
python backend/evaluate.py --root backend/data/decathlon --limit 4 --out backend/data/real_sample_eval.json --model bundle
```

Open `http://localhost:5173`, click **Upload case**, drop in four NIfTI sequences (`.nii`/`.nii.gz`), and watch it segment live. No upload yet? The workspace renders a fully interactive synthetic demo case on load, or pick a real case from the **Datasets** panel.

**Or, one command:** `docker compose up --build` runs the frontend, backend, and the local tool-copilot's Ollama service together — see `docker-compose.yml` for the one-time model-pull step the chatbot needs. (Written and reviewed, not build-verified in this project's own dev environment — no Docker installed here; please report back if it needs a fix.)

## Real data, the clever part

Medical Segmentation Decathlon's Task01_BrainTumour archive is one 7.6 GB tar. `tools/fetch_decathlon_sample.py` doesn't download it — it walks the table of contents using one small HTTP Range request per entry (tar's fixed 512-byte member headers state each member's exact size), then fetches only the selected cases' actual image+label bytes in full. Result: **~38 MB instead of 7.6 GB** for 4 real, full-resolution cases. `tools/convert_decathlon.py` then splits each 4D volume into the four per-modality files this pipeline expects and remaps Decathlon's label codes to BraTS 1/2/4 — the two code systems differ and that mapping is exactly the kind of silent bug this project doesn't let through untested (`backend/tests/`).

## Documentation

| Doc | Covers |
|---|---|
| [`docs/PROBLEM_AND_APPROACH.md`](docs/PROBLEM_AND_APPROACH.md) | The clinical problem explained plainly, BraTS region definitions, the competitive landscape, and the three-layer framing this platform is built around |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full technical architecture, the inference pipeline stage-by-stage, module reference table |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Complete feature breakdown — ingestion/validation, visualisation, the trust layer, reporting |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | Measured results against every judges' test, with the exact commands that produced them |
| [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md) | Model name, version, licence, training data, preprocessing, known limitations |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | **The active backend work plan** — real data acquisition, multi-model benchmarking, hardening, phased and sequenced |
| [`docs/INTERACTIVE_PLATFORM_PLAN.md`](docs/INTERACTIVE_PLATFORM_PLAN.md) | **The active product-surface work plan** — what's landed (measure tool, window/contrast, agreement overlay, Quality Centre, dataset gallery) and what's next, in order |
| [`docs/BACKEND_ROADMAP.md`](docs/BACKEND_ROADMAP.md) | Earlier phased backend plan — many items already closed; check status markers |
| [`docs/PRODUCT_GAPS_AND_IDEATION.md`](docs/PRODUCT_GAPS_AND_IDEATION.md) | Gap analysis against real radiology workflows, and feature ideation with an explicit compliance note on what's out of scope |
| [`reports/NeuroScope 3D landscape research.md`](<reports/NeuroScope 3D landscape research.md>) | The original competitive/literature landscape research this whole approach is grounded in |

## Repository layout

```
backend/
  neuroscope/        pure-Python pipeline library (validate, infer, regions, provenance, limits, config)
  server/             FastAPI app — job lifecycle, live progress, samples, the HTTP API
  tools/               convert_decathlon.py, fetch_decathlon_sample.py, make_demo_gallery.py
  tests/               pytest suite (27 tests — validate, regions, model_base)
  data/                 Decathlon conversion output, split manifest, real eval results (gitignored, regenerable)
  samples/              curated demo + real cases served by /api/samples
  predict.py          CLI entry point (what the judges' scorer calls)
  evaluate.py         Dice/sensitivity scoring over a BraTS-style folder tree
  make_testcase.py    generates the full synthetic judge test pack
  run_judge_tests.py  runs the judge test pack and reports PASS/FAIL
  setup_model.py      downloads + sha256-verifies the MONAI checkpoint
src/
  components/         3D viewer, linked MPR grid, upload panel, metrics bar, Datasets/Help panels, Quality Centre
  lib/                 meshing (Surface Nets), volume/affine math, API client, keyboard shortcuts, sequence auto-detect
  state/               Zustand stores (crosshair, regions, live-study status)
docs/                 architecture, problem framing, features, verification, model card, roadmap, active plans
```

## Disclaimer

**Research and teaching prototype only.** This platform never establishes a diagnosis. It shows a *suspected tumour region predicted by the model* and an *estimated volume* — never "detected," never a "diagnostic system," and it never replaces a radiologist. It uses public, de-identified research data only; no real patient scans are used at any stage of development or testing. Out of scope, explicitly: diagnosis, grading, genetic prediction, prognosis, treatment advice, surgical or radiotherapy planning, and any claim of clinical validation or regulatory clearance.

## Licence & credits

- Base model: MONAI `brats_mri_segmentation` (SegResNet), **Apache-2.0**, MONAI Consortium.
- Data credit (if BraTS/Decathlon data is used in evaluation): BraTS 2021 — Baid et al., DOI [10.7937/jc8x-9874](https://doi.org/10.7937/jc8x-9874); Medical Segmentation Decathlon.
- This repository's own code: see individual file headers / LICENSE if present.
