from __future__ import annotations

from fastapi.testclient import TestClient

from server import main as server_main
from server.main import app

client = TestClient(app)


def _reset_metrics():
    with server_main._metrics_lock:
        server_main._metrics["jobs_completed"] = 0
        server_main._metrics["jobs_errored"] = 0
        server_main._metrics["jobs_rejected_by_code"] = {}
    with server_main._queue_lock:
        server_main._recent_runtimes.clear()


def test_metrics_shape_with_no_activity():
    _reset_metrics()
    res = client.get("/api/metrics")
    assert res.status_code == 200
    body = res.json()
    assert body["jobs_completed"] == 0
    assert body["jobs_errored"] == 0
    assert body["jobs_rejected_total"] == 0
    assert body["jobs_total"] == 0
    assert body["inference_seconds_p50"] is None
    assert body["inference_seconds_sample_count"] == 0
    assert body["uptime_seconds"] >= 0


def test_metrics_reflects_recorded_outcomes():
    _reset_metrics()
    server_main._record_outcome("completed")
    server_main._record_outcome("completed")
    server_main._record_outcome("errored")
    server_main._record_outcome("rejected", "not_finite")
    server_main._record_outcome("rejected", "not_finite")
    server_main._record_outcome("rejected", "shape_mismatch")
    server_main._record_runtime(40.0)
    server_main._record_runtime(60.0)
    server_main._record_runtime(80.0)

    body = client.get("/api/metrics").json()
    assert body["jobs_completed"] == 2
    assert body["jobs_errored"] == 1
    assert body["jobs_rejected_by_code"] == {"not_finite": 2, "shape_mismatch": 1}
    assert body["jobs_rejected_total"] == 3
    assert body["jobs_total"] == 6
    assert body["inference_seconds_sample_count"] == 3
    assert body["inference_seconds_p50"] == 60.0
