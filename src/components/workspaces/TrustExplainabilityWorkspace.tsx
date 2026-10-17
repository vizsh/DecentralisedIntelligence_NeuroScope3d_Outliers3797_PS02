import { useState } from 'react'
import { useStudyOptional } from '../../state/study'
import { useWorkspaceStore } from '../../state/workspaceStore'

export default function TrustExplainabilityWorkspace() {
  const bundle = useStudyOptional()
  const selectedStudyId = useWorkspaceStore((s) => s.selectedStudyId)
  const uncertaintyThreshold = useWorkspaceStore((s) => s.uncertaintyThreshold)
  const setUncertaintyThreshold = useWorkspaceStore((s) => s.setUncertaintyThreshold)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  const [activeTrustTab, setActiveTrustTab] = useState<'uncertainty' | 'geometry' | 'provenance'>('uncertainty')

  const isLive = bundle?.mode === 'live' && !!bundle.liveMetadata
  const wtUnc = isLive ? bundle!.liveMetadata!.uncertainty?.WT : null
  const runtimeSeconds = isLive ? bundle!.liveMetadata!.runtime_seconds : null
  const ttaPasses = isLive ? bundle!.liveMetadata!.model.tta_passes : bundle?.study ? 2 : null

  // Real affine from the loaded study (demo phantom or live case); 4x4, row-major, same convention
  // the NIfTI header itself uses. No study loaded -> no matrix to show, not a placeholder one.
  const affineFlat = bundle?.study.affine ?? null
  const affineMatrix = affineFlat
    ? [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => affineFlat[r * 4 + c]))
    : null

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 space-y-4 bg-ink text-slate-200">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 rounded-lg border border-edge bg-panel/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-semibold text-slate-100">Trust & Explainability Audit</h1>
            <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-300 border border-sky-500/20">
              Layer 3 Trust Engine
            </span>
          </div>
          <p className="mt-1 text-[11.5px] text-slate-400">
            Audit case: <span className="font-mono text-slate-200">{bundle?.study.caseId || selectedStudyId}</span> ·
            Answering: What did the model do? Where might it be unreliable? What evidence supports this run?
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveWorkspace('viewer')}
            className="rounded border border-edge bg-panel-2 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            ← View in 3D Studio
          </button>
          <button
            onClick={() => setActiveWorkspace('graph')}
            className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 transition hover:bg-sky-500/20"
          >
            Trace in Research Graph →
          </button>
        </div>
      </div>

      {/* Critical Scientific Disclaimer on Uncertainty */}
      <div className="rounded-md border border-sky-500/30 bg-sky-950/20 px-3.5 py-2.5 flex items-start gap-3">
        <span className="text-sky-400 text-[13px] font-bold">ℹ</span>
        <div className="text-[11px] text-slate-300 leading-relaxed">
          <strong className="text-sky-200">Scientific Trust Definition:</strong> An uncertainty heatmap is an estimate of{' '}
          <strong>model inconsistency under perturbation (flip-TTA σ)</strong>, not a ground truth error map. Measured
          against all 10 real held-out cases (below), σ shows a real, positive, <strong>moderate</strong> correlation with
          disagreement against the expert mask — not a strong one, and not a calibrated probability. Low σ does not
          guarantee absence of error.
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-edge/80 text-[11.5px]">
        <button
          onClick={() => setActiveTrustTab('uncertainty')}
          className={`border-b-2 px-4 py-2 font-medium transition ${
            activeTrustTab === 'uncertainty'
              ? 'border-sky-400 text-sky-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          1. Model Uncertainty & Calibration
        </button>
        <button
          onClick={() => setActiveTrustTab('geometry')}
          className={`border-b-2 px-4 py-2 font-medium transition ${
            activeTrustTab === 'geometry'
              ? 'border-sky-400 text-sky-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          2. Geometry & Input Audit
        </button>
        <button
          onClick={() => setActiveTrustTab('provenance')}
          className={`border-b-2 px-4 py-2 font-medium transition ${
            activeTrustTab === 'provenance'
              ? 'border-sky-400 text-sky-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          3. Provenance & Cryptographic Chain
        </button>
      </div>

      {/* TAB 1: UNCERTAINTY & CALIBRATION */}
      {activeTrustTab === 'uncertainty' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Interactive Threshold Filter Card */}
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-4">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-100">Interactive Uncertainty Thresholding</h2>
              <p className="text-[10.5px] text-slate-500">
                Filter voxels where flip-TTA standard deviation exceeds confidence threshold τ.
              </p>
            </div>

            <div className="rounded-md border border-edge bg-panel-2/50 p-3.5 space-y-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Uncertainty Cutoff (τ):</span>
                <span className="font-mono text-sky-300 font-bold">σ ≥ {uncertaintyThreshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.60"
                step="0.05"
                value={uncertaintyThreshold}
                onChange={(e) => setUncertaintyThreshold(parseFloat(e.target.value))}
                className="w-full accent-sky-400"
              />
              <div className="flex justify-between font-mono text-[9px] text-slate-500">
                <span>0.05 (Broad Boundary)</span>
                <span>0.35 (Core Ambiguity)</span>
                <span>0.60 (Extreme Disagreement)</span>
              </div>
            </div>

            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex justify-between border-b border-edge/60 pb-1.5">
                <span className="text-slate-400">TTA Ensemble:</span>
                <span className="text-slate-200">{ttaPasses ? `${ttaPasses}-Pass Flip Ensemble` : '—'}</span>
              </div>
              <div className="flex justify-between border-b border-edge/60 pb-1.5">
                <span className="text-slate-400">Mean Whole Tumor σ:</span>
                <span className="text-sky-300">{wtUnc ? wtUnc.mean.toFixed(3) : 'run a live case to measure'}</span>
              </div>
              <div className="flex justify-between border-b border-edge/60 pb-1.5">
                <span className="text-slate-400">Max Boundary σ:</span>
                <span className="text-amber-300">{wtUnc ? wtUnc.max.toFixed(3) : 'run a live case to measure'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Inference Runtime:</span>
                <span className="text-emerald-400">{runtimeSeconds ? `${runtimeSeconds.toFixed(1)}s (CPU)` : 'run a live case to measure'}</span>
              </div>
            </div>
            {!isLive && (
              <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                Showing the demo phantom — these figures populate once a real case (upload or Datasets gallery) completes, since they are measured per-run, not fixed constants.
              </p>
            )}
          </div>

          {/* Uncertainty vs Error Empirical Calibration */}
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-100">Uncertainty vs. Empirical Disagreement</h2>
              <p className="text-[10.5px] text-slate-500">
                Whether flip-TTA σ actually correlates with real boundary error, measured against the ten real held-out Decathlon cases.
              </p>
            </div>

            <div className="overflow-x-auto rounded border border-edge/80">
              <table className="w-full text-left text-[11px] font-mono">
                <thead className="bg-panel-2 text-[10px] text-slate-400 uppercase border-b border-edge">
                  <tr>
                    <th className="px-3 py-2">σ bin</th>
                    <th className="px-3 py-2">WT-union voxels</th>
                    <th className="px-3 py-2">Disagreement rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/50">
                  {[
                    { bin: '0.00 – 0.10', voxels: '1,236,783', rate: '15.7%' },
                    { bin: '0.10 – 0.20', voxels: '49,728', rate: '54.5%' },
                    { bin: '0.20 – 0.35', voxels: '9,487', rate: '65.1%' },
                    { bin: '0.35 – 0.50', voxels: '1,759', rate: '65.2%' },
                    { bin: '0.50 – 1.00', voxels: '41 (tiny sample)', rate: '56.1%' },
                  ].map((row) => (
                    <tr key={row.bin} className="hover:bg-panel-2/30">
                      <td className="px-3 py-2 font-bold text-slate-200">{row.bin}</td>
                      <td className="px-3 py-2 text-slate-400">{row.voxels}</td>
                      <td className="px-3 py-2 text-sky-300 font-bold">{row.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
              Measured, not estimated — pooled across all 10 real held-out cases (1,297,798 WT-union voxels), via
              backend/calibration_check.py (Phase 3c of docs/IMPLEMENTATION_PLAN.md). Pooled Pearson correlation
              between σ and real disagreement: <strong className="text-slate-300">0.3463</strong> — a real, positive,
              moderate signal, not a formally calibrated probability. The highest bin's 56.1% sits on only 41 voxels
              across all 10 cases and is too small a sample to read as a trend reversal. Full per-case breakdown:
              backend/data/calibration_check.json.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: GEOMETRY & INPUT AUDIT */}
      {activeTrustTab === 'geometry' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 7-Point Fail-Safe Audit Table */}
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-100">7-Point Input Validation Audit</h2>
              <p className="text-[10.5px] text-slate-500">
                The real check set neuroscope/validate.py runs before inference, all-or-nothing. Badges below name
                what each check verifies — for this specific study's live per-check result, see the Quality Check
                Centre in the 3D Studio Viewer.
              </p>
            </div>

            <div className="space-y-2 text-[11px] font-mono">
              {[
                { name: 'NIfTI Header Finiteness', desc: 'No NaN / Inf floating point corruptions', status: 'PASS' },
                { name: '4-Modality Spatial Congruence', desc: 'Identical matrix dimensions across sequences', status: 'PASS' },
                { name: 'Affine Matrix Singularity', desc: 'Determinant det(M) ≠ 0; invertible mapping', status: 'PASS' },
                { name: 'Voxel Budget Guard', desc: 'Volume < 50,000,000 voxels memory ceiling', status: 'PASS' },
                { name: 'Skull-Strip Heuristic', desc: 'Exterior background air attenuation confirmed', status: 'PASS' },
                { name: 'Head Shape Plausibility', desc: 'Sphericity and bounding aspect ratio check', status: 'PASS' },
                { name: 'Orientation Agreement', desc: 'Canonical RAS+ reorientation matrix verified', status: 'PASS' }
              ].map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded border border-edge/60 bg-panel-2/40 p-2.5">
                  <div>
                    <div className="font-semibold text-slate-200">{c.name}</div>
                    <div className="text-[9.5px] text-slate-500 font-sans">{c.desc}</div>
                  </div>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[9.5px] text-emerald-300 font-bold">
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 4x4 Affine Matrix & Coordinate Transform */}
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-100">Physical Coordinate Transformation (Affine)</h2>
              <p className="text-[10.5px] text-slate-500">Direct transformation from voxel grid (i, j, k) to scanner world coordinates (x, y, z) in mm</p>
            </div>

            <div className="rounded-md border border-edge bg-panel-2/70 p-3 font-mono text-[11px] space-y-1">
              <div className="text-[10px] text-slate-500 mb-2">Orientation: RAS+ (Right, Anterior, Superior)</div>
              {affineMatrix ? (
                affineMatrix.map((row, idx) => (
                  <div key={idx} className="flex justify-between text-slate-300 border-b border-edge/30 py-1">
                    {row.map((val, cIdx) => (
                      <span key={cIdx} className="w-16 text-right">
                        {val.toFixed(1)}
                      </span>
                    ))}
                  </div>
                ))
              ) : (
                <div className="text-[10.5px] text-slate-500">No study loaded.</div>
              )}
            </div>

            <div className="space-y-1.5 text-[10.5px] text-slate-400 font-mono">
              <div className="flex justify-between">
                <span>Voxel Spacing (Δx, Δy, Δz):</span>
                <span className="text-sky-300">
                  {bundle ? bundle.study.spacing.map((s) => s.toFixed(2)).join(' × ') + ' mm' : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Grid Dimension:</span>
                <span className="text-slate-200">{bundle ? bundle.study.dims.join(' × ') + ' voxels' : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Origin Offset:</span>
                <span className="text-slate-200">
                  {affineMatrix ? `[${affineMatrix[0][3].toFixed(1)}, ${affineMatrix[1][3].toFixed(1)}, ${affineMatrix[2][3].toFixed(1)}] mm` : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROVENANCE & CRYPTOGRAPHIC CHAIN */}
      {activeTrustTab === 'provenance' && (
        <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3">
          <div>
            <h2 className="text-[13px] font-semibold text-slate-100">Cryptographic Provenance Chain</h2>
            <p className="text-[10.5px] text-slate-500">Immutable SHA-256 hashes verifying reproducible run integrity</p>
          </div>

          <div className="space-y-2 text-[11px] font-mono">
            <div className="rounded border border-edge bg-panel-2/50 p-3 space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Model Checkpoint:</span>
                <span className={isLive ? 'text-emerald-400' : 'text-slate-500'}>
                  {isLive ? bundle!.liveMetadata!.model.name : 'demo phantom — no checkpoint used'}
                </span>
              </div>
              {isLive && (
                <div className="text-[10px] text-slate-300 break-all select-all">
                  {bundle!.liveMetadata!.model.source}
                </div>
              )}
            </div>

            <div className="rounded border border-edge bg-panel-2/50 p-3 space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Git Source Code Commit:</span>
                <span className="text-sky-400">{isLive ? 'recorded with this run' : '—'}</span>
              </div>
              <div className="text-[10px] text-slate-300">
                {isLive ? bundle!.liveMetadata!.code_commit : 'Available once a live case (upload or Datasets gallery) completes.'}
              </div>
            </div>

            <div className="rounded border border-edge bg-panel-2/50 p-3 space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Study Digest (SHA-256):</span>
                <span className="text-slate-300">{isLive ? 'Per-sequence' : 'Combined digest'}</span>
              </div>
              <div className="text-[9.5px] text-slate-500 space-y-0.5 break-all">
                {isLive
                  ? Object.entries(bundle!.liveMetadata!.input_sha256).map(([seq, hash]) => (
                      <div key={seq}>{seq}: {hash}</div>
                    ))
                  : <div>{bundle ? bundle.sha256 : '—'}</div>}
              </div>
            </div>

            <div className="rounded border border-edge bg-panel-2/50 p-3 flex items-center justify-between">
              <span className="text-slate-400">TTA Determinism:</span>
              <span className="text-sky-300 font-bold">
                {isLive && bundle!.liveMetadata!.model.deterministic ? 'Deterministic (no randomness)' : '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
