from __future__ import annotations

import io
from pathlib import Path
import nibabel as nib
import numpy as np
import pytest
from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def _make_nifti_file(tmp_path: Path, name: str, shape=(16, 16, 16), spacing=(1.0, 1.0, 1.0)) -> Path:
    data = np.zeros(shape, dtype=np.float32)
    data[4:12, 4:12, 4:12] = 100.0
    affine = np.eye(4)
    for i in range(3):
        affine[i, i] = spacing[i]
    img = nib.Nifti1Image(data, affine)
    p = tmp_path / f"{name}.nii.gz"
    nib.save(img, str(p))
    return p


def test_inspect_endpoint_valid_sequences(tmp_path: Path):
    t1 = _make_nifti_file(tmp_path, "T1")
    t1gd = _make_nifti_file(tmp_path, "T1Gd")
    t2 = _make_nifti_file(tmp_path, "T2")
    flair = _make_nifti_file(tmp_path, "FLAIR")

    files = {
        "T1": ("T1.nii.gz", io.BytesIO(t1.read_bytes()), "application/gzip"),
        "T1Gd": ("T1Gd.nii.gz", io.BytesIO(t1gd.read_bytes()), "application/gzip"),
        "T2": ("T2.nii.gz", io.BytesIO(t2.read_bytes()), "application/gzip"),
        "FLAIR": ("FLAIR.nii.gz", io.BytesIO(flair.read_bytes()), "application/gzip"),
    }
    res = client.post("/api/v1/studies/inspect", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["inference_ready"] is True
    assert set(data["sequences_received"]) == {"T1", "T1Gd", "T2", "FLAIR"}
    assert data["geometry"]["compatible"] is True
    assert data["geometry"]["shape"] == [16, 16, 16]


def test_inspect_endpoint_incomplete_set(tmp_path: Path):
    t1 = _make_nifti_file(tmp_path, "T1")
    flair = _make_nifti_file(tmp_path, "FLAIR")

    files = {
        "T1": ("T1.nii.gz", io.BytesIO(t1.read_bytes()), "application/gzip"),
        "FLAIR": ("FLAIR.nii.gz", io.BytesIO(flair.read_bytes()), "application/gzip"),
    }
    res = client.post("/api/v1/studies/inspect", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is False
    assert data["inference_ready"] is False
    assert set(data["sequences_received"]) == {"T1", "FLAIR"}
    assert any(e["code"] == "incomplete_set" for e in data["errors"])


def test_inspect_endpoint_shape_mismatch(tmp_path: Path):
    t1 = _make_nifti_file(tmp_path, "T1", shape=(16, 16, 16))
    t1gd = _make_nifti_file(tmp_path, "T1Gd", shape=(16, 16, 24))
    t2 = _make_nifti_file(tmp_path, "T2", shape=(16, 16, 16))
    flair = _make_nifti_file(tmp_path, "FLAIR", shape=(16, 16, 16))

    files = {
        "T1": ("T1.nii.gz", io.BytesIO(t1.read_bytes()), "application/gzip"),
        "T1Gd": ("T1Gd.nii.gz", io.BytesIO(t1gd.read_bytes()), "application/gzip"),
        "T2": ("T2.nii.gz", io.BytesIO(t2.read_bytes()), "application/gzip"),
        "FLAIR": ("FLAIR.nii.gz", io.BytesIO(flair.read_bytes()), "application/gzip"),
    }
    res = client.post("/api/v1/studies/inspect", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is False
    assert data["geometry"]["compatible"] is False
    assert any(e["code"] == "shape_mismatch" for e in data["errors"])


def test_models_status_endpoint():
    res = client.get("/api/v1/models/status")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "name" in data
    assert "execution_mode" in data
    assert data["execution_mode"] in ("model_inference", "heuristic_fallback")
    assert "hardware_target" in data


def test_run_sample_path_traversal_blocked():
    malicious_id = "../etc/passwd"
    res = client.post(f"/api/v1/samples/{malicious_id}/run/0123456789abcdef0123456789abcdef")
    assert res.status_code == 404

    nonexistent_id = "unknown_phantom_xyz"
    res2 = client.post(f"/api/v1/samples/{nonexistent_id}/run/0123456789abcdef0123456789abcdef")
    assert res2.status_code == 404

