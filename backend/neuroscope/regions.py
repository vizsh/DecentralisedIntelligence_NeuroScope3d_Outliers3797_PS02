"""BraTS label codes, the nested regions built from them, volumes and metrics."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

NCR, ED, ET = 1, 2, 4
REGION_CODES = {"WT": (NCR, ED, ET), "TC": (NCR, ET), "ET": (ET,)}
REGION_ORDER = ("WT", "TC", "ET")


def region_mask(label: np.ndarray, region: str) -> np.ndarray:
    return np.isin(label, REGION_CODES[region])


def regions_to_label(wt: np.ndarray, tc: np.ndarray, et: np.ndarray) -> np.ndarray:
    """Collapse the three nested model outputs back into BraTS codes 0/1/2/4.

    Written outermost first so the inner regions overwrite: anything in WT but
    not TC is oedema, anything in TC but not ET is necrotic core.
    """
    label = np.zeros(wt.shape, dtype=np.uint8)
    label[wt] = ED
    label[tc] = NCR
    label[et] = ET
    return label


def volume_ml(mask: np.ndarray, spacing: tuple[float, float, float]) -> float:
    """voxel count x (dx * dy * dz) / 1000, with 1 mL = 1000 mm^3."""
    return float(mask.sum()) * float(np.prod(spacing)) / 1000.0


@dataclass
class Metric:
    region: str
    dice: float
    sensitivity: float
    precision: float
    intersection: int
    predicted: int
    expert: int

    def as_dict(self) -> dict:
        return {
            "region": self.region,
            "dice": round(self.dice, 4),
            "sensitivity": round(self.sensitivity, 4),
            "precision": round(self.precision, 4),
            "intersection_voxels": self.intersection,
            "predicted_voxels": self.predicted,
            "expert_voxels": self.expert,
        }


def compare(pred: np.ndarray, truth: np.ndarray, region: str) -> Metric:
    p = region_mask(pred, region)
    t = region_mask(truth, region)
    inter = int(np.logical_and(p, t).sum())
    np_, nt = int(p.sum()), int(t.sum())

    # An empty region that was correctly predicted empty scores 1, not 0/0.
    dice = 1.0 if np_ + nt == 0 else (2.0 * inter) / (np_ + nt)
    sens = 1.0 if nt == 0 else inter / nt
    prec = 1.0 if np_ == 0 else inter / np_
    return Metric(region, dice, sens, prec, inter, np_, nt)


def score_all(pred: np.ndarray, truth: np.ndarray) -> dict[str, Metric]:
    return {r: compare(pred, truth, r) for r in REGION_ORDER}


@dataclass
class Connectivity:
    """Answers the PS story's own opening question: "is it one mass or two?"."""

    component_count: int
    component_volumes_ml: list[float]  # largest first
    largest_fraction: float  # largest component's share of the region's total voxels

    def as_dict(self) -> dict:
        return {
            "component_count": self.component_count,
            "component_volumes_ml": [round(v, 4) for v in self.component_volumes_ml],
            "largest_fraction": round(self.largest_fraction, 4),
        }


def connectivity(mask: np.ndarray, spacing: tuple[float, float, float]) -> Connectivity:
    """26-connected component analysis (diagonal touches count, since anisotropic
    voxels can make a visually-connected mass look split under 6-connectivity alone)."""
    structure = np.ones((3, 3, 3), dtype=int)
    labelled, n = ndimage.label(mask, structure=structure)
    if n == 0:
        return Connectivity(0, [], 0.0)
    voxel_counts = sorted((int(s) for s in ndimage.sum(mask, labelled, range(1, n + 1))), reverse=True)
    total = sum(voxel_counts)
    voxel_mm3 = float(np.prod(spacing))
    volumes_ml = [count * voxel_mm3 / 1000.0 for count in voxel_counts]
    return Connectivity(n, volumes_ml, (voxel_counts[0] / total) if total else 0.0)


def connectivity_all(label: np.ndarray, spacing: tuple[float, float, float]) -> dict[str, dict]:
    return {r: connectivity(region_mask(label, r), spacing).as_dict() for r in REGION_ORDER}


def volumes_all(label: np.ndarray, spacing: tuple[float, float, float]) -> dict[str, dict]:
    out = {}
    for r in REGION_ORDER:
        mask = region_mask(label, r)
        voxels = int(mask.sum())
        out[r] = {
            "voxels": voxels,
            "volume_ml": round(volume_ml(mask, spacing), 4),
            "formula": f"{voxels} x ({spacing[0]:g} x {spacing[1]:g} x {spacing[2]:g}) / 1000",
        }
    return out


