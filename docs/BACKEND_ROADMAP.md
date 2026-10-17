# Backend roadmap

This roadmap is grounded in three things, in this priority order: the DI-02
problem statement's own requirements and judges' scoring matrix, the current
measured state of this codebase, and the whitespace identified in
`reports/NeuroScope 3D landscape research.md`. Nothing here is aspirational —
every item ties back to a specific judge test, a specific PS sentence, or a
specific research finding. Phases are sequential; do not start a later phase
before the one before it is closed, because later phases assume the
guarantees earlier ones establish (a provenance panel is worthless if the
pipeline underneath it isn't yet verified correct).

## Where this stands today (measured, not assumed)

Running `python run_judge_tests.py --data ./testdata --model heuristic`
against the merged backend on 2026-10-16:

```
=== 17/17 passed ===
```

That covers, byte-for-byte against the PS's own test matrix:
- **Failure pack** (9/9): non-NIfTI, corrupt gzip, 2D image, all-zero volume,
  NaN values, mismatched shape, mismatched affine, missing sequence, >1GB —
  every one rejected with a specific, correct message, no partial result.
- **Volume calibration**: the judges' 20×20×20 cube at 1×1×2mm reads exactly
  WT 16.0 mL, TC 0, ET 0.
- **Reproducibility**: Dice ≥ 0.99 across repeated runs (measured 1.00000).
- **Anisotropic**: WT volume agrees within 10% after every-other-slice removal
  (measured 5.4%).
- **Orientation, same anatomy**: tumour stays on the same labelled side,
  volume within 2% (measured 0.0%).
- **Orientation, mirrored anatomy**: tumour correctly moves to the other side.

This was run with the heuristic intensity-threshold segmenter, which is
**not a trained model** — it exists purely to exercise validation,
resampling, orientation handling and grid round-tripping without needing the
MONAI checkpoint. The fact that all seven geometry/safety-critical judge
tests pass under it proves the *pipeline* is correct independent of model
quality. What it does **not** prove is segmentation accuracy — that needs
the real bundle, which is the first item below.

The FastAPI server (`backend/server/`) was separately verified end-to-end:
a real upload → validate → infer → viewer-payload round trip over HTTP, and
a from-the-browser-origin fetch confirming CORS and byte-exact payload sizes
against what the frontend's meshing/slice code expects.

## Phase 1 — close what's required to actually be scored

Nothing in later phases matters if these don't hold, because the PS's own
grading rubric runs before the live demo slot.

1. ~~Download and verify the MONAI bundle.~~ **Done.** `python setup_model.py`
   fetches the real checkpoint and pins its sha256 in `model-lock.json`,
   verified on every load by `neuroscope.infer.load_segmenter`.
   `run_judge_tests.py --model bundle` passes 17/17 with the real network:
   ~37s/case on CPU (well inside the 2-minute T4 budget), Dice WT 0.960 /
   TC 0.920 / ET 0.953 on the synthetic calibration case. That number is a
   pipeline-integrity check, not a real accuracy result — it's a synthetic
   case, not real BraTS data — so item 2 below is still the one that
   actually answers the **Held-out accuracy** and **Blind case** judge
   tests.

2. **Real Dice/sensitivity baseline, patient-split, overlap disclosed.**
   `evaluate.py` already computes Dice/sensitivity over a BraTS-style folder
   tree. Run it against ≥10 real held-out cases once the bundle is in place,
   record the patient ID split, and explicitly disclose that the bundle was
   trained on BraTS 2018 — if evaluation cases are drawn from BraTS 2021,
   unknown overlap with the pretraining set must be stated per the PS's own
   rule ("disclose any overlap between your evaluation cases and your
   model's training data").

3. **Input-sanity judge test, verified against real non-brain/non-skull-stripped
   files**, not just the synthetic broken-pack. `neuroscope/validate.py`'s
   heuristics (zero-fraction, head-shape, FOV, edge-occupancy — the last two
   folded in this phase from the Brain_Visuals comparison) have never been
   run against an actual non-skull-stripped clinical volume or a genuinely
   non-brain image. Find or construct two such cases and confirm a warning
   or refusal actually fires before trusting this at the live judging slot.

4. **2-minute T4 SLA, measured on the organizer's actual hardware.** A full
   CPU run (upload → report) already comes in around 40-45s on this
   development machine, which is a strong sign the T4 budget is comfortable
   — but that's not the organizer's hardware, and it should still be timed
   there once available; a slower disk, more network latency on the upload,
   or a larger real case could change the margin.

5. **Linked-view click test against a live (not demo) study**, since the
   crosshair-sync code was built and tested against the phantom. Upload a
   real case through the UI, click a known point in one MPR panel, confirm
   the 3D crosshair and the other two panels land within 2 voxels — this is
   a literal judge test and the live-data path through it has not yet been
   exercised end-to-end through the browser (only verified by direct API
   calls so far).

## Phase 2 — hardening (already-closed items get load-bearing from here)

These don't gate judge tests directly but are what "iron clad" means once
Phase 1 is done — a pipeline that's merely correct under test conditions
isn't the same as one that fails safely under adversarial or just messy
real-world input.

- ~~Checkpoint hash verification before every model load~~ — **done this
  pass**: `setup_model.py` + `model-lock.json` + verification in
  `load_segmenter`. Means a corrupted or swapped checkpoint is refused, not
  silently used.
- ~~Resampled-grid voxel budget~~ — **done this pass**: `neuroscope/limits.py`
  caps the inference grid at 32M voxels in both `predict.py` and the server,
  so an unusually large or finely-spaced input fails with a clear message
  instead of exhausting memory mid-run.
- ~~Request-level upload size guard~~ — **done this pass**: the FastAPI
  server now rejects an oversized multipart request by `Content-Length`
  before streaming a single byte, not only after the per-chunk loop catches
  it.
- ~~Live pipeline-stage progress~~ — **done this pass**: the job id is now
  minted client-side so the browser can poll `/api/v1/jobs/{id}/status`
  concurrently with the upload, and the server reports stage transitions
  (`validating → resampling → segmenting → measuring → meshing →
  reporting → done`) as it goes. The upload panel shows the live stage and
  a progress bar instead of a spinner with no information for the ~30-45s
  a real case takes — this matters specifically for presenting live: judges
  watching "Running 3D segmentation — this is the slow step…" sit for 30
  real seconds see the pipeline actually working, not an ambiguous wait.
- **Structured logging + request IDs.** Right now the server's only
  observability is uvicorn's access log and bare exceptions. A job ID is
  already generated per request — thread it through structured log lines
  (job start/validate/infer/write/done, with timings) so a failure in the
  live demo slot is diagnosable in seconds, not by reproducing it.
- **Config via one settings object**, not scattered `os.environ.get` calls
  across `server/main.py`. Low risk, but worth doing before this file grows
  further.
- ~~A real pytest suite~~ — **done**: `backend/tests/` wraps `validate.py`,
  `regions.py`, `model_base.py`, the pre-flight `/api/v1/studies/inspect`
  endpoint, and the job queue (42 tests total) as fast unit tests, so a
  future change to a validation threshold or the Dice formula is caught
  immediately rather than only by the slower, end-to-end
  `run_judge_tests.py`.
- ~~Wired into CI~~ — **done**: `.github/workflows/ci.yml` runs the pytest
  suite and `run_judge_tests.py --model heuristic` (the real checkpoint is
  deliberately excluded from CI — too slow/heavy to fetch on every push;
  run it locally before a release) on every push and PR, plus a frontend
  `tsc --noEmit` + `vite build`.
- ~~Concurrency behaviour under load~~ — **done**: the single global `busy`
  lock now has a real FIFO queue in front of it (`server/main.py`'s
  `wait_for_slot`) — a second uploader gets a live queue position and a
  measured-average ETA via `/api/v1/jobs/{id}/status`, not a bare "busy, try
  again" rejection. See `backend/tests/test_queue.py`.

## Phase 3 — the actual differentiation (from the landscape research)

The research report's core finding: nothing in the existing open-source,
commercial, or prior-hackathon landscape combines live 3D+MPR rendering with
*visible* model uncertainty, an interactive explainability control, and a
real provenance/fail-safe panel, in one lightweight tool. Phase 1 and 2 make
the baseline trustworthy; this is where trust becomes visible to the user.

- ~~Uncertainty, surfaced on the mesh and slices, not just computed.~~
  **Done.** A flip-based TTA ensemble (2 passes by default, not full
  MC-dropout — the research flagged that MC-dropout uncertainty correlates
  weakly, r<0.05, with actual boundary error in at least one 2025 study, so
  the method matters, not just "some heatmap"). Surfaced as a toggleable
  boundary-confidence heat-map overlay in the MPR views and a mean/max-σ
  readout per region, both carrying an explicit "disagreement signal, not a
  calibrated probability" caveat. Still open: the equivalent on the 3D mesh
  itself (per-vertex uncertainty colouring) — today it's 2D-slice-only; and
  a real check of whether 2-pass TTA's σ actually correlates with true
  boundary error on real BraTS data, which the research's own caution about
  naive uncertainty UIs makes worth doing before trusting the signal in a
  live demo claim.
- ~~Connected-component summary~~ ("is it one mass or two?", from the PS
  story's own opening question) — **done**, via
  `neuroscope.regions.connectivity_all`, surfaced per-region in the metrics
  bar.
- **Modality-ablation explain toggle.** Established as a research/robustness
  technique (missing-modality BraTS studies) but, per the research, never
  framed as an interactive clinician-facing UI control — this is genuine,
  defensible novelty for a 24-hour build, not a reinvention. Label it clearly
  as "not clinical evidence."
- **HD95** alongside Dice/sensitivity in both `evaluate.py` and the live
  report — named explicitly in the PS's extra-credit list and already
  implied by the Dice infrastructure in `neuroscope/regions.py`.
  **Colour-coded TP/FP/FN agreement map** against the expert mask is PS
  extra credit too and is a natural companion to the uncertainty overlay
  once that infrastructure exists.
- **"Second reader" framing** in the provenance report and UI copy, not just
  the disclaimer banner — the research cites clinician-preference evidence
  (75.4% favourable) for this framing over an autonomous-AI framing, and it
  costs nothing but copy once the provenance report itself is solid.

## Phase 4 — remaining extra credit, if time allows

- DICOM input (PS extra credit).
- Longitudinal two-scan comparison for one patient (PS extra credit).
- Quality-degradation fallback instead of hard rejection when exactly one
  sequence is missing (PS extra credit) — note this is in tension with the
  "never show a result for an input you could not process" core requirement,
  so it needs a very clearly labelled degraded-confidence mode, not a silent
  substitution.

## Explicitly not doing

- Chasing BraTS leaderboard Dice via a custom-trained/ensembled architecture
  (nnU-Net/MedNeXt territory). The research is clear this is a losing race
  in a 24-hour build and the PS only asks for "within 0.05 of the organizer
  baseline," not SOTA.
- Full MC-dropout or large-ensemble uncertainty — too slow for the 2-minute
  budget and, per the research, not clearly more trustworthy than cheaper
  methods anyway.
