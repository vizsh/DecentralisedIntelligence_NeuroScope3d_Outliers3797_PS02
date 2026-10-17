# Interactive Platform Plan

The workstream that turns NeuroScope 3D from "a viewer that displays the trust
layer" into "a tool you can interrogate it with". Companion to
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), which owns data and model
work; this one owns the product surface.

Written mid-build, so it records what already landed as precisely as what
hasn't — the most expensive mistake on resuming is re-doing finished work.

---

## 0. Landed and verified

Everything in this section is committed, type-checks clean, and was exercised
either in a browser or by a test with a known answer. Do not rebuild it.

### Real data — the headline change

The platform has measured accuracy on **real tumour data** for the first time.
Previously every Dice figure came from this project's own synthetic phantom.

| Region | Mean Dice | Mean sensitivity |
|---|---|---|
| WT | **0.9013** | 0.8677 |
| TC | **0.8989** | 0.8882 |
| ET | **0.8503** | 0.8207 |

Four real Medical Segmentation Decathlon cases (`BRATS_206`, `BRATS_306`,
`BRATS_449`, `BRATS_457`), real MONAI SegResNet checkpoint, reproducible:

```bash
cd backend
python evaluate.py --root data/decathlon --limit 4 --out data/real_sample_eval.json --model bundle
```

Full per-case output is committed at `backend/data/real_sample_eval.json`.

**How the data got here without a 7.6 GB download.** `tools/fetch_decathlon_sample.py`
walks the official tar's table of contents using HTTP Range requests against its
512-byte member headers, then fetches only the selected cases' payloads —
**37.7 MB instead of 7.6 GB**. `tools/convert_decathlon.py` then splits the 4D
volumes per modality and remaps Decathlon's label codes to BraTS 1/2/4.

### Backend

- `neuroscope/regions.py` — `geometry()` / `geometry_all()`: max 3D diameter
  (exact, via convex hull), boundary surface area, centroid, bounding box.
  Each number ships its own definition string.
- `neuroscope/regions.py` — `agreement()` / `agreement_all()`: TP / FP / FN
  voxel counts per region plus the centre and volume of the largest
  false-negative blob.
