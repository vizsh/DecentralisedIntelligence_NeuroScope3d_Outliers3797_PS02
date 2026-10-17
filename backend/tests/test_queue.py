"""Unit tests for the job queue (server.main.wait_for_slot and friends).

These exercise the queue mechanics directly rather than through a full upload ->
segmentation HTTP round trip, which would need the real (slow) model or the heuristic
fallback for every test. The queue logic itself is independent of what runs once a
slot is acquired, so testing it in isolation is both faster and a more precise test
of the thing that actually changed (replacing the old instant-409-reject).
"""

from __future__ import annotations

import asyncio

import pytest

from server import main as server_main


@pytest.fixture(autouse=True)
def _clean_queue_state():
    """Every test starts from a known-empty queue and an unlocked `busy`, and leaves
    it that way even if a test fails partway through holding the lock."""
    server_main._queue.clear()
    server_main._recent_runtimes.clear()
    if server_main.busy.locked():
        server_main.busy.release()
    yield
    server_main._queue.clear()
    server_main._recent_runtimes.clear()
    if server_main.busy.locked():
        server_main.busy.release()


@pytest.mark.asyncio
async def test_wait_for_slot_acquires_immediately_when_free():
    assert not server_main.busy.locked()
    await server_main.wait_for_slot("job-a")
    assert server_main.busy.locked()
    assert "job-a" not in server_main._queue  # acquired jobs aren't "waiting" any more


@pytest.mark.asyncio
async def test_wait_for_slot_reports_position_and_eta_while_waiting():
    # Simulate job A already running.
    server_main.busy.acquire()
    server_main._current_job = "job-a"

    waiter = asyncio.create_task(server_main.wait_for_slot("job-b"))
    await asyncio.sleep(1.3)  # let at least one queue-report loop iteration run

    status = server_main.PROGRESS.get("job-b")
    assert status is not None, "job-b should have reported a 'queued' stage while waiting"
    assert status["stage"] == "queued"
    assert status["queue_position"] == 0  # next in line, since nobody else is queued
    assert status["eta_seconds"] > 0

    server_main.busy.release()
    server_main._current_job = None
    await asyncio.wait_for(waiter, timeout=5)
    assert server_main.busy.locked()  # job-b now holds it
    server_main.busy.release()


@pytest.mark.asyncio
async def test_two_waiters_get_distinct_positions_and_run_in_fifo_order():
    server_main.busy.acquire()  # job A running

    waiter_b = asyncio.create_task(server_main.wait_for_slot("job-b"))
    await asyncio.sleep(0.1)
    waiter_c = asyncio.create_task(server_main.wait_for_slot("job-c"))
    await asyncio.sleep(1.3)

    assert server_main.PROGRESS["job-b"]["queue_position"] == 0
    assert server_main.PROGRESS["job-c"]["queue_position"] == 1

    server_main.busy.release()  # job A done; job-b should acquire next
    await asyncio.wait_for(waiter_b, timeout=5)
    assert "job-c" in server_main._queue  # job-c is still waiting behind job-b

    server_main.busy.release()  # job-b done; job-c should acquire next
    await asyncio.wait_for(waiter_c, timeout=5)
    assert server_main.busy.locked()
    server_main.busy.release()


@pytest.mark.asyncio
async def test_queue_full_is_refused_without_blocking_forever():
    server_main.busy.acquire()  # the one running slot is taken
    waiters = [
        asyncio.create_task(server_main.wait_for_slot(f"filler-{i}"))
        for i in range(server_main._MAX_QUEUE_LENGTH)
    ]
    await asyncio.sleep(0.2)

    with pytest.raises(server_main.QueueFull):
        await server_main.wait_for_slot("one-too-many")

    for w in waiters:
        w.cancel()
    await asyncio.gather(*waiters, return_exceptions=True)
    server_main.busy.release()


def test_estimate_job_seconds_defaults_until_a_real_runtime_is_recorded():
    assert server_main._estimate_job_seconds() == server_main._DEFAULT_ETA_SECONDS
    server_main._record_runtime(60.0)
    server_main._record_runtime(80.0)
    assert server_main._estimate_job_seconds() == pytest.approx(70.0)


def test_record_runtime_keeps_only_a_rolling_window():
    window = server_main._RUNTIME_WINDOW
    total = window + 9
    for seconds in range(1, total + 1):
        server_main._record_runtime(float(seconds))
    assert len(server_main._recent_runtimes) == window
    assert server_main._recent_runtimes == [float(n) for n in range(total - window + 1, total + 1)]
