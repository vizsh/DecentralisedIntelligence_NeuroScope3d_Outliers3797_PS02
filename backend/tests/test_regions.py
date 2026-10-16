"""Pure-function tests for neuroscope.regions — the formulas behind every
volume, Dice, sensitivity and connectivity number this platform reports.
Catches a threshold or formula regression here, fast, instead of only via
the slower end-to-end judge pack.
"""

from __future__ import annotations

import numpy as np
import pytest

from neuroscope.regions import (
    ED,
    ET,
    NCR,
    agreement,
    compare,
    connectivity,
    geometry,
    hd95,
    region_mask,
    regions_to_label,
    volume_ml,
    volumes_all,
)


def test_region_mask_and_label_round_trip():
    label = np.zeros((4, 4, 4), dtype=np.uint8)
    label[0, 0, 0] = NCR
    label[1, 1, 1] = ED
    label[2, 2, 2] = ET

    wt, tc, et = (region_mask(label, r) for r in ("WT", "TC", "ET"))
    assert wt.sum() == 3           # NCR + ED + ET
    assert tc.sum() == 2           # NCR + ET
    assert et.sum() == 1           # ET only

    rebuilt = regions_to_label(wt, tc, et)
    assert np.array_equal(rebuilt, label)


def test_volume_ml_matches_the_judges_calibration_case():
    # 20x20x20 voxels at 1x1x2 mm -> 16.0 mL, exactly what docs/VERIFICATION.md reports.
    mask = np.ones((20, 20, 20), dtype=bool)
    assert volume_ml(mask, (1.0, 1.0, 2.0)) == pytest.approx(16.0)


def test_compare_perfect_match_scores_one():
    label = np.zeros((5, 5, 5), dtype=np.uint8)
    label[0, 0, 0] = ET
    m = compare(label, label, "ET")
    assert m.dice == pytest.approx(1.0)
    assert m.sensitivity == pytest.approx(1.0)
    assert m.precision == pytest.approx(1.0)


def test_compare_empty_region_scores_one_not_zero_over_zero():
    label = np.zeros((5, 5, 5), dtype=np.uint8)
    m = compare(label, label, "ET")
    assert m.dice == 1.0
    assert m.sensitivity == 1.0
    assert m.precision == 1.0


def test_compare_no_overlap_scores_zero():
    pred = np.zeros((5, 5, 5), dtype=np.uint8)
    pred[0, 0, 0] = ET
    truth = np.zeros((5, 5, 5), dtype=np.uint8)
    truth[4, 4, 4] = ET
    m = compare(pred, truth, "ET")
    assert m.dice == 0.0
    assert m.sensitivity == 0.0
    assert m.precision == 0.0


def test_connectivity_single_component():
    mask = np.zeros((10, 10, 10), dtype=bool)
    mask[2:5, 2:5, 2:5] = True
    c = connectivity(mask, (1.0, 1.0, 1.0))
    assert c.component_count == 1
    assert c.largest_fraction == pytest.approx(1.0)


def test_connectivity_two_equal_disconnected_components():
    # Answers the PS's own opening question: "is it one mass or two?"
    mask = np.zeros((10, 10, 10), dtype=bool)
    mask[0:2, 0:2, 0:2] = True
    mask[8:10, 8:10, 8:10] = True
    c = connectivity(mask, (1.0, 1.0, 1.0))
    assert c.component_count == 2
    assert c.largest_fraction == pytest.approx(0.5)


def test_connectivity_empty_mask():
    mask = np.zeros((5, 5, 5), dtype=bool)
    c = connectivity(mask, (1.0, 1.0, 1.0))
    assert c.component_count == 0
    assert c.component_volumes_ml == []
    assert c.largest_fraction == 0.0


def test_geometry_of_a_cube_matches_hand_computed_values():
    # A 10-voxel cube at 1 mm: body diagonal between voxel *centres* spans 9 mm
    # per axis, and six 10x10 faces give 600 mm^2.
    mask = np.zeros((20, 20, 20), dtype=bool)
    mask[5:15, 5:15, 5:15] = True
    g = geometry(mask, (1.0, 1.0, 1.0))

    assert g.max_diameter_mm == pytest.approx(np.sqrt(3) * 9, rel=1e-6)
    assert g.surface_area_mm2 == pytest.approx(600.0)
    assert g.centroid_voxel == pytest.approx((9.5, 9.5, 9.5))
    assert g.bbox_mm == pytest.approx((10.0, 10.0, 10.0))


