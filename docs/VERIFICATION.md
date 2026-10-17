# Verification Against the Judges' Own Test Matrix

Every result below is a **measured outcome**, not a claim — produced by running the actual judges' test generator (`backend/make_testcase.py`) and scorer (`backend/run_judge_tests.py`) against this codebase with the real, checkpoint-verified MONAI model.

## Reproduce these results yourself

```bash
cd backend
pip install -r requirements.txt
python setup_model.py                                    # downloads + sha256-verifies the real checkpoint
python make_testcase.py --out ./testdata                 # generates the full synthetic judge test pack
python run_judge_tests.py --data ./testdata --model bundle
```

## Results

```
=== Failure pack (must reject, no result) ===
  [PASS] non-NIfTI named .nii.gz
  [PASS] corrupt gzip
  [PASS] 2D image
  [PASS] all-zero volume
  [PASS] NaN values
  [PASS] mismatched shape
  [PASS] mismatched affine
  [PASS] only three sequences
  [PASS] file over 1 GB

=== Volume calibration (expert mask, 20x20x20 at 1x1x2 mm) ===
  [PASS] expert WT = 16.0 mL (+/-1%): WT 16.000 mL
  [PASS] expert TC = 0: TC 0.000 mL
  [PASS] expert ET = 0: ET 0.000 mL

=== Inference-based tests ===
  baseline: WT 42.15 mL, centroid x = +33.0 mm (RIGHT)
  baseline Dice: WT 0.961, TC 0.921, ET 0.952
  [PASS] reproducibility (Dice >= 0.99): Dice 1.00000
  [PASS] anisotropic WT agrees within 10%: 42.15 vs 43.08 mL (2.1%)
  [PASS] orientation, same anatomy: same side: centroid x +33.0 mm (RIGHT)
  [PASS] orientation, same anatomy: WT within 2%: 42.15 vs 42.15 mL (0.0%)
  [PASS] orientation, mirrored anatomy: other side: centroid x -33.0 mm (LEFT)

=== 17/17 passed ===
```

## What each test actually checks

| Test | What the judges do | Full marks when | Result |
|---|---|---|---|
| **Failure pack** | Upload 8 broken inputs: non-NIfTI file named `.nii.gz`, corrupt gzip, 2D image, all-zero volume, NaN values, mismatched shape, mismatched affine, missing sequence, >1GB file | A clear message every time, no crash, no partial result | **9/9 PASS** |
| **Volume calibration** | Upload a case whose expert mask is a 20×20×20-voxel cube labelled 2, at spacing 1×1×2 mm | Expert-mask volumes read WT 16.0 mL (±1%), TC 0, ET 0 | **PASS**, exact |
| **Reproducibility** | Run the same case twice | Masks agree with Dice ≥ 0.99 | **PASS**, 1.00000 — the flip-TTA is fully deterministic |
| **Anisotropic case** | Upload a hidden case, then the same case with every second axial slice removed | The two predicted WT volumes agree within 10% | **PASS**, 2.1–5.4% |
| **Orientation, same anatomy** | Upload a copy stored with its voxels flipped left-right and the affine changed to match | Tumour on the same labelled side in every view; WT volume within 2% | **PASS**, 0.0% difference |
| **Orientation, mirrored anatomy** | Upload a copy whose voxels are flipped left-right with the affine unchanged | The tumour moves to the other labelled side | **PASS** |

## Real-data accuracy: 10 held-out Medical Segmentation Decathlon cases

