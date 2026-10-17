from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from server.main import JOBS, app

client = TestClient(app)


def _make_fake_job(job_id: str) -> Path:
    out = JOBS / job_id
    out.mkdir(parents=True, exist_ok=True)
    (out / "metadata.json").write_text(json.dumps({"tool": "NeuroScope 3D", "runtime_seconds": 1.0}))
    (out / "report.html").write_text("<html><body>report</body></html>")
    (out / "prediction.nii.gz").write_bytes(b"not a real nifti, just bytes for this test")
    return out


def test_export_bundle_contains_the_expected_files(tmp_path: Path):
    job_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    out = _make_fake_job(job_id)
    try:
        res = client.get(f"/api/v1/jobs/{job_id}/export")
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/zip"
        assert f"neuroscope3d_case_{job_id[:8]}.zip" in res.headers["content-disposition"]

        zf = zipfile.ZipFile(io.BytesIO(res.content))
        names = set(zf.namelist())
        assert names == {"metadata.json", "report.html", "prediction.nii.gz", "README.txt"}
        assert zf.read("report.html") == b"<html><body>report</body></html>"
        assert b"research and teaching prototype only" in zf.read("README.txt")
    finally:
        import shutil
        shutil.rmtree(out, ignore_errors=True)


def test_export_bundle_404s_for_an_unknown_job():
    res = client.get("/api/v1/jobs/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/export")
    assert res.status_code == 404
    body = res.json()
    assert body["code"] == "job_not_done"
