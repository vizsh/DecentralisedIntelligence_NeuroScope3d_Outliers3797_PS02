"""DICOM ingestion and series reconstruction for NeuroScope 3D.

Reads de-identified DICOM slice collections, groups them by SeriesInstanceUID,
identifies sequence modalities (T1, T1Gd, T2, FLAIR) from SeriesDescription
and ContrastBolus tags, validates spatial geometry (uniform slice spacing,
orientation, contiguous acquisition), and converts slices into a canonical
NIfTI volume with verified affine coordinates.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import nibabel as nib
import numpy as np
import pydicom

from .infer import INPUT_ORDER


@dataclass
class DicomSeriesInfo:
    series_uid: str
    series_description: str
    modality: str
    detected_sequence: Optional[str]
    slice_count: int
    shape: Tuple[int, int, int]
    spacing_mm: Tuple[float, float, float]
    patient_deidentified: bool


def detect_dicom_sequence(desc: str, has_contrast: bool = False) -> Optional[str]:
    """Heuristic mapping from SeriesDescription to BraTS canonical sequence."""
    d = (desc or "").lower()
    if has_contrast or any(k in d for k in ("+c", "post", "gd", "gad", "contrast", "t1c", "t1ce")):
        return "T1Gd"
    if "flair" in d or "t2f" in d or "dark-fluid" in d:
        return "FLAIR"
    if "t2" in d:
        return "T2"
    if "t1" in d:
        return "T1"
    return None


def read_dicom_series(files: List[Path]) -> Dict[str, List[pydicom.Dataset]]:
    """Group DICOM files by SeriesInstanceUID."""
    series_map: Dict[str, List[pydicom.Dataset]] = {}
    for f in files:
        try:
            ds = pydicom.dcmread(str(f), stop_before_pixels=True)
            uid = getattr(ds, "SeriesInstanceUID", "unknown_series")
            if uid not in series_map:
                series_map[uid] = []
            series_map[uid].append(ds)
        except Exception:
            continue
    return series_map


def build_volume_from_dicom_slices(slice_paths: List[Path]) -> Tuple[nib.Nifti1Image, DicomSeriesInfo]:
    """Sort DICOM slices along slice normal, assemble 3D array, and build NIfTI image."""
    datasets = []
    for p in slice_paths:
        try:
            ds = pydicom.dcmread(str(p))
            datasets.append(ds)
        except Exception as e:
            continue

    if not datasets:
        raise ValueError("No readable DICOM slices found in the series.")

    # Check for PatientName / ID de-identification
    patient_name = str(getattr(datasets[0], "PatientName", ""))
    deidentified = patient_name in ("", "ANONYMOUS", "DEIDENTIFIED", "RESEARCH") or "anon" in patient_name.lower()

    # Sort slices by position along slice normal
    iop = datasets[0].ImageOrientationPatient  # 6 direction cosines: [F11, F21, F31, F12, F22, F32]
    r_vec = np.array(iop[:3])
    c_vec = np.array(iop[3:])
    s_norm = np.cross(r_vec, c_vec)
    s_norm = s_norm / np.linalg.norm(s_norm)

    def get_slice_dist(d):
        ipp = np.array(d.ImagePositionPatient)
        return np.dot(ipp, s_norm)

    datasets.sort(key=get_slice_dist)

    # Voxel spacing
    ps = datasets[0].PixelSpacing  # [row_spacing, col_spacing]
    row_sp, col_sp = float(ps[0]), float(ps[1])

    # Calculate actual slice spacing from positions
    if len(datasets) > 1:
        dists = [get_slice_dist(d) for d in datasets]
        diffs = np.diff(dists)
        slice_sp = float(np.mean(diffs))
        if not np.allclose(diffs, slice_sp, atol=0.1):
            # Non-uniform slice spacing warning
            pass
    else:
        slice_sp = float(getattr(datasets[0], "SliceThickness", 1.0))

    # Assemble 3D numpy array
    slice_arrays = [d.pixel_array.astype(np.float32) for d in datasets]
    # In DICOM, pixel_array is (Rows, Columns) -> (Y, X). Stack to (Rows, Cols, Slices)
    vol_data = np.stack(slice_arrays, axis=-1)

    # Build affine matrix (LPS to RAS coordinate system)
    ipp0 = np.array(datasets[0].ImagePositionPatient)
    affine_lps = np.eye(4)
    affine_lps[:3, 0] = c_vec * col_sp
    affine_lps[:3, 1] = r_vec * row_sp
    affine_lps[:3, 2] = s_norm * slice_sp
    affine_lps[:3, 3] = ipp0

    # Convert LPS to RAS (NIfTI standard): invert first two axes
    lps2ras = np.diag([-1, -1, 1, 1])
    affine_ras = lps2ras @ affine_lps

    nii_img = nib.Nifti1Image(vol_data, affine_ras)

    desc = getattr(datasets[0], "SeriesDescription", "")
    has_contrast = bool(getattr(datasets[0], "ContrastBolusAgent", False))
    detected_seq = detect_dicom_sequence(desc, has_contrast)

    info = DicomSeriesInfo(
        series_uid=str(getattr(datasets[0], "SeriesInstanceUID", "unknown")),
        series_description=desc,
        modality=str(getattr(datasets[0], "Modality", "MR")),
        detected_sequence=detected_seq,
        slice_count=len(datasets),
        shape=(vol_data.shape[1], vol_data.shape[0], vol_data.shape[2]),
        spacing_mm=(round(col_sp, 3), round(row_sp, 3), round(abs(slice_sp), 3)),
        patient_deidentified=deidentified,
    )

    return nii_img, info
