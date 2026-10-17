"""Model loading and inference.

The MONAI `brats_mri_segmentation` bundle takes four channels at 1 mm in the
order T1Gd, T1, T2, FLAIR and returns three sigmoid channels in the order
TC, WT, ET. Both orders are easy to get wrong and silently produce a plausible
but meaningless mask, so they are named explicitly here rather than inferred.

Inference runs as a small flip-based test-time-augmentation (TTA) ensemble,
not a single forward pass: the same volume is segmented once unflipped and
once per additional flip axis, each prediction is unflipped back to the
original orientation, and the per-voxel mean becomes the (slightly more
robust) final probability while the per-voxel standard deviation becomes a
genuine, directly-measured uncertainty signal — not a proxy, not guessed.
Kept small (2 passes by default) specifically to stay inside the PS's
2-minute budget; see docs/BACKEND_ROADMAP.md for the measured timing this
was tuned against.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch

# Channel order the bundle was trained with — NOT alphabetical.
INPUT_ORDER = ("T1Gd", "T1", "T2", "FLAIR")
# Output channel order the bundle emits.
OUTPUT_ORDER = ("TC", "WT", "ET")

# Spatial flip axes tried as TTA passes, cycled through in order; `None` is the
# unflipped pass and always runs first. Indices are into the unbatched (C,X,Y,Z)
# tensor the model's probabilities come back as.
TTA_FLIP_AXES: tuple[int | None, ...] = (None, 1, 2, 3)


@dataclass
class ModelInfo:
    name: str
    version: str
    licence: str
    source: str
    deterministic: bool
    execution_mode: str = "model_inference"
    checkpoint_sha256: str | None = None


@dataclass
class Prediction:
    """One study's segmentation, with uncertainty if more than one TTA pass ran."""

    regions: dict[str, np.ndarray]      # WT/TC/ET boolean, nesting enforced
    probability: dict[str, np.ndarray]  # WT/TC/ET float32 in [0, 1], mean across TTA passes
    uncertainty: dict[str, np.ndarray]  # WT/TC/ET float32 in [0, 1], std across TTA passes
    tta_passes: int


def _nest(wt: np.ndarray, tc: np.ndarray, et: np.ndarray) -> dict[str, np.ndarray]:
    tc = np.logical_or(tc, et)
    wt = np.logical_or(wt, tc)
    return {"WT": wt, "TC": tc, "ET": et}


class Segmenter:
    """Wraps a loaded network plus the provenance needed for the report."""

    def __init__(self, model, info: ModelInfo, roi=(192, 192, 128), overlap=0.5, tta_passes: int = 2):
        self.model = model
        self.info = info
        self.roi = roi
        self.overlap = overlap
        self.tta_passes = max(1, min(tta_passes, len(TTA_FLIP_AXES)))

    @torch.no_grad()
    def _forward(self, x: torch.Tensor) -> torch.Tensor:
        from monai.inferers import sliding_window_inference

        logits = sliding_window_inference(
            inputs=x,
            roi_size=self.roi,
            sw_batch_size=1,
            predictor=self.model,
            overlap=self.overlap,
            mode="gaussian",
        )
        return torch.sigmoid(logits)[0]  # (3, X, Y, Z), TC/WT/ET order

    def predict(self, channels: np.ndarray, threshold: float = 0.5) -> Prediction:
        """channels: (4, X, Y, Z) float32 in INPUT_ORDER."""
        self.model.eval()
        base = torch.from_numpy(channels).unsqueeze(0).float()

        passes: list[torch.Tensor] = []
        for axis in TTA_FLIP_AXES[: self.tta_passes]:
            x = base if axis is None else torch.flip(base, dims=[axis + 1])  # +1: batch dim
            probs = self._forward(x)
            if axis is not None:
                probs = torch.flip(probs, dims=[axis])  # unflip back to original orientation
            passes.append(probs)

        stacked = torch.stack(passes)  # (n, 3, X, Y, Z)
        mean = stacked.mean(dim=0).cpu().numpy()
        std = (stacked.std(dim=0) if len(passes) > 1 else torch.zeros_like(stacked[0])).cpu().numpy()

        prob = {name: mean[i] for i, name in enumerate(OUTPUT_ORDER)}
        unc = {name: std[i] for i, name in enumerate(OUTPUT_ORDER)}
        regions = _nest(
            wt=mean[OUTPUT_ORDER.index("WT")] >= threshold,
            tc=mean[OUTPUT_ORDER.index("TC")] >= threshold,
            et=mean[OUTPUT_ORDER.index("ET")] >= threshold,
        )
        return Prediction(regions=regions, probability=prob, uncertainty=unc, tta_passes=len(passes))

    def __call__(self, channels: np.ndarray, threshold: float = 0.5) -> dict[str, np.ndarray]:
        """Back-compat shim: regions only, single TTA pass regardless of self.tta_passes."""
        return self.predict(channels, threshold).regions


def normalise(volume: np.ndarray) -> np.ndarray:
    """Z-score over the non-zero (in-brain) voxels, as the bundle expects."""
    mask = volume != 0
    if mask.sum() == 0:
        return np.zeros_like(volume, dtype=np.float32)
    values = volume[mask]
    mean, std = float(values.mean()), float(values.std())
    out = np.zeros_like(volume, dtype=np.float32)
    out[mask] = (values - mean) / (std if std > 0 else 1.0)
    return out