- `server/main.py` — both are in the job metadata as `geometry` and `agreement`.
- 27 pytest tests pass, including hand-computed geometry answers (a 10-voxel
  cube's diagonal and 600 mm² surface, anisotropic spacing at 1000 mm²).

### Frontend

- **Measure tool** — click two points on a view for a distance in mm from that
  scan's own spacing. Was a dead `onClick={() => {}}` stub.
- **Window / contrast** — drag to re-window (up/down centre, left/right width).
  Also a dead stub before. Defaults reproduce the previous fixed ramp exactly,
  so opening it changes nothing until touched.
- **Agreement overlay** — green where model and expert agree, amber where only
  the model says tumour, red where only the expert does.
- **"Largest miss → go"** in the metrics bar flies the crosshair to the biggest
  thing the model left out and switches to the agreement overlay.
- **Quality Check Centre** — the single PASS badge became a floating, itemized
  7-check report derived from real validator findings (a popover, so the 3D
  view never gets squeezed).
- **Shape measurements** — max diameter and surface area under each region's
  volume, each naming its definition on hover.
- **Keyboard shortcuts** — C/M/W/O/E/U/A/B/? and Esc, suppressed while a field
  has focus (`lib/useShortcuts.ts`).
- **Multi-Workspace Studio Architecture** — Refactored NeuroScope 3D into a full research studio with 6 dedicated workspaces and a signature Research Graph:
  - `01 Command Centre (/dashboard)`: Session-level triage, cohort casebook, QC backlog, and health overview.
  - `02 3D Studio Viewer (/studio/:id)`: 3D digital twin + linked MPR, measurement HUD, and spatial bookmarks drawer.
  - `03 Segmentation Review (/review/:id)`: Disagreement mapping (TP/FP/FN), error cluster explorer, and audit disposition.
  - `04 Research Lab (/research)`: Cohort experiment builder, Decathlon 10-case benchmark, boxplot distributions, and outlier drilldown.
  - `05 Trust & Explainability (/trust/:id)`: 3-Pillar audit, interactive uncertainty threshold slider, calibration curve, 7-point fail-safe checks, and SHA-256 provenance chain.
  - `06 NeuroLearn Academy (/learn)`: 4 guided interactive teaching laboratories (MRI sequences, BraTS labels, geometry simulation, and failure modes).
  - `★ Research Graph (/graph)`: Interactive navigable DAG tracing Studies → Runs → Reviews → Experiments → Reports.
- Help panel documents all of the above; its previous "these are stubs" note is
  gone because it is no longer true.

---

## 1. Next up, in order

### 1a. Documentation sweep — **done**

`docs/VERIFICATION.md`, `docs/MODEL_CARD.md`, `README.md`, `docs/FEATURES.md`
and `CLAUDE.md` all updated with the real-data Dice table, the Range-request
fetch trick, and the six new interactive features. Each real-data mention
carries both caveats (4 of the required ≥10; pretraining overlap not
verifiable).

### 1b. Close the one unmet mandatory requirement — **done**

The feature-plan audit found 13 of 14 mandatory DI-02 boxes already met. The
exception: **held-out Dice and sensitivity on at least 10 labelled cases.**
Closed: `backend/data/real_sample_eval.json`'s `cases_scored` reads 10.
Real figures (10 Decathlon cases, real checkpoint, no fine-tuning):

| Region | Dice | Sensitivity | HD95 (mm) |
|---|---|---|---|
| WT | 0.8808 | 0.8460 | 8.43 |
| TC | 0.8697 | 0.8505 | 5.53 |
| ET | 0.7885 | 0.7617 | 5.71 |

`docs/VERIFICATION.md` and `docs/MODEL_CARD.md` carry the full breakdown.
Two things worth knowing if this needs re-running: the `--count 10` fetch was
genuinely slow under real network conditions the first time (one connection
read-timeout mid-run, past the "cache makes the re-walk instant" assumption
this section originally stated) — see `backend/tools/fetch_decathlon_sample.py`'s
retry-loop fix, committed alongside HD95. And `BRATS_218` scores notably
lower on ET (Dice 0.308) than the other nine cases — this is reported in the
committed figures, not excluded or treated as an error; a 10-case sample
surfacing real variance a 4-case one couldn't is the entire point of doing
this expansion.

### 1c / 1d. Wire real cases into the Datasets panel + verify against a live backend — **done, and found a real bug doing it**

Running an actual real-case job through the live server for the first time
(not TestClient, the literal Datasets-panel click path) surfaced a genuine
infinite-render-loop bug that every prior check had missed, because every
prior check used the demo phantom, which never flips `useLiveStudy`'s
`status` to `'done'`:

`src/state/study.tsx`'s `StudyProvider` selected `useLiveStudy` with
`(s) => (s.status === 'done' ? { jobId: s.jobId!, metadata: s.metadata! } : null)`
— a selector that **constructs a new object on every call**. Zustand's
`useSyncExternalStore`-based subscription compares snapshots by reference;
a fresh object every read means "changed" every time, which re-renders the
component, which calls the selector again, forever. Error signature: `Warning:
The result of getSnapshot should be cached to avoid an infinite loop` followed
by `Maximum update depth exceeded`, both pointing at `StudyProvider`. The
screen goes solid blank — no error boundary, no partial render, just a black
page, which is its own lesson about why one would be worth adding.

**Fixed** by selecting `status`, `jobId` and `metadata` as three separate
primitive/stable-reference selectors and combining them in a local `const`
outside the subscription, so the subscription itself only ever sees genuinely
unchanged values between real updates. One line of root cause, now with a
comment at the call site explaining why the obvious-looking inline-object
version is wrong.

Verified after the fix, live, with a real Decathlon case run from the actual
Datasets panel button (not simulated): real anatomy rendered in 3D and all
three MPR views, WT/TC/ET volumes matched the committed `real_sample_eval.json`
figures for that case, connectivity read "single connected mass" / "2
disconnected regions" correctly per region, uncertainty σ displayed, the
agreement overlay showed real green/amber/red voxels, "largest miss → go"
was present and worked, and the Quality Centre showed "7 checks run" against
that study's real validator output. Crosshair click-to-move was re-tested
post-fix and works on a live case. Console is clean on a fresh reload.

**Takeaway for whoever resumes next**: a feature verified only against the
demo phantom is not verified. The phantom never exercises the `status: 'done'`
transition, the `geometry`/`agreement` fields, or real-grid dimensions — three
separate things this one bug alone touched. Re-check anything new against a
real, live-server-run case before calling it done, the way this round did.

Note: ports 5173 and 8008 can be held by an older orphaned session between
build sessions; a stale `uvicorn` process will still answer `/api/v1/health`
while predating a newly-added endpoint like `/api/v1/samples`. Check
`netstat -ano | grep -E ":5173|:8008"` and compare the PID's age before
assuming a "missing" endpoint is a code bug rather than a stale process —
see `CLAUDE.md`'s "known environment quirks" section.

---

## 2. Designed but not built

From the feature plan and the reference images, in rough value order. Nothing
here is started.

| Feature | What it adds | Notes |
|---|---|---|
| **Pre-inference preview** | Show all four scans, dimensions and orientation before committing to a ~70 s run | Pairs with the filename auto-routing already shipped: auto-sort → preview → confirm |
| **Interactive failure simulator** | Pick "missing FLAIR" / "mismatched shape" / "non-brain scan" from a menu and watch the real validator reject it live | Performs "engineered to fail safely" instead of asserting it. Must use synthetic inputs and never bypass validation on a real upload |
| **Session case log** | Every run recorded locally (timestamp, volumes, Dice) so a user can flip back without re-running | `localStorage`; job artefacts already expire server-side in 23 h |
| **Two-case compare** | Any two logged cases side by side with deltas | Precursor to full longitudinal comparison, useful today |
| **Review-priority badge** | Flag a case whose mean σ is an outlier against the session's own distribution | Already scoped as PS-safe: a statement about the model's output, never about the patient |
| **Modality-ablation toggle** | Re-run with one channel zeroed, highlight the voxels that disappear | Teaches which sequence carried the call. Only valid if the model supports missing modalities — do not present a zeroed input as equivalent |
| **Guided first-run tour** | Five-step walkthrough built on the Help panel primitives | Onboarding friction is the real adoption blocker |
| **Interactive case builder** | Expose `make_demo_gallery.py`'s lesion parameters as sliders, generate and segment live | Teaching-hospital use case; no new model work |
| **Atlas-relative localisation** | "Which lobe", not just "which side" | Affine-only alignment, disclosed as approximate |
| **DICOM ingestion** | Accept what a resident's worklist actually contains | Highest real-world-adoption leverage of anything on this list |
| **Five-workspace navigation** | Analyse / Compare / Research Lab / Learn / Reports | Worth revisiting now that Datasets and Help exist as panels |

Out of scope, restated: no diagnosis, grading, prognosis or treatment
suggestion, even hedged. See `PRODUCT_GAPS_AND_IDEATION.md`.

---

## 3. Design constraints for anything added here

The incumbent visual world is authority — dark clinical workstation, tokens in
`src/index.css` (`--color-ink`, `--color-panel`, `--color-edge`, region colours
WT teal / TC amber / ET rose), Inter plus a monospace reserved for data and
measurement. Extend it; don't replace it.

Checks that failed nothing this round and should keep passing: no nested cards,
no gradient text, no glass as decoration, no coloured border-left above 1 px, no
emoji standing in for icons, every browser surface themed. Run the detector over
changed files before calling UI work done:

```bash
.claude/skills/impeccable/scripts/impeccable detect --json <changed files>
```

The deeper rule, which no detector catches: the 3D view is the point of this
screen. Secondary information floats, collapses, or goes in a panel — it never
squeezes the twin.
