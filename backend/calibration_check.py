"""Does the flip-TTA uncertainty signal (sigma) actually correlate with real
boundary error? Phase 3c of docs/IMPLEMENTATION_PLAN.md: flagged as unblocked
once real held-out data with expert masks existed (it now does, per
docs/VERIFICATION.md's 10-case evaluation) and needing no GPU. This script
measures it rather than continuing to caveat it abstractly, the same "no claim
without a reproducible run" discipline applied to every other figure in this
project.

What it measures, precisely: for the Whole Tumour (WT) region, every voxel in
the union of (predicted WT) and (expert WT) — i.e. every voxel either side
called tumour, so trivial background-agreement doesn't dilute the signal — is
binned by its per-voxel flip-TTA sigma, pooled across all scored cases. Within
each bin, the "disagreement rate" is the fraction of voxels where the
prediction and the expert mask disagree. If sigma is a meaningful signal,
disagreement rate should rise with sigma.

    python calibration_check.py --root data/decathlon --limit 10 --out data/calibration_check.json

Honest framing, stated once here rather than only in the output: this
correlates sigma with disagreement against ONE expert rater on 10 cases. It is
real evidence, not proof of a general calibration property — the same caveat
that already travels with the 10-case Dice/HD95 figures applies here too.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import nibabel as nib
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from neuroscope import DISCLAIMER
from neuroscope import nifti_io as nio
from neuroscope.infer import load_segmenter, stack_channels
from neuroscope.validate import validate_study

from evaluate import find_case  # reuse the same BraTS-filename matcher, not a second copy

# Fixed bins so results are comparable run to run, matching the bins this project's own
# Trust & Explainability UI already names in its "not yet measured" placeholder text.
SIGMA_BINS = [0.0, 0.10, 0.20, 0.35, 0.50, 1.01]  # 1.01, not 1.0, so sigma==1.0 falls in the last bin
BIN_LABELS = ["0.00-0.10", "0.10-0.20", "0.20-0.35", "0.35-0.50", "0.50-1.00"]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--root", required=True)
    p.add_argument("--limit", type=int, default=10)
    p.add_argument("--out", default="calibration_check.json")
    p.add_argument("--bundle-dir", default=str(HERE / "models"))
    p.add_argument("--spacing", type=float, default=1.0)
    p.add_argument("--tta-passes", type=int, default=2)
    args = p.parse_args()

    root = Path(args.root)
    folders = sorted(d for d in root.iterdir() if d.is_dir())
    if not folders:
        print(f"No case folders under {root}", file=sys.stderr)
        return 1

    segmenter = load_segmenter(args.bundle_dir, tta_passes=args.tta_passes)
    if segmenter.tta_passes < 2:
        print("Need at least 2 TTA passes to produce a non-zero uncertainty signal.", file=sys.stderr)
        return 1

    # Pooled, per-bin accumulators across every scored case.
    bin_voxels = [0] * len(BIN_LABELS)
    bin_disagreements = [0] * len(BIN_LABELS)
    all_sigma: list[np.ndarray] = []
    all_disagree: list[np.ndarray] = []

    case_rows = []
    skipped = []
    for folder in folders[: args.limit]:
        paths, label_path = find_case(folder)
        if len(paths) < 4 or label_path is None:
            skipped.append({"case": folder.name, "reason": "incomplete case folder"})
            continue
        v = validate_study(paths)
        if not v.ok:
            skipped.append({"case": folder.name, "reason": v.errors[0].message})
            continue

        started = time.time()
        canonical = {n: nio.to_canonical(vol.image) for n, vol in v.volumes.items()}
        resampled = {n: nio.resample_to_spacing(img, args.spacing, order=1) for n, img in canonical.items()}
        arrays = {n: np.asanyarray(i.dataobj, dtype=np.float32) for n, i in resampled.items()}

        prediction = segmenter.predict(stack_channels(arrays))

        # Bring the predicted WT mask and its per-voxel sigma back onto the *original*
        # grid, the same way evaluate.py brings the label map back — order=0 (nearest)
        # for the boolean mask, order=1 (linear) for the continuous sigma field.
        grid = v.volumes["T1Gd"].grid
        ref_affine = resampled["T1Gd"].affine
        pred_on_grid = nio.resample_onto(
            nib.Nifti1Image(prediction.regions["WT"].astype(np.uint8), ref_affine), grid, order=0
        )
        sigma_on_grid = nio.resample_onto(
            nib.Nifti1Image(prediction.uncertainty["WT"].astype(np.float32), ref_affine), grid, order=1
        )
        pred_wt = np.asanyarray(pred_on_grid.dataobj).astype(bool)
        sigma = np.asanyarray(sigma_on_grid.dataobj).astype(np.float32)
        truth_wt = (np.asanyarray(nib.load(str(label_path)).dataobj).astype(np.uint8) != 0)

        union = pred_wt | truth_wt
        if not union.any():
            skipped.append({"case": folder.name, "reason": "no WT voxels predicted or labelled"})
            continue

        sigma_u = sigma[union]
        disagree_u = (pred_wt[union] != truth_wt[union])

        case_bin_counts = [0] * len(BIN_LABELS)
        case_bin_disagree = [0] * len(BIN_LABELS)
        for i in range(len(BIN_LABELS)):
            in_bin = (sigma_u >= SIGMA_BINS[i]) & (sigma_u < SIGMA_BINS[i + 1])
            n = int(in_bin.sum())
            d = int(disagree_u[in_bin].sum())
            bin_voxels[i] += n
            bin_disagreements[i] += d
            case_bin_counts[i] = n
            case_bin_disagree[i] = d

        all_sigma.append(sigma_u)
        all_disagree.append(disagree_u.astype(np.float32))

        elapsed = time.time() - started
        case_rows.append({
            "case": folder.name,
            "seconds": round(elapsed, 1),
            "union_voxels": int(union.sum()),
            "overall_disagreement_rate": round(float(disagree_u.mean()), 4),
            "by_bin": {BIN_LABELS[i]: {"voxels": case_bin_counts[i], "disagreements": case_bin_disagree[i]} for i in range(len(BIN_LABELS))},
        })
        print(f"{folder.name}: {union.sum()} WT-union voxels, "
              f"overall disagreement {disagree_u.mean():.1%} ({elapsed:.1f}s)")

    if not case_rows:
        print("No scorable cases.", file=sys.stderr)
        return 1

    pooled_sigma = np.concatenate(all_sigma)
    pooled_disagree = np.concatenate(all_disagree)
    correlation = float(np.corrcoef(pooled_sigma, pooled_disagree)[0, 1]) if len(pooled_sigma) > 1 else None

    summary_by_bin = []
    for i, label in enumerate(BIN_LABELS):
        n = bin_voxels[i]
        rate = round(bin_disagreements[i] / n, 4) if n else None
        summary_by_bin.append({
            "sigma_bin": label,
            "voxel_count": n,
            "disagreement_count": bin_disagreements[i],
            "disagreement_rate": rate,
        })

    report = {
        "disclaimer": DISCLAIMER,
        "question": "Does flip-TTA sigma correlate with real disagreement against an expert WT mask?",
        "method": (
            "For every voxel in (predicted WT) union (expert WT) across all scored cases, bin by "
            "per-voxel flip-TTA sigma and compute the fraction where prediction != expert within "
            "that bin. Pooled Pearson correlation between sigma and the binary disagreement "
            "indicator is also reported."
        ),
        "caveat": (
            "This correlates sigma with disagreement against one expert rater on a 10-case sample. "
            "It is real, measured evidence that the signal is informative, not proof of a general, "
            "formally calibrated confidence property."
        ),
        "model": segmenter.info.__dict__,
        "tta_passes": segmenter.tta_passes,
        "cases_scored": len(case_rows),
        "case_ids": [row["case"] for row in case_rows],
        "skipped": skipped,
        "pooled_voxel_count": int(len(pooled_sigma)),
        "pooled_pearson_correlation_sigma_vs_disagreement": round(correlation, 4) if correlation is not None else None,
        "summary_by_bin": summary_by_bin,
        "per_case": case_rows,
    }
    Path(args.out).write_text(json.dumps(report, indent=2))

    print(f"\n=== pooled over {len(case_rows)} cases, {len(pooled_sigma)} voxels ===")
    for row in summary_by_bin:
        rate_str = f"{row['disagreement_rate']:.1%}" if row["disagreement_rate"] is not None else "n/a"
        print(f"  sigma {row['sigma_bin']}: {row['voxel_count']:>10,} voxels, disagreement {rate_str}")
    print(f"\nPooled Pearson correlation (sigma vs. disagreement): {correlation:.4f}" if correlation is not None else "\nCorrelation: n/a")
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