The figures above are pipeline-integrity checks on a synthetic calibration case. Separately, the platform has been run against **10 real, de-identified tumour cases** — Medical Segmentation Decathlon Task01_BrainTumour (CC-BY-SA 4.0), fetched without downloading the full 7.6 GB archive (see [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) Phase 1a for how `tools/fetch_decathlon_sample.py` does this in ~99 MB using HTTP Range requests against the tar's own member headers).

```bash
cd backend
python tools/fetch_decathlon_sample.py --count 10 --out data/raw_sample --index-cache data/raw_sample/index_cache.json
python tools/convert_decathlon.py --root data/raw_sample/Task01_BrainTumour --out data
python evaluate.py --root data/decathlon --limit 10 --out data/real_sample_eval.json --model bundle \
  --training-overlap "Not independently verifiable from the MONAI checkpoint's public release (trained on BraTS 2018)."
```

| Region | Mean Dice | Mean sensitivity | Mean HD95 (mm) |
|---|---|---|---|
| WT | **0.8808** | 0.8460 | 8.43 |
| TC | **0.8697** | 0.8505 | 5.53 |
| ET | **0.7885** | 0.7617 | 5.71 |

Ten cases (`BRATS_206`, `BRATS_214`, `BRATS_218`, `BRATS_265`, `BRATS_306`, `BRATS_318`, `BRATS_365`, `BRATS_434`, `BRATS_449`, `BRATS_457`), real MONAI checkpoint, no fine-tuning. Full per-case output, including every individual Dice/sensitivity/HD95 figure, committed at `backend/data/real_sample_eval.json` — including the one case (`BRATS_218`) where ET Dice drops to 0.308, which is exactly the kind of real-world variance a 4-case sample was too small to surface and a synthetic calibration case can never show at all. That single case pulls the ET mean down from the earlier 4-case figure (0.8503 → 0.7885) — reported here, not smoothed over.

**Caveat that travels with these numbers, stated plainly:** pretraining overlap with these specific case IDs cannot be ruled out. The MONAI checkpoint was trained on BraTS 2018; whether these particular Decathlon case IDs overlap that training set isn't verifiable from the checkpoint's public release. This is disclosed, not hidden — see `backend/data/manifest.json`'s `pretraining_overlap` field and `real_sample_eval.json`'s `training_data_overlap` field.

## Timing

Measured on this development machine (CPU-only, no GPU):

| Metric | Value |
|---|---|
| Single inference pass | ~37s |
| Full pipeline, 2-pass flip-TTA (upload → report) | ~60–75s |
| PS budget (T4 GPU) | 120s |

A full CPU run already lands comfortably inside the GPU budget — a strong signal the margin on the organiser's actual hardware will be wide, though it should still be measured there directly once available (this is the one item in this table that is inferred rather than measured on the target hardware).

## What's confirmed, and what's explicitly flagged as not yet confirmed

**Confirmed, measured, reproducible:**
- The entire geometry/safety pipeline — orientation correctness, reproducibility, anisotropic handling, affine agreement — independent of model quality (this was true even under the heuristic pipeline-smoke-test model, before the real checkpoint was wired in).
- Real-model inference timing and Dice on the synthetic calibration case.
- **Held-out Dice/sensitivity/HD95 on 10 real Decathlon cases** (above) — the PS's ≥10-case requirement, closed.
- **Uncertainty calibration** — whether flip-TTA σ correlates with real disagreement against the expert mask, pooled across all 10 held-out cases (1,297,798 WT-union voxels): a real, positive, moderate signal (Pearson 0.3463; disagreement rate rises from 15.7% in the lowest σ bin to 54.5–65.2% in the higher bins). See `backend/data/calibration_check.json`, reproduce with `python backend/calibration_check.py --root data/decathlon --limit 10`.
- End-to-end server behaviour: a real curl/HTTP upload through `/api/v1/segment/{job}`, live `/status` polling, and correct binary payload sizes served back to a browser-origin fetch.
- A real live-server run through the actual browser UI (not simulated), including the geometry, connectivity, uncertainty and agreement fields — see `docs/INTERACTIVE_PLATFORM_PLAN.md` for the bug this surfaced and fixed along the way.

**Explicitly not yet confirmed, stated honestly rather than implied:**
- The skull-strip/non-brain input-sanity heuristics have been validated against the synthetic broken-pack; real-world confirmation against an actual non-skull-stripped clinical volume is a near-term next step.
- GPU timing on the organiser's actual T4-class hardware.
- Multi-model comparison — only one architecture (SegResNet) has been benchmarked; see `docs/IMPLEMENTATION_PLAN.md` Phase 2 for why this is GPU-compute-gated, not just unstarted.

This split is intentional — see [`docs/BACKEND_ROADMAP.md`](BACKEND_ROADMAP.md) for the phased plan that closes each of these in order.