def test_geometry_surface_area_accounts_for_anisotropic_spacing():
    mask = np.zeros((20, 20, 20), dtype=bool)
    mask[5:15, 5:15, 5:15] = True
    # At 1x1x2 mm the two z-facing face pairs stay 1x1 mm while the four
    # side faces become 1x2 mm: 2*100*1 + 4*100*2 = 1000.
    assert geometry(mask, (1.0, 1.0, 2.0)).surface_area_mm2 == pytest.approx(1000.0)


def test_geometry_of_empty_region_is_all_zero():
    g = geometry(np.zeros((5, 5, 5), dtype=bool), (1.0, 1.0, 1.0))
    assert g.max_diameter_mm == 0.0
    assert g.surface_area_mm2 == 0.0


def test_agreement_splits_overlap_into_tp_fp_fn():
    pred = np.zeros((10, 10, 10), dtype=np.uint8)
    pred[2:6, 2:6, 2:6] = ET          # 64 voxels
    truth = np.zeros((10, 10, 10), dtype=np.uint8)
    truth[3:7, 3:7, 3:7] = ET         # 64 voxels, overlapping in a 3x3x3 corner
    a = agreement(pred, truth, "ET", (1.0, 1.0, 1.0))

    assert a.true_positive == 27
    assert a.false_positive == 64 - 27
    assert a.false_negative == 64 - 27
    assert a.largest_miss_voxel is not None


def test_agreement_with_no_expert_voxels_reports_no_miss():
    pred = np.zeros((6, 6, 6), dtype=np.uint8)
    pred[1:3, 1:3, 1:3] = ET
    truth = np.zeros((6, 6, 6), dtype=np.uint8)
    a = agreement(pred, truth, "ET", (1.0, 1.0, 1.0))

    assert a.false_negative == 0
    assert a.largest_miss_voxel is None
    assert a.largest_miss_volume_ml == 0.0


def test_hd95_identical_masks_is_zero():
    label = np.zeros((10, 10, 10), dtype=np.uint8)
    label[2:6, 2:6, 2:6] = ET
    d = hd95(label, label, "ET", (1.0, 1.0, 1.0))
    assert d.hd95_mm == pytest.approx(0.0)


def test_hd95_undefined_when_either_mask_empty():
    pred = np.zeros((6, 6, 6), dtype=np.uint8)
    pred[1:3, 1:3, 1:3] = ET
    truth = np.zeros((6, 6, 6), dtype=np.uint8)  # no ET voxels at all
    d = hd95(pred, truth, "ET", (1.0, 1.0, 1.0))
    assert d.hd95_mm is None  # undefined, not 0 (perfect) or inf (worst-case)

    d_both_empty = hd95(truth, truth, "ET", (1.0, 1.0, 1.0))
    assert d_both_empty.hd95_mm is None


def test_hd95_single_voxel_pair_matches_hand_computed_distance():
    # Two lone voxels 5mm apart on one axis: a single-voxel mask's boundary is
    # the whole mask (erosion removes it entirely), so HD95 collapses to the
    # exact point-to-point distance -- the simplest possible hand-checkable case.
    pred = np.zeros((10, 10, 10), dtype=np.uint8)
    pred[0, 0, 0] = ET
    truth = np.zeros((10, 10, 10), dtype=np.uint8)
    truth[5, 0, 0] = ET
    d = hd95(pred, truth, "ET", (1.0, 1.0, 1.0))
    assert d.hd95_mm == pytest.approx(5.0)


def test_hd95_respects_anisotropic_spacing():
    # Same voxel offset as above (1 voxel along x), but x-spacing is 2mm --
    # the physical distance must scale with spacing, not voxel count.
    pred = np.zeros((4, 4, 4), dtype=np.uint8)
    pred[0, 0, 0] = ET
    truth = np.zeros((4, 4, 4), dtype=np.uint8)
    truth[1, 0, 0] = ET
    d = hd95(pred, truth, "ET", (2.0, 1.0, 1.0))
    assert d.hd95_mm == pytest.approx(2.0)


def test_volumes_all_reports_formula_inline():
    label = np.zeros((2, 2, 2), dtype=np.uint8)
    label[0, 0, 0] = ET
    out = volumes_all(label, (1.0, 1.0, 1.0))
    assert out["ET"]["voxels"] == 1
    assert "x" in out["ET"]["formula"]
    assert out["ET"]["volume_ml"] == pytest.approx(0.001)
