# Model Card — NeuroScope 3D Segmentation Model

One-page model card, as required by the problem statement's deliverables.

## Model

| Field | Value |
|---|---|
| **Name** | MONAI `brats_mri_segmentation` |
| **Architecture** | SegResNet (3D convolutional encoder-decoder) |
| **Bundle version** | 0.5.4 |
| **Source** | [MONAI Model Zoo](https://huggingface.co/MONAI/brats_mri_segmentation) |
| **Licence** | Apache-2.0 |
| **Training data** | BraTS 2018 |
| **Fine-tuning performed by this project** | None — the pretrained checkpoint is used as-is |
| **Checkpoint integrity** | sha256-verified against a pinned `model-lock.json`, written by `backend/setup_model.py`, checked on every load by `neuroscope.infer.load_segmenter` |

## Input / output contract

| | |
|---|---|
| **Input** | 4 channels at 1mm isotropic resolution, in the order **T1Gd → T1 → T2 → FLAIR** (not alphabetical) |
| **Preprocessing** | Reorient to closest-canonical RAS+; resample to isotropic 1mm; per-channel z-score normalisation over non-zero (in-brain) voxels |
| **Inference** | 128³ sliding window, Gaussian blending, overlap 0.5; flip-based TTA, 2 passes by default |
| **Output** | 3 sigmoid channels (TC, WT, ET), thresholded at 0.5, nesting enforced (ET ⊆ TC ⊆ WT) |
| **Export** | Collapsed to BraTS label codes (1 NCR, 2 ED, 4 ET), written back onto the *original* input grid and affine via nearest-neighbour resampling |

## Performance

| Metric | Value | Context |
|---|---|---|
| Dice — WT / TC / ET (synthetic) | 0.961 / 0.921 / 0.952 | This project's synthetic calibration/test-pack case — a **pipeline-integrity check**, not a clinical accuracy result |
| **Dice — WT / TC / ET (real data, 10 held-out cases)** | **0.8808 / 0.8697 / 0.7885** | **10 real Medical Segmentation Decathlon cases**, no fine-tuning — meets the PS's ≥10 held-out requirement. See [`docs/VERIFICATION.md`](VERIFICATION.md#real-data-accuracy-10-held-out-medical-segmentation-decathlon-cases) |
| Sensitivity — WT / TC / ET (real data) | 0.8460 / 0.8505 / 0.7617 | Same 10 cases |
| HD95 (mm) — WT / TC / ET (real data) | 8.43 / 5.53 / 5.71 | Same 10 cases; 0 undefined (every case had both a predicted and an expert region to compare) |
| Reproducibility | Dice ≥ 0.99 between repeated runs | Measured: 1.00000 (flip-TTA is deterministic, no randomness involved) |
| Inference time | ~37s single pass, ~60–75s with 2-pass TTA | CPU-only, this development machine; PS budget is 120s on a T4 GPU |

**Caveat on the real-data figures:** pretraining overlap with these specific case IDs is not verifiable from the checkpoint's public BraTS-2018 release — disclosed, not assumed clean. One case (`BRATS_218`) scores notably lower on ET (Dice 0.308) than the rest — reported, not excluded, because real-world variance like this is exactly what a 10-case sample is supposed to surface and a 4-case one was too small to reliably show. Reproduce: `backend/data/real_sample_eval.json` has the full per-case breakdown; the command is in `docs/VERIFICATION.md`.

## Uncertainty estimation

A flip-based test-time-augmentation ensemble, not a single forward pass: the volume is segmented once unflipped and once per additional flip axis (2 passes total by default), each prediction is un-flipped back to the original orientation, and:

- the **per-voxel mean** probability across passes becomes the final (slightly more robust) prediction,
- the **per-voxel standard deviation** across passes is reported as the uncertainty signal (σ).

This is a measured disagreement signal, not a calibrated probability of correctness. Published findings show naive uncertainty signals in medical segmentation can correlate only weakly with true boundary error — this caveat is surfaced in the product UI itself, not only here.

**Measured, not just caveated**: pooled across all 10 held-out cases (1,297,798 WT-union voxels), σ shows a real, positive, **moderate** correlation with disagreement against the expert mask (Pearson 0.3463) — disagreement rate rises from 15.7% in the lowest σ bin to 54.5–65.2% in the higher bins. Real evidence that the signal is informative, not proof of a formally calibrated confidence property. Reproduce: `backend/calibration_check.py`; full per-bin and per-case breakdown in `backend/data/calibration_check.json`.

## Known limitations

- Trained on BraTS 2018; the held-out evaluation above uses Medical Segmentation Decathlon cases, and whether any of those 10 case IDs overlap the checkpoint's original BraTS 2018 training set is not independently verifiable from its public release — disclosed per-run in `backend/data/manifest.json` and `real_sample_eval.json`'s `training_data_overlap` field, not assumed clean.
- The 128³ sliding-window inference size is smaller than some published full-resolution configurations, chosen here for a faster, lighter prototype footprint — this trades some potential accuracy for speed and lower memory use.
- Skull-strip and anatomical-plausibility checks upstream of the model are heuristics (foreground fraction, edge-occupancy, field-of-view bounds, centroid/shape checks), not a trained, validated classifier — they can in principle accept an unusual phantom or reject an unusual genuine image.
- No modality-dropout robustness has been measured — all four sequences are currently required; a missing-sequence degraded mode is on the roadmap, not implemented.
- Uncertainty is TTA-based disagreement, not epistemic/aleatoric-decomposed uncertainty from a Bayesian or ensemble-of-models method; it is cheaper and faster, at the cost of a less theoretically grounded confidence interpretation.

## Intended use

Research and teaching only — exploring glioma segmentation on public, de-identified research data, in a classroom, lab, or demonstration setting. **Not intended, validated, or cleared for any clinical, diagnostic, treatment-planning, or patient-facing use.** See the repository [README's Disclaimer section](../README.md#disclaimer) for the full scope statement.

## Provenance, per run

Every run of this pipeline (CLI or live server) records, alongside the result: model name/version/licence, checkpoint sha256, TTA pass count, per-input-file sha256, the code commit hash, a timestamp, and total runtime — so any reported number can be traced back to exactly the code and weights that produced it.
