# Implementation Plan — Real Data, Multi-Model Benchmarking, Iron-Clad Backend

This is the actionable, phased plan for the next stage of work: moving from "one verified model, synthetic calibration data" to "multiple candidate models benchmarked against real held-out data, with a documented, defensible choice of which one ships." It assumes the reader has no prior context — see [`CLAUDE.md`](../CLAUDE.md) at the repo root for how this fits the bigger picture, and [`docs/BACKEND_ROADMAP.md`](BACKEND_ROADMAP.md) for the hardening work this plan builds on top of.

**Guiding rule for everything below: no claim ships without a reproducible run behind it.** If a number can't be regenerated from a committed script against named data, it doesn't go in a report, a doc, or a demo.

---

## 0. Where this plan starts from (verified facts, not assumptions)

- One real, checkpoint-verified model is live: MONAI `brats_mri_segmentation` (SegResNet, BraTS-2018, Apache-2.0). 17/17 judge pipeline tests pass with it.
- The synthetic calibration Dice (0.96/0.92/0.95) is still a pipeline-integrity check, not a clinical accuracy measurement — but it's no longer the only number available: 10 real, held-out Medical Segmentation Decathlon cases are now scored (WT 0.8808 / TC 0.8697 / ET 0.7885 Dice, plus sensitivity and HD95). See Phase 1a/3b below and `docs/VERIFICATION.md`.
- This development environment is **CPU-only, no GPU**. That constrains what's realistically achievable here directly vs. what needs a separate GPU environment (cloud, or the organiser's T4) — this still blocks Phase 2's Tier 2 (training/fine-tuning additional architectures).

## 1. Research findings that shape this plan (checked before writing it, not assumed)

A quick check before planning the multi-model phase turned up something important enough to state plainly: **genuinely comparable, publicly-released, BraTS-pretrained checkpoints barely exist outside the MONAI SegResNet bundle already in use.**

| Architecture | Public BraTS-pretrained weights? | What's actually available |
|---|---|---|
| **SegResNet** (MONAI) | **Yes** — already in use | `brats_mri_segmentation` bundle, Apache-2.0 |
| **nnU-Net** | **No** official release found | Winning BraTS-2020 paper (Isensee et al.) and training code exist; no official pretrained checkpoint. A community Hugging Face checkpoint exists but for *brain metastases*, a different task/label set — not usable as-is. |
| **Swin UNETR** | **No**, despite the name | MONAI's only published Swin UNETR bundle is trained on BTCV (abdominal **CT**), not BraTS, despite the architecture's own paper being about brain tumour MRI. |
| **MedNeXt** | Not confirmed available | Not checked in detail yet — treat as unverified until someone looks. |

**Implication: a real multi-model comparison cannot be "download three more checkpoints and run them."** It requires either (a) training/fine-tuning additional architectures ourselves on real data, which needs GPU compute this environment doesn't have, or (b) being explicit that the near-term comparison is narrower than "five SOTA architectures head to head" — and scoping Phase 2 accordingly rather than overpromising. Both paths are in this plan; which one runs first depends on whether GPU compute becomes available (cloud credits, a teammate's machine, the organiser's hardware).

## 2. Phase-by-phase plan

### Phase 1 — Real data acquisition (blocks everything else; start here)

**1a. Medical Segmentation Decathlon, Task01_BrainTumour — the near-term real dataset — done.**
No registration gate, CC-BY-SA 4.0, directly downloadable (MONAI-hosted tar, or via `monai.apps.DecathlonDataset(download=True)`). 750 4D volumes, 484 with labels.

Closed, all three pieces:
- `backend/tools/convert_decathlon.py` splits each 4D NIfTI into four separate per-modality files matching this pipeline's expected input, and remaps Decathlon's label codes to BraTS codes (1 NCR, 2 ED, 4 ET).
- A patient-level train/held-out split is logged to `backend/data/decathlon_split.json` (8 train / 2 held-out within the fetched 10-case sample) — read from this file, never re-derived informally.
- `backend/data/manifest.json` records dataset name, licence, case count and split.

10 cases are now fetched and converted (`tools/fetch_decathlon_sample.py`, Range-request trick — see Section 0), closing the PS's ≥10 held-out requirement; see Phase 3b below and `docs/VERIFICATION.md`.

