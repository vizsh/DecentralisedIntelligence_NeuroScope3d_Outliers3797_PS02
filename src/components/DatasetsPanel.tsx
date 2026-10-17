import { useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import { useLiveStudy } from '../state/liveStudy'
import { useStore } from '../state/store'

const PIPELINE = ['received', 'validating', 'resampling', 'segmenting', 'measuring', 'meshing', 'reporting', 'done']

const SOURCE_LABEL: Record<api.SampleInfo['source'], string> = {
  synthetic: 'synthetic phantom',
  decathlon: 'real — Decathlon Task01_BrainTumour',
}

function SampleCard({
  sample,
  onRun,
  running,
  blocked,
}: {
  sample: api.SampleInfo
  onRun: () => void
  running: boolean
  /** another sample (or upload) is already running on the single-worker backend */
  blocked: boolean
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 rounded-md border px-3 py-2.5 transition ${
        sample.available ? 'border-edge bg-panel-2/60' : 'border-edge/50 bg-panel-2/30 opacity-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold text-slate-200">{sample.label}</span>
        <div className="flex shrink-0 items-center gap-1">
          {sample.cached && (
            <span
              className="rounded bg-amber-500/10 px-1.5 py-[1px] font-mono text-[9px] text-amber-300"
              title="Prewarmed — this is the model's own cached real output, served in seconds instead of re-running inference."
            >
              ⚡ instant
            </span>
          )}
          <span
            className={`rounded px-1.5 py-[1px] font-mono text-[9px] ${
              sample.source === 'decathlon' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-sky-500/10 text-sky-300'
            }`}
          >
            {SOURCE_LABEL[sample.source]}
          </span>
        </div>
      </div>
      <p className="text-[10.5px] leading-relaxed text-slate-500">{sample.description}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-[9.5px] text-slate-600">
          {sample.has_expert ? 'expert mask included — real Dice/sensitivity shown' : 'no expert mask'}
        </span>
        <button
          onClick={onRun}
          disabled={!sample.available || running || blocked}
          title={blocked ? 'Another case is already running on the local server — wait for it to finish.' : undefined}
          className="rounded border border-sky-500/50 bg-sky-500/10 px-2.5 py-1 text-[10.5px] font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? 'Running…' : sample.available ? 'Run this case' : 'Not staged on server'}
        </button>
      </div>
    </div>
  )
}

export default function DatasetsPanel() {
  const open = useStore((s) => s.datasetsOpen)
  const setOpen = useStore((s) => s.setDatasetsOpen)
  const { status, errors, stage, stageMessage, queuePosition, queueEtaSeconds, runSample, reset, activeSampleId } =
    useLiveStudy()
  const runInFlight = status === 'uploading'
  const [samples, setSamples] = useState<api.SampleInfo[] | null>(null)
  const loadedOnce = useRef(false)

  useEffect(() => {
    if (!open || loadedOnce.current) return
    loadedOnce.current = true
    api.listSamples().then(setSamples)
  }, [open])

  useEffect(() => {
    if (status !== 'done') return
    const t = setTimeout(() => setOpen(false), 900)
    return () => clearTimeout(t)
  }, [status, setOpen])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-edge bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[13.5px] font-semibold text-slate-100">Datasets</h2>
          <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-200">✕</button>
        </div>
        <p className="mb-3 font-mono text-[10px] leading-relaxed text-slate-500">
          Curated cases that run through the exact same pipeline as an uploaded study — same validation, same
          model, same uncertainty and connectivity analysis. Synthetic cases exercise different tumour geometry
          (one mass vs. two, compact vs. diffuse); real cases are a small, honestly-disclosed sample — not a
          held-out accuracy benchmark.
        </p>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          <button
            onClick={() => { if (!runInFlight) { reset(); setOpen(false) } }}
            disabled={runInFlight}
            title={runInFlight ? 'A real case is still running on the local server — this would stop watching it, not cancel it.' : undefined}
            className="flex w-full min-w-0 items-center justify-between rounded-md border border-edge bg-panel-2/60 px-3 py-2.5 text-left transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>
              <span className="block text-[12px] font-semibold text-slate-200">Procedural demo phantom</span>
              <span className="text-[10.5px] text-slate-500">No server needed — the default view on load.</span>
            </span>
            <span className="shrink-0 rounded bg-slate-500/10 px-1.5 py-[1px] font-mono text-[9px] text-slate-400">
              instant
            </span>
          </button>

          {samples === null && (
            <div className="rounded-md border border-edge bg-panel-2/40 px-3 py-4 text-center font-mono text-[10.5px] text-slate-500">
              Loading samples from the local server…
            </div>
          )}
          {samples !== null && samples.length === 0 && (
            <div className="rounded-md border border-edge bg-panel-2/40 px-3 py-4 text-center font-mono text-[10.5px] text-slate-500">
              No curated samples staged on the server yet. Generate them with:
              <br />
              <code className="text-slate-400">python backend/tools/make_demo_gallery.py --out backend/samples</code>
            </div>
          )}
          {samples?.map((s) => (
            <SampleCard
              key={s.id}
              sample={s}
              running={runInFlight && activeSampleId === s.id}
              blocked={runInFlight && activeSampleId !== s.id}
              onRun={() => runSample(s.id)}
            />
          ))}
        </div>

        {status === 'uploading' && (
          <div className="mt-3 rounded-md border border-sky-600/40 bg-sky-500/5 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
              <span className="font-mono text-[11px] text-sky-300">
                {stage === 'queued' && queuePosition != null
                  ? `Queued — position ${queuePosition + 1}${queueEtaSeconds != null ? `, ~${Math.round(queueEtaSeconds)}s` : ''}`
                  : stageMessage ?? 'Starting…'}
              </span>
            </div>
            <div className="mt-2 flex gap-1">
              {PIPELINE.map((s) => {
                const i = PIPELINE.indexOf(s)
                const current = PIPELINE.indexOf(stage ?? 'received')
                return (
                  <span key={s} className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= current ? 'bg-sky-400' : 'bg-slate-700'
                  }`} />
                )
              })}
            </div>
          </div>
        )}

        {status === 'error' && errors.length > 0 && (
          <div className="mt-3 space-y-1 rounded-md border border-rose-600/40 bg-rose-500/5 px-2.5 py-2">
            <div className="text-[11px] font-medium text-rose-300">Run failed — no result was produced.</div>
            {errors.map((e, i) => (
              <div key={i} className="font-mono text-[10px] text-rose-200/80">
                [{e.code}{e.sequence ? `:${e.sequence}` : ''}] {e.message}
              </div>
            ))}
          </div>
        )}

        {status === 'done' && (
          <div className="mt-3 rounded-md border border-emerald-600/40 bg-emerald-500/5 px-2.5 py-2 font-mono text-[10.5px] text-emerald-300">
            Segmentation complete — rendering the selected case.
          </div>
        )}
      </div>
    </div>
  )
}
