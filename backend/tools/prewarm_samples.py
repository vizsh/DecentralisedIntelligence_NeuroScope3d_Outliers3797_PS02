"""Prewarm the Datasets-panel sample cache ahead of a demo.

Each curated sample (synthetic + real Decathlon cases) normally re-runs the
full real pipeline — including the slow part, model inference — on every
single "Run this case" click: 1-3 minutes on this CPU-only setup. This
script runs that same real pipeline once per sample, right now, and stores
its output (prediction, display volumes, uncertainty, metadata, report)
under backend/.runtime/sample_cache/. The server then serves a later click
on the same sample from that cache — a few file copies, seconds not
minutes — instead of recomputing it. The result is identical either way:
it's the model's own real, deterministic output (reproducibility is
measured at Dice 1.00000, see docs/VERIFICATION.md), never a fabricated or
hand-edited one, just not recomputed on every click.

The cache is keyed to the exact checkpoint hash + TTA-pass count that
produced it (server/main.py's _model_cache_tag()), so it's automatically
treated as stale — and silently skipped, not served — the moment the model
or that setting changes. Re-run this script after either changes, or after
`setup_model.py` re-fetches the checkpoint.

Run once before demoing:

    cd backend && python tools/prewarm_samples.py

Takes a few minutes the first time (one real inference per sample); a
second run is near-instant since everything is already cached. Use
--force to redo a sample that's already cached, or --sample <id> to warm
just one.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from server import main as server_main  # noqa: E402


def _new_job_id() -> str:
    return uuid.uuid4().hex


def prewarm_one(sample_id: str, force: bool = False) -> bool:
    entry = next((e for e in server_main._samples_manifest() if e["id"] == sample_id), None)
    if entry is None:
        print(f"  [skip] {sample_id}: not in samples/manifest.json")
        return False
    if not entry["available"]:
        print(f"  [skip] {sample_id}: sequence files not staged under backend/samples/{sample_id}/")
        return False

    cache_dir = server_main._sample_cache_dir(sample_id)
    if (cache_dir / "metadata.json").exists() and not force:
        print(f"  [already warm] {sample_id}  ({cache_dir.relative_to(BACKEND_ROOT)}) — pass --force to redo")
        return True

    case_dir = server_main.SAMPLES_DIR / sample_id
    job = _new_job_id()
    out = server_main.JOBS / job
    out.mkdir(parents=True, exist_ok=False)
    try:
        paths = {s: out / f"{s}.nii.gz" for s in server_main.SEQUENCES}
        for s, dest in paths.items():
            shutil.copyfile(case_dir / f"{s}.nii.gz", dest)
        expert_src = case_dir / "label.nii.gz"
        expert_path = None
        if expert_src.exists():
            expert_path = out / "expert.nii.gz"
            shutil.copyfile(expert_src, expert_path)

        print(f"  [running] {sample_id} — the real pipeline, same as a live click (this is the slow part)…")
        t0 = time.perf_counter()
        server_main.process(job, paths, expert_path, out, source_mode=entry.get("source"))
        print(f"  [done] {sample_id} in {time.perf_counter() - t0:.1f}s")

        if cache_dir.exists():
            shutil.rmtree(cache_dir)
        cache_dir.mkdir(parents=True, exist_ok=True)
        for f in out.iterdir():
            if f.is_file():
                shutil.copyfile(f, cache_dir / f.name)
        print(f"  [cached] {sample_id} -> {cache_dir.relative_to(BACKEND_ROOT)}")
        return True
    finally:
        shutil.rmtree(out, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sample", action="append", help="prewarm only this sample id (repeatable); default: every available sample")
    parser.add_argument("--force", action="store_true", help="re-run even if already cached for the current model/TTA setting")
    args = parser.parse_args()

    manifest = server_main._samples_manifest()
    targets = args.sample or [e["id"] for e in manifest if e["available"]]
    if not targets:
        print("No available samples found — stage them first (make_demo_gallery.py / fetch_decathlon_sample.py + convert_decathlon.py).")
        return

    print(f"Cache key for this run: {server_main._model_cache_tag()}  ({len(targets)} sample(s))\n")
    ok = 0
    for sid in targets:
        if prewarm_one(sid, force=args.force):
            ok += 1
    print(f"\n{ok}/{len(targets)} samples ready for instant demo load.")


if __name__ == "__main__":
    main()