@dataclass
class Geometry:
    """Shape measurements volume alone can't express.

    Each number names its own definition, because "diameter" and "surface
    area" each have several defensible ones and the gap between them is far
    wider than the measurement error — a reader who doesn't know which one
    produced a number can't compare it to anything.
    """

    max_diameter_mm: float
    # The two voxel centres that realise that diameter, in mm, so the
    # measurement can be drawn and checked rather than taken on trust.
    diameter_from_mm: tuple[float, float, float]
    diameter_to_mm: tuple[float, float, float]
    surface_area_mm2: float
    centroid_voxel: tuple[float, float, float]
    bbox_mm: tuple[float, float, float]

    def as_dict(self) -> dict:
        return {
            "max_diameter_mm": round(self.max_diameter_mm, 3),
            "max_diameter_definition":
                "longest straight line between any two voxel centres in the region "
                "(exact: computed over the convex hull, which contains the extreme points)",
            "diameter_from_mm": [round(v, 2) for v in self.diameter_from_mm],
            "diameter_to_mm": [round(v, 2) for v in self.diameter_to_mm],
            "surface_area_mm2": round(self.surface_area_mm2, 2),
            "surface_area_definition":
                "total area of voxel faces on the region boundary (staircase surface; "
                "overestimates a smoothed surface, and is not the mesh area the 3D view renders)",
            "centroid_voxel": [round(v, 2) for v in self.centroid_voxel],
            "bbox_mm": [round(v, 2) for v in self.bbox_mm],
        }


