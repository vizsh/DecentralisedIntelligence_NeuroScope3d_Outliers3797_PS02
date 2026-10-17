# Feature Reference

Full breakdown of what NeuroScope 3D does today, organised by category. For the reasoning behind *why* these specific features (not others), see [`docs/PROBLEM_AND_APPROACH.md`](PROBLEM_AND_APPROACH.md).

## 1. Ingestion & validation

- Accepts four NIfTI sequences (`.nii` / `.nii.gz`), one per slot, plus an optional expert mask in BraTS codes (1 NCR, 2 ED, 4 ET).
- Rejects, with a specific message naming the sequence and the exact problem: unreadable/corrupt files, non-3D volumes, non-finite (NaN/Inf) values, constant/all-zero scans, files over 1 GB, and any set whose shapes or affines disagree.
- Checks geometric plausibility beyond format errors — affine singularity, physical field-of-view bounds, and how much foreground touches the image boundary — catching technically-readable files that aren't a usable brain study.
- Flags inputs that don't look skull-stripped or don't look like a head at all, with the specific heuristic that triggered.
- **All-or-nothing**: a study with one unreadable file produces zero output, never a degraded one.

## 2. Live segmentation

- Runs a real, pretrained MONAI SegResNet (`brats_mri_segmentation`, Apache-2.0, BraTS-2018-trained), loaded only after its checkpoint's sha256 hash is verified against a pinned lock file.
- Inference runs as a small flip-based TTA ensemble (2 passes by default) rather than a single pass — see [Trust layer](#4-trust-layer) below.
- Output is mapped back onto the exact input grid and affine, at BraTS codes 1/2/4.
- Available both through the live web workspace and as a standalone CLI (`backend/predict.py`) for automated judge scoring.
- A hard voxel-count cap and a request-size guard keep memory and request size bounded.
- **Measured timing**: ~60–75s per case, CPU-only, against a 120s budget.

## 3. 3D & multi-planar visualisation

### 3D digital twin
- A translucent brain shell — custom Surface Nets isosurface extraction, not a coarse marching-cubes approximation.
- WT, TC and ET render as independent, nested isosurfaces in true millimetre world space, each with its own visibility toggle and opacity control.
- Native WebGL orbit/zoom/pan (Three.js via react-three-fiber), with bloom and vignette post-processing.
- Clicking a region flies the camera to it and drops surrounding shells to a lattice/wireframe mode automatically.

### Linked multi-planar reconstruction
- Axial, coronal and sagittal panels share one voxel crosshair — moving it anywhere, including a click on the 3D mesh, updates all of them instantly.
- Every panel carries explicit L/R, A/P, S/I orientation labels, derived live from the scan's own affine.
- Crosshair position is always shown as both a voxel index and a physical world-mm coordinate.
- A fourth panel lets a user compare an alternate sequence side by side without losing the shared crosshair.
- Segmentation overlays render as a soft colour wash, not a hard outline, so underlying tissue stays visible.

### Model vs. expert comparison
- When an expert mask is supplied, every view — 3D mesh, 2D overlay, metrics bar — can switch between the model's prediction and the expert's annotation with one toggle.

## 4. Trust layer

*The platform's actual differentiator — see [`docs/PROBLEM_AND_APPROACH.md`](PROBLEM_AND_APPROACH.md) for why this is the whitespace.*

### Flip-TTA model confidence
- Each case runs through the network twice (unflipped + one flip axis), and the per-voxel standard deviation between passes is a **measured** disagreement signal — not a proxy, not guessed.
- Rendered as a toggleable heat-map overlay directly in the slice views, plus a mean/boundary-max σ readout per region.
- Carries an explicit caveat everywhere it appears: disagreement under augmentation, not a calibrated probability — low σ does not by itself guarantee correctness.
- Works *without* an expert mask — the common case, not the exception.

### Connectivity — "is it one mass or two?"
- 26-connected-component analysis on every predicted region: component count, each component's volume, and the largest's share of the total.
- Answers the exact question the problem statement's own framing opens with, at zero extra inference cost.

### Transparent volumetrics
- Every volume shows its formula inline: voxel count × (Δx × Δy × Δz) ÷ 1000, on the original acquisition grid.
- Verified against the judges' own calibration case: a 20×20×20-voxel cube at 1×1×2mm reads exactly WT = 16.0 mL.

### HD95 — boundary distance, not just overlap
- Dice and sensitivity are volume-overlap metrics; a thin sliver of disagreement at a tumour's edge barely moves either. HD95 (95th-percentile Hausdorff distance) measures the same disagreement by physical distance, in mm, via a spacing-aware Euclidean distance transform between predicted and expert boundaries.
- 95th percentile, not the plain maximum, so one stray outlier voxel doesn't dominate the number.
- Explicitly `null`, not 0 or infinite, when either mask is empty — a boundary distance against nothing is undefined, and the platform says so rather than picking a convenient default.
- Named explicitly in the PS's extra-credit list; available in the live report, the CLI's JSON output, and `evaluate.py`'s real-data accuracy run.

### Visible validation status
- A pass/warning badge in the metrics bar reflects the real validation result for the current study, with specific warning text on hover.
- **Quality Check Centre** — a floating, itemised report (not a single badge) of every real validator check a study was put through, so a pass is auditable, not just asserted.

### Shape measurements
- Max 3D diameter (exact, via convex hull) and boundary surface area reported under each region's volume, each naming its own definition on hover.
- Centroid and bounding box also computed (`neuroscope.regions.geometry`), available in the provenance record.

### Agreement overlay and largest-miss navigation
- When an expert mask exists, a dedicated overlay shows green where model and expert agree, amber where only the model flags tumour, red where only the expert does — true/false-positive/negative made spatially visible, not just a Dice number.
- **"Largest miss → go"** in the metrics bar flies the crosshair straight to the centre of the biggest thing the model left out and switches to the agreement overlay automatically.

## 5. Interrogation tools

Turns the viewer from something you look at into something you interrogate.

- **Measure** — click two points on any slice view for a real physical distance in mm, computed from that scan's own voxel spacing.
- **Window / contrast** — drag to re-window the display (up/down adjusts centre, left/right adjusts width), the same interaction a clinical PACS viewer uses. Defaults reproduce the previous fixed display ramp exactly, so opening the tool changes nothing until touched.
- **Keyboard shortcuts** — `C` crosshair, `M` measure, `W` window, `O` overlay toggle, `E`/`U` expert/uncertainty views, `A` agreement, `B` brain shell, `?` help, `Esc` to exit a tool — suppressed while a text field has focus.
- **Dataset gallery** — three curated synthetic reference cases (unifocal, multifocal, large-diffuse) plus real, de-identified Decathlon cases, each runnable from the UI in one click via `/api/v1/samples`.

## 6. Reporting & provenance

| Category | Fields |
|---|---|
| Model provenance | Model name, bundle version, licence, checkpoint sha256, TTA pass count and method |
| Input provenance | Per-sequence sha256 of uploaded files, geometry (dims/spacing/affine), code commit hash |
| Results | Per-region volume with formula, Dice/sensitivity vs. expert mask, connectivity, mean/max uncertainty, max diameter, surface area, TP/FP/FN agreement |
| Process | Timestamp, total runtime, every validation warning that fired |
| Compliance | The disclaimer, and explicit, itemised limitations |

- Processing is entirely local — no scan, mask, or derived data is ever sent to a third-party service.
- Uploaded source files are deleted immediately once a result exists; derived job artefacts expire after 23 hours.
- The report generator only ever runs after a study passes validation — there's no code path that produces a report for a failed input.

## 7. Judge-test verification

Every item below is a documented PS requirement, measured by actually running the judges' own test generator and scorer against this codebase with the real, verified model. Full results and the exact commands: [`docs/VERIFICATION.md`](VERIFICATION.md).

| Test | Result |
|---|---|
| Failure pack (×8 broken inputs) | **PASS** — 9/9, every case rejected with a specific message |
| Volume calibration (20×20×20 cube) | **PASS** — exact, 16.000 mL |
| Reproducibility (Dice ≥ 0.99) | **PASS** — 1.00000 |
| Anisotropic agreement (within 10%) | **PASS** — 2.1–5.4% measured |
| Orientation, same anatomy | **PASS** — 0.0% difference |
| Orientation, mirrored anatomy | **PASS** |

**17 / 17 automated pipeline tests pass with the real, checkpoint-verified MONAI model.** Separately, on 10 real, held-out Decathlon cases — the PS's ≥10-case requirement — Dice 0.88 / 0.87 / 0.79 (WT/TC/ET), HD95 8.4 / 5.5 / 5.7mm — see [`docs/VERIFICATION.md`](VERIFICATION.md#real-data-accuracy-10-held-out-medical-segmentation-decathlon-cases).

## What's next

See [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) (data + model work) and [`docs/INTERACTIVE_PLATFORM_PLAN.md`](INTERACTIVE_PLATFORM_PLAN.md) (product surface, prioritised) for the live plan. Near-term: finish the real-data evaluation to 10 cases, a pre-inference preview, an interactive failure simulator, atlas-relative localisation, modality-ablation explanation, and DICOM ingestion.