**1b. BraTS 2021 (the PS's own named dataset) — pursue in parallel, human-gated.**
Access requires registration (TCIA or Synapse) and accepting a data use agreement — **this step needs a human to do it**, not something to script. Flag it, don't block on it: once obtained, BraTS 2021 supersedes the Decathlon-derived held-out set as the authoritative one, since it's what the PS actually names and what the organiser's own baseline will be measured on.

**1c. Explicit train/eval separation, enforced in code, not just documented.**
`evaluate.py` should refuse to run — loudly — if any held-out case ID appears in a list of IDs the model's pretraining might have touched (BraTS 2018, for the current checkpoint). Since the current model's exact 2018 training case list isn't available to us, the honest move is to disclose "pretraining overlap with evaluation cases is not independently verifiable from this checkpoint's public release" rather than claim a clean split that can't be proven — state the limitation, don't paper over it.

### Phase 2 — Multi-model benchmarking harness

**2a. Formalize the model adapter interface.** `Segmenter.predict()` already exists for SegResNet and `HeuristicSegmenter`; promote this to an explicit `Protocol`/ABC in `backend/neuroscope/model_base.py` so any new adapter has one contract to satisfy: `predict(channels, threshold) -> Prediction` (regions, probability, uncertainty, tta_passes).

**2b. What actually gets benchmarked, realistically scoped:**

| Tier | Candidates | Requires |
|---|---|---|
| **Tier 1 — ready now** | SegResNet (current), HeuristicSegmenter (baseline floor) | Nothing new — wire both into the same harness for a baseline comparison table |
| **Tier 2 — needs training/fine-tuning on real data + GPU** | A plain 3D U-Net (fast to train, a meaningful speed/accuracy baseline), nnU-Net (self-configuring; realistic if its automated pipeline is run end-to-end on a GPU box), MedNeXt (pending the availability check Section 1 flagged as unverified) | A GPU environment (cloud instance, Colab Pro, a teammate's machine) and the Decathlon training split from Phase 1a |

Do not start Tier 2 until Phase 1a's data and split exist — training on an undocumented, unsplit dataset produces numbers nobody can trust or reproduce.

**2c. `backend/benchmark_models.py`.** Runs every registered, available adapter against the *same* held-out set from Phase 1, records per model: Dice (WT/TC/ET), sensitivity, HD95 (`neuroscope.regions.hd95_all`, done — Phase 3a), inference time, peak memory, licence, and writes results to `backend/benchmark_results.json`.

**2d. `docs/MODEL_BENCHMARK.md`.** The comparison table plus a written decision: which model becomes the default, and why — accuracy, speed (against the 2-minute budget), licence, and maintenance burden are all legitimate factors, and the reasoning should be visible, not just the winner.

**2e. Ensembling, once ≥2 real models exist.** Average top-2 models' probabilities before thresholding; benchmark whether the ensemble beats either alone. Cheap to try once the harness exists, not worth building before it does.

### Phase 3 — Missing accuracy features

**3a. HD95** (95th-percentile Hausdorff distance) — **done.** `neuroscope.regions.hd95()`/`hd95_all()`, a spacing-aware boundary-to-boundary distance via Euclidean distance transform, explicitly `null` (not 0 or inf) when either mask is empty. Wired into `predict.py`'s CLI report, `server/main.py`'s live metadata, and `evaluate.py`'s real-data accuracy run. Four tests with hand-computable answers, including an anisotropic-spacing check. See `docs/VERIFICATION.md` for current measured figures.

**3b. Real `evaluate.py` run — done.** 10 held-out Decathlon cases scored (`backend/data/real_sample_eval.json`), patient-split disclosed via `decathlon_split.json`: WT Dice 0.8808 / TC 0.8697 / ET 0.7885, with HD95 and sensitivity alongside. Closes the PS's ≥10-case mandatory requirement. `docs/VERIFICATION.md` and `docs/MODEL_CARD.md` carry the actual numbers in place of the old "not yet measured" caveat; the pretraining-overlap caveat itself stays, since it's a real, unresolved limitation of the checkpoint's public release, not a placeholder.

**3c. Uncertainty-calibration check — done.** `backend/calibration_check.py` measures whether flip-TTA σ actually correlates with real disagreement against the expert WT mask, pooled across all 10 real held-out cases (1,297,798 WT-union voxels). It does: disagreement rate rises from 15.7% in the lowest σ bin (0.00–0.10) to 54.5% (0.10–0.20) and 65.1–65.2% (0.20–0.50), pooled Pearson correlation 0.3463 — a real, positive, moderate signal, not proof of a formally calibrated probability. Full per-case and per-bin breakdown: `backend/data/calibration_check.json`. Reproduce: `cd backend && python calibration_check.py --root data/decathlon --limit 10 --out data/calibration_check.json`. This directly answers the caveat already flagged in `docs/ARCHITECTURE.md` ("naive uncertainty signals can correlate only weakly with true error") with a measured number instead of an abstract hedge — and the number itself confirms the caveat was the right one to make: the correlation is real but moderate, exactly the "informative but not a guarantee" framing the UI already uses everywhere σ appears.

### Phase 4 — Iron-clad backend hardening (independent of Phases 1–3, can run in parallel)

Carried over from `docs/BACKEND_ROADMAP.md`'s still-open Phase 2 items:
- Structured logging + request IDs (job start/validate/infer/write/done, with timings).
- Config via one settings object instead of scattered `os.environ.get` calls.
- A real `pytest` suite for `validate.py`/`regions.py`'s pure functions, so a future threshold or formula change is caught by CI, not only by the slower end-to-end judge pack.
- GPU code path tested once GPU compute is available — confirm CUDA inference, document VRAM requirements per model in the benchmark table.
- Concurrency feedback — a queue-position message for a second uploader while one study is processing, rather than a bare "busy" rejection.

### Phase 5 — Product integration

- A model-switcher in the UI (dev/admin mode) to compare two models side by side on the same uploaded case — directly demo-able once Phase 2 produces ≥2 real candidates.
- Surface HD95 and a "benchmark champion" badge in the live report once Phase 2/3 land.
- Update `docs/MODEL_CARD.md` with the chosen champion model's real Dice/HD95/sensitivity once Phase 3b produces them, replacing today's synthetic-calibration figures.

## 3. Sequencing

```
Phase 1 (data) ──┬──> Phase 2 (multi-model) ──> Phase 5 (product integration)
                 └──> Phase 3 (HD95, real eval, calibration check)
Phase 4 (hardening) ── runs independently, any time
```

Phase 1 is the hard dependency everything else sits on. Tier 1 of Phase 2 (SegResNet vs. the heuristic baseline) can start immediately without Phase 1, as a harness smoke test — but it will only ever produce a 2-entry table until real data exists.

## 4. Immediate next actions (what to actually start on)

1. ~~`backend/tools/convert_decathlon.py`~~ — **done.** 10 cases fetched, converted, split, and manifested.
2. ~~`backend/neuroscope/model_base.py`~~ — **done.** Formal adapter `Protocol`, `backend/neuroscope/model_base.py`.
3. ~~Real `evaluate.py` run (Phase 3b) / HD95 (Phase 3a)~~ — **done.** Both landed; see `docs/VERIFICATION.md`.
4. **Decide on a GPU environment** for Phase 2 Tier 2 (multi-model training/fine-tuning) — this is a decision only the user can make (cloud budget, a teammate's machine, waiting for organiser hardware) and remains the actual blocker on Phase 2.
5. **Start the BraTS 2021 registration** (Phase 1b) now, in parallel, if not already underway — it's slow (account approval, DUA) and should not be the thing blocking the rest of this plan at the last minute.
6. ~~Uncertainty-calibration check (Phase 3c)~~ — **done.** Pooled Pearson correlation 0.3463 between σ and real disagreement across the 10 held-out cases; see Phase 3c above and `backend/data/calibration_check.json`.

## 5. Beyond the user's original ask — further ideation

A few things worth building once the above lands, flagged here so they're not lost:

- **A committed, auto-regenerated leaderboard** (`docs/MODEL_BENCHMARK.md` generated by `benchmark_models.py --write-docs` rather than hand-edited) — keeps the comparison table honest as models change.
- **Active-learning signal**: log which live-uploaded cases scored high mean uncertainty, as a prioritised worklist for future expert review and eventual fine-tuning data — turns real usage into a growing, consented evaluation set over time.
- **A data-versioning manifest** (even a simple committed JSON, not necessarily DVC) so "the held-out set" is a pinned, reproducible artefact, not whatever happens to be on someone's disk.
- **Telemetry on validation rejections** (which check fires most often, on what kind of input) — a cheap, real product-quality signal once there's live usage to observe.
- **CI integration**: run the pytest suite (Phase 4) and the judge pack (`run_judge_tests.py --model heuristic`, since the real model is too slow/heavy for every commit) on every push, so a regression is caught before it reaches a demo.
