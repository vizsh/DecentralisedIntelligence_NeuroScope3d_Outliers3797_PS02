# NeuroScope 3D — project context for Claude Code

Read this first in any new session. It's the orientation doc, not the detail — every claim here links to the doc that backs it.

## What this is

`DI-02` hackathon problem statement: a web platform that takes four MRI sequences (T1, T1Gd, T2, FLAIR), segments a suspected brain tumour (WT/TC/ET regions, BraTS convention), shows it in 3D + linked 2D slices, measures it, and — this is the actual differentiator, not a side feature — tells the user how far to trust the result. Research/teaching prototype only; see the Disclaimer in `README.md`. Full problem framing: [`docs/PROBLEM_AND_APPROACH.md`](docs/PROBLEM_AND_APPROACH.md).

**The thesis every design decision follows**: a 3D viewer alone isn't new (3D Slicer exists); a 3D viewer that visibly shows its own uncertainty, rejects bad input loudly, and explains every number is the whitespace nothing else in the landscape fills. Don't build features that only serve Layer 1 (viewing) or Layer 2 (raw segmentation) without this Layer 3 (trust) angle attached — that's the actual point of the project.

## Current state — read before assuming anything is missing or broken

- **Real model is live and verified**: MONAI `brats_mri_segmentation` (SegResNet, BraTS-2018, Apache-2.0), checkpoint sha256-pinned, loaded via `backend/setup_model.py`.
- **17/17 judges' own pipeline tests pass** with the real model — failure pack, volume calibration, reproducibility, anisotropic, both orientation tests. Reproduce: `cd backend && python run_judge_tests.py --data ./testdata --model bundle`. Full results: [`docs/VERIFICATION.md`](docs/VERIFICATION.md).
- **Real tumour data has landed, and the PS's ≥10-held-out-case requirement is closed.** Medical Segmentation Decathlon Task01_BrainTumour, fetched via HTTP Range requests against the tar's own headers (~99 MB for 10 cases instead of a 7.6 GB download — `backend/tools/fetch_decathlon_sample.py`). Measured real-data results on 10 held-out cases: Dice WT 0.8808 / TC 0.8697 / ET 0.7885, HD95 (mm) WT 8.43 / TC 5.53 / ET 5.71. One case (`BRATS_218`) scores notably lower on ET (Dice 0.308) and is reported, not excluded — real variance a small sample can't show. Full per-case breakdown: `backend/data/real_sample_eval.json`.
- **Flip-TTA uncertainty is live**: 2-pass flip ensemble, real measured per-voxel σ, shown as a toggleable heat-map in the UI with an honest caveat attached everywhere it appears (disagreement signal, not a calibrated probability).
- **The trust layer is now interactive, not just displayed**: a measure tool, window/contrast dragging, a colour-coded model-vs-expert agreement overlay with "largest miss → go" navigation, exact shape measurements (max diameter via convex hull, surface area), and a Quality Check Centre (itemised real-validator report, not one badge) all landed and are wired to real backend fields (`neuroscope.regions.geometry()` / `agreement()`).
- **A curated dataset gallery exists** (`/api/v1/samples`, `src/components/DatasetsPanel.tsx`) — 3 synthetic reference cases plus 4 real Decathlon cases, runnable from the UI (a larger, separate 10-case set backs the held-out evaluation below — see `backend/data/decathlon/`).
- **Backend hardening landed**: a settings object (`neuroscope/config.py`), structured logging, a formal model-adapter `Protocol` (`neuroscope/model_base.py`), and a 48-test pytest suite (`backend/tests/`) — run it with `cd backend && python -m pytest tests/ -q`.
- **Full-stack wiring is real**: React/Three.js frontend ↔ FastAPI server ↔ `neuroscope` pipeline library. Live upload → staged progress → 3D render, verified end to end, not mocked — including an actual real-case run through the live Datasets-panel button, which once surfaced and got a fix for a genuine infinite-render-loop bug (`src/state/study.tsx`) that only manifested when a live job transitioned to `'done'`, never under the demo phantom. See `docs/INTERACTIVE_PLATFORM_PLAN.md`'s takeaway: a feature checked only against the demo phantom is not verified.
- **HD95 is live** (`neuroscope.regions.hd95`) — 95th-percentile Hausdorff distance, spacing-aware, null (not 0/inf) when either mask is empty. Wired into the CLI, the live server, `evaluate.py`, and the UI's Accuracy card.
- **A local, guard-railed tool copilot is live** (`neuroscope/assistant.py`, `/api/v1/assistant/*`, `src/components/AssistantPanel.tsx`) — runs entirely against a local Ollama instance, clinician/trainee-facing only, never patient-facing (deliberate — see `docs/ASSISTANT.md`). Defense-in-depth guardrails (deterministic input guard, system prompt, structured JSON output, post-generation filter) verified against a 29-prompt adversarial pack: `cd backend && python run_assistant_guardrail_tests.py` (last measured 28/29; the one near-miss is content-safe, explained in `docs/ASSISTANT.md`). Requires `ollama serve` running locally with `llama3.1:8b` and `nomic-embed-text` pulled.
- **DICOM ingestion is live** (`neuroscope/dicom_io.py`, `POST /api/v1/studies/inspect-dicom`) — a real DICOM series or zip can be uploaded directly: grouped by `SeriesInstanceUID`, sorted along the slice normal, a verified LPS→RAS affine, sequence auto-detection from `SeriesDescription`/contrast tags, and a de-identification check that warns rather than assumes. This closes what `docs/PRODUCT_GAPS_AND_IDEATION.md` had flagged as "the highest-leverage item" for real-world adoption. The 3D viewer also has an interactive **cutaway view** (clipping plane, axial/coronal/sagittal) — a standard visualization technique, deliberately never branded "surgical" anywhere in the UI (see that same doc's and CLAUDE.md's out-of-scope rules — this was caught and fixed once already, see the "Fix two issues in the DICOM-ingestion/clipping-plane commit" commit).
- **A multi-workspace navigation shell landed** (`src/components/NavigationSidebar.tsx`, `src/state/workspaceStore.ts`, `src/components/workspaces/*`) — Command Centre, 3D Studio Viewer, Segmentation Review, Research Lab, Trust & Explainability, Patient Companion, NeuroLearn Academy, Research Graph. One real data-integrity incident happened here and was fixed, not just patched over: several of these workspaces initially shipped hardcoded numbers presented as measured results (a direct CLAUDE.md rule-1 violation) — now fixed to read from real committed data or the live study bundle, with honest "not yet measured" states where no real run exists yet. Read the fix commit ("Fix fabricated data and diagnosis-adjacent wording across new workspaces") before adding a new stat to any of these workspaces — the same mistake is easy to repeat.
- **Backend ops hardening landed**: a real FIFO job queue with live position/ETA replacing the old instant-409 (`server/main.py`'s `wait_for_slot`), structured `{code, message}` errors on every failure path (`ApiError` + a global exception handler — no more bare strings), a one-click case export bundle (`GET /api/v1/jobs/{id}/export` — report + metadata + prediction NIfTI, zipped), `/api/v1/metrics` (real job-outcome counters and inference-time P50/P95, not anecdote), **every route versioned under `/api/v1/`** (no backward-compat alias — old `/api/...` paths correctly 404), and CI (`.github/workflows/ci.yml` — pytest + the heuristic-model judge pack + a frontend build on every push; the real-checkpoint judge pack and the assistant's guardrail pack stay manual/local, documented why in the workflow itself). A Docker setup exists (`docker-compose.yml`) for one-command reproducibility — **written but not build-verified**, since this dev environment has no Docker; run it yourself before relying on it for a judging slot.
- **What's NOT yet true, stated plainly so nobody re-discovers this the hard way**: only one model architecture has been benchmarked — a check before writing the original implementation plan found that publicly-released BraTS-pretrained checkpoints barely exist outside the SegResNet bundle already in use, so multi-model comparison needs GPU training compute that hasn't been available yet. See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) (data/model work) and [`docs/INTERACTIVE_PLATFORM_PLAN.md`](docs/INTERACTIVE_PLATFORM_PLAN.md) (product surface work, with an explicit "landed and verified" section — **read it before assuming a feature isn't built**) for exactly what closes each gap and in what order.

## Repo map

```
backend/
  neuroscope/        pure-Python pipeline library — validate, infer (TTA), regions, provenance, limits, config, dicom_io, assistant
  server/             FastAPI app — job lifecycle, live stage-progress, /api/v1/samples, the HTTP API
  tools/               convert_decathlon.py, fetch_decathlon_sample.py (Range-request fetcher), make_demo_gallery.py
  tests/               pytest suite — 48 tests, run with `python -m pytest tests/ -q`
  data/                Decathlon conversion output + split + real eval results (gitignored, regenerable — see commands below)
  samples/              curated cases (3 synthetic + 4 real) served by /api/v1/samples
  predict.py          CLI entry point (what a judge's scorer calls)
  evaluate.py         Dice/sensitivity over a BraTS-style folder tree
  make_testcase.py    generates the synthetic judge test pack
  run_judge_tests.py  runs the judge pack, reports PASS/FAIL
  run_assistant_guardrail_tests.py  adversarial prompt pack for the tool copilot (see docs/ASSISTANT.md)
  setup_model.py      downloads + sha256-verifies the MONAI checkpoint
src/
  components/         3D viewer, linked MPR grid, upload panel, metrics bar, DatasetsPanel, HelpPanel, QualityCentre, AssistantPanel
  components/workspaces/  multi-workspace shell (Command Centre, 3D Studio, Review, Research Lab, Trust, Patient, NeuroLearn, Research Graph)
  lib/                 meshing (Surface Nets), affine math, API client, useShortcuts, sequenceDetect
  state/               Zustand stores (incl. workspaceStore.ts for the workspace shell)
docs/                 all project documentation — see index below
reports/              earlier landscape/competitive research (grounds the whole trust-layer thesis)
```

## Doc index — read the relevant one before touching that area

| Doc | When to read it |
|---|---|
| [`README.md`](README.md) | Quickstart, feature overview, disclaimer |
| [`docs/PROBLEM_AND_APPROACH.md`](docs/PROBLEM_AND_APPROACH.md) | Before any product/UX decision — the problem framing and the three-layer thesis |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Before touching the pipeline, server, or model code |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Full feature inventory — check before assuming something doesn't exist |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | Current measured test results, and the exact commands to reproduce them |
| [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md) | Model provenance, known limitations |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | **The active data/model work plan.** Read before starting new backend or data work. |
| [`docs/INTERACTIVE_PLATFORM_PLAN.md`](docs/INTERACTIVE_PLATFORM_PLAN.md) | **The active product-surface work plan.** Has an explicit "landed and verified" section — read before assuming a UI feature isn't built, and before starting new frontend work. |
| [`docs/BACKEND_ROADMAP.md`](docs/BACKEND_ROADMAP.md) | Earlier phased hardening plan; most items already closed (checkpoint hashing, resource limits, live progress, settings object, logging, pytest suite) — check status markers before re-doing them |
| [`docs/PRODUCT_GAPS_AND_IDEATION.md`](docs/PRODUCT_GAPS_AND_IDEATION.md) | Feature ideation, **and an explicit note on what's out of scope by the PS's own rules — read before adding anything diagnosis-adjacent** |
| [`docs/ASSISTANT.md`](docs/ASSISTANT.md) | The tool copilot's architecture, guardrail design, and adversarial test pack — read before touching `neuroscope/assistant.py` or adding a new workspace stat the assistant might be asked about |
| [`reports/NeuroScope 3D landscape research.md`](<reports/NeuroScope 3D landscape research.md>) | The competitive/literature research the trust-layer thesis is grounded in |

## Hard rules, not suggestions

1. **No claim ships without a reproducible run behind it.** If a number can't be regenerated from a committed script against named, versioned data, it doesn't go in a report, a doc, or a demo. This is why `docs/VERIFICATION.md` explicitly separates "measured" from "not yet measured" — keep that discipline.
2. **Wording**: "suspected tumour region predicted by the model," "estimated volume" — never "detected," "diagnostic," or "replaces the radiologist." This is a PS rule, not a style preference, and it's load-bearing for scoring.
3. **A result is never partial.** Validation stays all-or-nothing — don't add a code path that produces a mesh/report/measurement for a study that failed validation.
4. **No diagnosis/prognosis/treatment-advice features**, even hedged. See `docs/PRODUCT_GAPS_AND_IDEATION.md`'s explicit section on this before building anything in that direction.
5. **Geometry is sacred.** Any change touching resampling, affines, or orientation must be re-checked against the orientation judge tests (`run_judge_tests.py`) before being considered done — this is a known, real failure class in neuroimaging software.

## Running it locally

```bash
# Frontend
npm install && npm run dev                 # http://localhost:5173

# Backend
cd backend && pip install -r requirements.txt
python setup_model.py                       # one-time: downloads + verifies the real checkpoint
uvicorn server.main:app --host 127.0.0.1 --port 8008

# Verify nothing's broken after a change
python -m pytest tests/ -q                   # fast — unit tests for validate/regions/model_base
python make_testcase.py --out ./testdata     # only needed once, or after testdata/ is deleted
python run_judge_tests.py --data ./testdata --model bundle   # slower — full pipeline with the real model
```

Note: `backend/models/`, `backend/testdata/`, and `backend/.runtime/` are gitignored by design (weights, generated test data, live job artefacts) — if they're missing, that's expected, not a bug; regenerate with the commands above.

## Known environment quirks worth knowing before debugging them from scratch

- This has been developed in a sandboxed environment where the Bash tool's filesystem view and the native Windows filesystem (what PowerShell, VS Code, and locally-run `npm`/`node` processes see) can diverge for certain directories (notably `node_modules`). If `npm run dev` fails with a missing-binary error right after a Bash-run `npm install`, re-run `npm install` from the actual terminal/IDE you're using, not assume the install itself is broken.
- The backend server and frontend dev server are two separate processes (`uvicorn` on :8008, Vite on :5173) — both need to be running for live (non-demo) uploads to work. The UI always renders a procedural demo case with zero setup, so "nothing renders" on first load is not a sign the backend is required to be up.
- **Check for stale listeners before assuming something's broken — and verify the kill actually landed.** A previous session's `uvicorn`/`vite` process can be left running and still answer health checks while being out of date (missing new endpoints, or running old Python module code — Python does not hot-reload without `--reload`). `netstat -ano | grep -E ":5173|:8008"` to check; if a PID is old, kill it and restart fresh rather than debugging a "missing" endpoint that's actually just not loaded yet. Don't assume a kill worked from its exit code alone: `pkill -f` issued from the Bash tool can report success while a PowerShell-visible process on the same port keeps answering requests (observed directly while building the assistant feature — a `pkill` + Bash-background restart left an old process bound to :8008 for several more requests). The reliable sequence is `netstat -ano | Select-String ":8008"` in PowerShell to get the real PID, `Stop-Process -Id <pid> -Force -Confirm:$false` in PowerShell to kill it, then restart and re-curl a cheap endpoint (e.g. `/api/v1/health`) to confirm the new code is actually live before trusting anything downstream of it.