def stack_channels(by_sequence: dict[str, np.ndarray]) -> np.ndarray:
    return np.stack([normalise(by_sequence[name]) for name in INPUT_ORDER]).astype(np.float32)


def _bundle_root(bundle_dir: Path) -> Path | None:
    for candidate in (bundle_dir, bundle_dir / "brats_mri_segmentation"):
        if (candidate / "models").is_dir():
            return candidate
    return None


def load_segmenter(bundle_dir: str | Path, tta_passes: int = 2) -> Segmenter:
    """Load the pretrained SegResNet from a downloaded MONAI bundle.

    If a `model-lock.json` (written by `setup_model.py`) sits next to the
    weights, its pinned sha256 is checked before the checkpoint is loaded.
    No lock file means no verification — this keeps `monai.bundle download`
    working standalone, but `setup_model.py` is the verified path.
    """
    from monai.networks.nets import SegResNet

    root = _bundle_root(Path(bundle_dir))
    if root is None:
        raise FileNotFoundError(
            f"No MONAI bundle under {bundle_dir}. Fetch it with:\n"
            f"  python setup_model.py --bundle-dir {bundle_dir}\n"
            f"(or: python -m monai.bundle download --name brats_mri_segmentation "
            f"--bundle_dir {bundle_dir})"
        )

    weights = next(
        (p for p in [root / "models" / "model.pt", root / "models" / "model.ts"] if p.exists()),
        None,
    )
    if weights is None:
        raise FileNotFoundError(f"Bundle at {root} has no models/model.pt.")

    lock_path = weights.parent / "model-lock.json"
    from .provenance import sha256

    actual_hash = sha256(weights)
    if lock_path.exists():
        import json

        lock = json.loads(lock_path.read_text())
        if actual_hash != lock.get("sha256"):
            raise FileNotFoundError(
                f"Checkpoint at {weights} does not match model-lock.json "
                f"(expected {lock.get('sha256')}, got {actual_hash}). Inference refused — "
                "re-run setup_model.py to re-fetch a verified checkpoint."
            )

    if weights.suffix == ".ts":
        model = torch.jit.load(str(weights), map_location="cpu")
    else:
        model = SegResNet(
            spatial_dims=3,
            blocks_down=[1, 2, 2, 4],
            blocks_up=[1, 1, 1],
            init_filters=16,
            in_channels=4,
            out_channels=3,
            dropout_prob=0.2,
        )
        state = torch.load(str(weights), map_location="cpu", weights_only=False)
        if isinstance(state, dict) and "model" in state:
            state = state["model"]
        model.load_state_dict(state)

    version = "unknown"
    meta = root / "configs" / "metadata.json"
    if meta.exists():
        import json

        try:
            version = json.loads(meta.read_text()).get("version", "unknown")
        except Exception:
            pass

    info = ModelInfo(
        name="MONAI brats_mri_segmentation (SegResNet)",
        version=str(version),
        licence="Apache-2.0",
        source="MONAI Model Zoo, trained on BraTS 2018",
        deterministic=True,
        execution_mode="model_inference",
        checkpoint_sha256=actual_hash,
    )
    return Segmenter(model, info, tta_passes=tta_passes)


class HeuristicSegmenter:
    """NOT a segmentation model.

    An intensity rule used only to exercise the pipeline — preprocessing,
    resampling, grid round-trip, writing — when the pretrained bundle is not
    present. Its output is never a clinically or scientifically meaningful mask
    and the report labels it as such.
    """

    info = ModelInfo(
        name="intensity-threshold baseline (NOT a trained model)",
        version="0",
        licence="n/a",
        source="built in; pipeline smoke test only",
        deterministic=True,
        execution_mode="heuristic_fallback",
        checkpoint_sha256=None,
    )

    tta_passes = 1

    def predict(self, channels: np.ndarray, threshold: float = 0.5) -> Prediction:
        from scipy import ndimage

        t1gd, _t1, _t2, flair = channels
        brain = flair != 0

        wt = np.logical_and(flair > np.quantile(flair[brain], 0.88), brain)
        wt = ndimage.binary_closing(wt, iterations=2)
        wt = ndimage.binary_opening(wt, iterations=2)

        # Keep only the largest connected component.
        lab, n = ndimage.label(wt)
        if n > 1:
            sizes = ndimage.sum(wt, lab, range(1, n + 1))
            wt = lab == (int(np.argmax(sizes)) + 1)

        et = np.logical_and(wt, t1gd > np.quantile(t1gd[brain], 0.985))
        tc = ndimage.binary_closing(np.logical_or(et, ndimage.binary_erosion(wt, iterations=3)), iterations=2)
        tc = np.logical_and(np.logical_or(tc, et), wt)
        et = np.logical_and(et, wt)

        regions = _nest(wt=wt, tc=tc, et=et)
        zeros = np.zeros_like(wt, dtype=np.float32)
        probability = {k: v.astype(np.float32) for k, v in regions.items()}
        uncertainty = {"WT": zeros, "TC": zeros, "ET": zeros}
        return Prediction(regions=regions, probability=probability, uncertainty=uncertainty, tta_passes=1)

    def __call__(self, channels: np.ndarray, threshold: float = 0.5) -> dict[str, np.ndarray]:
        return self.predict(channels, threshold).regions