def _max_diameter(points_mm: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    """Exact longest pairwise distance, via the convex hull.

    The diameter of a point set equals the diameter of its convex hull, so
    hulling first turns an O(n^2) scan over every voxel into one over a few
    hundred hull vertices — exact, not an approximation.
    """
    if len(points_mm) < 2:
        zero = np.zeros(3)
        return 0.0, zero, zero
    try:
        from scipy.spatial import ConvexHull

        hull = ConvexHull(points_mm)
        candidates = points_mm[hull.vertices]
    except Exception:
        # Degenerate (coplanar/collinear) regions have no 3D hull; those are
        # small enough to scan directly.
        candidates = points_mm

    diff = candidates[:, None, :] - candidates[None, :, :]
    d2 = (diff ** 2).sum(axis=2)
    i, j = np.unravel_index(int(np.argmax(d2)), d2.shape)
    return float(np.sqrt(d2[i, j])), candidates[i], candidates[j]


def _surface_area_mm2(mask: np.ndarray, spacing: tuple[float, float, float]) -> float:
    """Area of every voxel face where the region meets non-region.

    Counted per axis, since an anisotropic voxel's three face pairs have
    three different areas.
    """
    total = 0.0
    for axis in range(3):
        face_area = float(np.prod([spacing[a] for a in range(3) if a != axis]))
        padded = np.pad(mask, [(1, 1) if a == axis else (0, 0) for a in range(3)], constant_values=False)
        lo = np.take(padded, range(0, mask.shape[axis] + 1), axis=axis)
        hi = np.take(padded, range(1, mask.shape[axis] + 2), axis=axis)
        total += float(np.logical_xor(lo, hi).sum()) * face_area
    return total


def geometry(mask: np.ndarray, spacing: tuple[float, float, float]) -> Geometry:
    """Diameter, surface area, centroid and bounding box for one region."""
    if not mask.any():
        zero = (0.0, 0.0, 0.0)
        return Geometry(0.0, zero, zero, 0.0, zero, zero)

    scale = np.asarray(spacing, dtype=float)
    # The hull only needs the boundary; interior voxels can't be extreme points.
    boundary = np.logical_xor(mask, ndimage.binary_erosion(mask))
    coords = np.argwhere(boundary if boundary.any() else mask).astype(float)
    points_mm = coords * scale

    diameter, a, b = _max_diameter(points_mm)
    centroid = np.argwhere(mask).astype(float).mean(axis=0)
    extent = (np.argwhere(mask).max(axis=0) - np.argwhere(mask).min(axis=0) + 1) * scale

    return Geometry(
        max_diameter_mm=diameter,
        diameter_from_mm=tuple(float(v) for v in a),
        diameter_to_mm=tuple(float(v) for v in b),
        surface_area_mm2=_surface_area_mm2(mask, spacing),
        centroid_voxel=tuple(float(v) for v in centroid),
        bbox_mm=tuple(float(v) for v in extent),
    )


def geometry_all(label: np.ndarray, spacing: tuple[float, float, float]) -> dict[str, dict]:
    return {r: geometry(region_mask(label, r), spacing).as_dict() for r in REGION_ORDER}


@dataclass
class Agreement:
    """Where a prediction and an expert mask disagree, not just by how much.

    Dice collapses a spatial disagreement into one number; this keeps the
    three populations separate so the UI can colour and locate them.
    """

    true_positive: int
    false_positive: int
    false_negative: int
    # Voxel index of the largest false-negative blob's centre — "the biggest
    # thing the model missed", somewhere to actually navigate to.
    largest_miss_voxel: tuple[int, int, int] | None
    largest_miss_volume_ml: float

    def as_dict(self) -> dict:
        return {
            "true_positive": self.true_positive,
            "false_positive": self.false_positive,
            "false_negative": self.false_negative,
            "largest_miss_voxel": list(self.largest_miss_voxel) if self.largest_miss_voxel else None,
            "largest_miss_volume_ml": round(self.largest_miss_volume_ml, 4),
        }


def agreement(pred: np.ndarray, truth: np.ndarray, region: str,
              spacing: tuple[float, float, float]) -> Agreement:
    p = region_mask(pred, region)
    t = region_mask(truth, region)
    tp = np.logical_and(p, t)
    fp = np.logical_and(p, np.logical_not(t))
    fn = np.logical_and(np.logical_not(p), t)

    miss_voxel: tuple[int, int, int] | None = None
    miss_ml = 0.0
    if fn.any():
        labelled, n = ndimage.label(fn, structure=np.ones((3, 3, 3), dtype=int))
        sizes = ndimage.sum(fn, labelled, range(1, n + 1))
        biggest = int(np.argmax(sizes)) + 1
        centre = ndimage.center_of_mass(fn, labelled, biggest)
        miss_voxel = tuple(int(round(c)) for c in centre)
        miss_ml = float(sizes[biggest - 1]) * float(np.prod(spacing)) / 1000.0

    return Agreement(int(tp.sum()), int(fp.sum()), int(fn.sum()), miss_voxel, miss_ml)


def agreement_all(pred: np.ndarray, truth: np.ndarray,
                  spacing: tuple[float, float, float]) -> dict[str, dict]:
    return {r: agreement(pred, truth, r, spacing).as_dict() for r in REGION_ORDER}


@dataclass
class Distance:
    """95th-percentile Hausdorff distance (HD95) between predicted and expert boundaries.

    Dice and sensitivity are both volume-overlap metrics — a thin sliver of
    disagreement at a tumour's edge barely moves either of them. HD95
    measures the disagreement the other way: by distance, in mm, which is
    what actually matters for "how far off is this boundary" and is the
    metric the PS names explicitly as extra credit.
    """

    hd95_mm: float | None  # None, not 0 or inf, when either mask is empty — see definition.

    def as_dict(self) -> dict:
        return {
            "hd95_mm": round(self.hd95_mm, 3) if self.hd95_mm is not None else None,
            "hd95_definition":
                "95th percentile of the symmetric boundary-to-boundary distance: every "
                "predicted-boundary voxel's distance to the nearest expert-boundary voxel, "
                "and every expert-boundary voxel's distance to the nearest predicted-boundary "
                "voxel, combined, via a spacing-aware Euclidean distance transform. Using the "
                "95th percentile rather than the maximum (the plain Hausdorff distance) keeps "
                "one stray outlier voxel from dominating the number. Null, not zero or infinite, "
                "when either region is empty — a boundary distance against nothing is undefined, "
                "not a perfect or worst-case score.",
        }


def hd95(pred: np.ndarray, truth: np.ndarray, region: str,
         spacing: tuple[float, float, float]) -> Distance:
    p = region_mask(pred, region)
    t = region_mask(truth, region)
    if not p.any() or not t.any():
        return Distance(None)

    p_boundary = np.logical_xor(p, ndimage.binary_erosion(p))
    t_boundary = np.logical_xor(t, ndimage.binary_erosion(t))
    if not p_boundary.any() or not t_boundary.any():
        # A region with no interior (every voxel is already its own boundary) —
        # treat the whole region as its boundary rather than reporting undefined.
        p_boundary = p_boundary if p_boundary.any() else p
        t_boundary = t_boundary if t_boundary.any() else t

    # Distance from every voxel to the nearest boundary voxel of the *other* mask,
    # sampled in physical mm so anisotropic spacing doesn't distort the result.
    dist_to_truth = ndimage.distance_transform_edt(~t_boundary, sampling=spacing)
    dist_to_pred = ndimage.distance_transform_edt(~p_boundary, sampling=spacing)

    pred_to_truth = dist_to_truth[p_boundary]
    truth_to_pred = dist_to_pred[t_boundary]
    symmetric = np.concatenate([pred_to_truth, truth_to_pred])
    return Distance(float(np.percentile(symmetric, 95)))


def hd95_all(pred: np.ndarray, truth: np.ndarray,
             spacing: tuple[float, float, float]) -> dict[str, dict]:
    return {r: hd95(pred, truth, r, spacing).as_dict() for r in REGION_ORDER}
