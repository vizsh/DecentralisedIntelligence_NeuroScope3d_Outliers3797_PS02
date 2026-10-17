import { useEffect, useRef, useState } from 'react'
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCheck,
  Search,
  Layers,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  RefreshCw,
} from 'lucide-react'
import * as api from '../lib/api'
import { autoSortFiles, detectSlot, type Slot, type ImportProfile } from '../lib/sequenceDetect'
import { useLiveStudy } from '../state/liveStudy'
import { useStore } from '../state/store'
import { useWorkspaceStore } from '../state/workspaceStore'

const PIPELINE = ['queued', 'received', 'validating', 'resampling', 'segmenting', 'measuring', 'meshing', 'reporting', 'done']

const REQUIRED: { key: Slot; label: string; hint: string }[] = [
  { key: 'T1', label: 'T1', hint: 'native T1-weighted anatomical' },
  { key: 'T1Gd', label: 'T1Gd / T1ce', hint: 'post-gadolinium contrast T1' },
  { key: 'T2', label: 'T2', hint: 'T2-weighted spin-echo' },
  { key: 'FLAIR', label: 'FLAIR', hint: 'fluid-attenuated inversion recovery' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Dropzone({
  slot,
  label,
  hint,
  file,
  onPick,
  onReassign,
  optional = false,
  detectedMeta,
}: {
  slot: Slot
  label: string
  hint: string
  file: File | null
  onPick: (f: File | null) => void
  onReassign?: (newSlot: Slot) => void
  optional?: boolean
  detectedMeta?: { shape: number[]; spacing: number[]; units: string }
}) {
  const [over, setOver] = useState(false)
  const inputId = `upload-${slot}`

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) onPick(f)
      }}
      className={`relative flex min-w-0 cursor-pointer flex-col gap-1 rounded-md border p-3 transition ${
        over
          ? 'border-sky-400 bg-sky-500/10 shadow-sm'
          : file
          ? 'border-emerald-600/40 bg-emerald-500/5'
          : 'border-edge bg-panel-2/50 hover:border-slate-500 hover:bg-panel-2/80'
      }`}
    >
      <input
        id={inputId}
        type="file"
        accept=".nii,.gz"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11.5px] font-semibold text-slate-100">
            {label}
          </span>
          {optional && <span className="font-mono text-[9px] text-slate-500">(optional)</span>}
          {file && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
        </div>

        {file && (
          <div className="flex items-center gap-1.5">
            {onReassign && (
              <select
                value={slot}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onReassign(e.target.value as Slot)}
                className="rounded border border-edge/80 bg-panel px-1.5 py-0.5 font-mono text-[9px] text-slate-300 hover:border-sky-500 focus:outline-none"
                title="Reassign to a different sequence slot"
              >
                <option value="T1">&rarr; T1</option>
                <option value="T1Gd">&rarr; T1Gd</option>
                <option value="T2">&rarr; T2</option>
                <option value="FLAIR">&rarr; FLAIR</option>
                <option value="expert">&rarr; Expert Mask</option>
              </select>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onPick(null)
              }}
              className="text-[10px] text-slate-500 hover:text-rose-400"
              title="Remove file"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <span className="truncate font-mono text-[10px] text-slate-400">{hint}</span>

      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className={`truncate font-mono ${file ? 'font-medium text-emerald-300' : 'text-slate-500'}`}>
          {file ? file.name : 'drop .nii / .nii.gz or browse'}
        </span>
        {file && (
          <span className="ml-1 shrink-0 font-mono text-[9px] text-slate-400">
            {formatBytes(file.size)}
          </span>
        )}
      </div>

      {detectedMeta && (
        <div className="mt-1 flex items-center gap-2 rounded bg-slate-900/60 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
          <span>Grid: {detectedMeta.shape.join('x')}</span>
          <span>Spacing: {detectedMeta.spacing.map((s) => s.toFixed(2)).join('x')}mm</span>
        </div>
      )}

      {file && (() => {
        const guess = detectSlot(file.name)
        return guess && guess !== slot ? (
          <div className="mt-1 flex items-center gap-1 text-[9.5px] text-amber-300">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate font-mono">Filename pattern suggests {guess} — confirm assignment</span>
          </div>
        ) : null
      })()}
    </label>
  )
}

export default function UploadPanel() {
  const open = useStore((s) => s.uploadOpen)
  const setOpen = useStore((s) => s.setUploadOpen)
  const { status, errors, stage, stageMessage, queuePosition, queueEtaSeconds, submit, reset } = useLiveStudy()
  const [files, setFiles] = useState<Record<Slot, File | null>>({
    T1: null,
    T1Gd: null,
    T2: null,
    FLAIR: null,
    expert: null,
  })
  const [serverStatus, setServerStatus] = useState<{ ok: boolean; modelReady: boolean; message: string } | null>(null)
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [bulkOver, setBulkOver] = useState(false)
  const [importProfile, setImportProfile] = useState<ImportProfile>('standard')
  const [preflight, setPreflight] = useState<api.InspectResult | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const checkedOnce = useRef(false)

  const applyAutoSort = (picked: File[]) => {
    const { assigned, unmatched: rest } = autoSortFiles(picked, importProfile)
    if (Object.keys(assigned).length > 0) {
      setFiles((s) => ({ ...s, ...assigned }))
      setPreflight(null)
    }
    setUnmatched(rest.map((f) => f.name))
  }

  const handleReassign = (fromSlot: Slot, toSlot: Slot) => {
    if (fromSlot === toSlot) return
    const current = files[fromSlot]
    const displaced = files[toSlot]
    setFiles((prev) => ({
      ...prev,
      [fromSlot]: displaced,
      [toSlot]: current,
    }))
    setPreflight(null)
  }

  const handlePreflight = async () => {
    const payload: Partial<Record<'T1' | 'T1Gd' | 'T2' | 'FLAIR' | 'expert', File>> = {}
    if (files.T1) payload.T1 = files.T1
    if (files.T1Gd) payload.T1Gd = files.T1Gd
    if (files.T2) payload.T2 = files.T2
    if (files.FLAIR) payload.FLAIR = files.FLAIR
    if (files.expert) payload.expert = files.expert

    setInspecting(true)
    try {
      const res = await api.inspectStudy(payload)
      setPreflight(res)
    } finally {
      setInspecting(false)
    }
  }

  useEffect(() => {
    if (!open || checkedOnce.current) return
    checkedOnce.current = true
    api.health().then((h) => {
      setServerStatus(
        h
          ? {
              ok: true,
              modelReady: h.model_ready,
              message: h.model_ready
                ? `MONAI SegResNet active (${h.model_name})`
                : 'Pipeline smoke-test model active — download MONAI bundle for full inference',
            }
          : {
              ok: false,
              modelReady: false,
              message: 'Local inference server unreachable at http://127.0.0.1:8008',
            },
      )
    })
  }, [open])

  useEffect(() => {
    if (status !== 'done') return
    useWorkspaceStore.getState().setActiveWorkspace('viewer')
    const t = setTimeout(() => setOpen(false), 800)
    return () => clearTimeout(t)
  }, [status, setOpen])

  if (!open) return null

  const ready = Boolean(files.T1 && files.T1Gd && files.T2 && files.FLAIR)
  const fileCount = [files.T1, files.T1Gd, files.T2, files.FLAIR, files.expert].filter(Boolean).length

  const run = () => {
    if (!ready) return
    submit({
      T1: files.T1!,
      T1Gd: files.T1Gd!,
      T2: files.T2!,
      FLAIR: files.FLAIR!,
      ...(files.expert ? { expert: files.expert } : {}),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-edge bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between border-b border-edge/60 pb-3">
          <div className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-sky-400" />
            <div>
              <h2 className="text-[14px] font-semibold tracking-tight text-slate-100">
                MRI Study Ingestion & Pre-flight Inspection
              </h2>
              <p className="font-mono text-[10px] text-slate-400">
                Four co-registered NIfTI sequences required. Non-destructive local processing.
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-slate-500 hover:bg-panel-2 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Server & Engine Status Banner */}
        {serverStatus && (
          <div
            className={`mb-3 flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[10.5px] ${
              serverStatus.ok
                ? serverStatus.modelReady
                  ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-600/40 bg-amber-500/10 text-amber-300'
                : 'border-rose-600/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {serverStatus.ok ? (
              serverStatus.modelReady ? (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              )
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            )}
            <span>{serverStatus.message}</span>
          </div>
        )}

        {/* Import Profile Selector */}
        <div className="mb-3 flex items-center justify-between rounded-md border border-edge/80 bg-panel-2/60 px-3 py-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-400">Dataset Profile:</span>
            <span className="text-[10px] text-slate-500">Determines regex heuristics for batch drag & drop</span>
          </div>
          <select
            value={importProfile}
            onChange={(e) => setImportProfile(e.target.value as ImportProfile)}
            className="rounded border border-edge bg-panel px-2.5 py-1 font-mono text-[10.5px] text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="standard">Standard Modality Names (T1, T1Gd, T2, FLAIR)</option>
            <option value="synapse">BraTS Synapse / nnU-Net (_0000 to _0003)</option>
            <option value="decathlon">Decathlon Task01 (4D split)</option>
          </select>
        </div>

        {/* Bulk Dropzone */}
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setBulkOver(true)
          }}
          onDragLeave={() => setBulkOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setBulkOver(false)
            applyAutoSort(Array.from(e.dataTransfer.files ?? []))
          }}
          className={`mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-3.5 text-center transition ${
            bulkOver
              ? 'border-sky-400 bg-sky-500/15'
              : 'border-edge/80 bg-panel-2/30 hover:border-slate-500 hover:bg-panel-2/60'
          }`}
        >
          <input
            type="file"
            multiple
            accept=".nii,.gz"
            className="hidden"
            onChange={(e) => {
              applyAutoSort(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-sky-400" />
            <span className="font-mono text-[11px] font-medium text-slate-300">
              Drag all four sequence files here at once
            </span>
          </div>
          <span className="font-mono text-[9.5px] text-slate-500">
            Files will be auto-sorted into slots based on the active dataset profile ({importProfile})
          </span>
        </label>

        {unmatched.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-300">
            Ambiguous naming for: {unmatched.join(', ')} — please place manually in the slot boxes below.
          </div>
        )}

        {/* Four Sequence Slots Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {REQUIRED.map((r) => (
            <Dropzone
              key={r.key}
              slot={r.key}
              label={r.label}
              hint={r.hint}
              file={files[r.key]}
              onPick={(f) => {
                setFiles((s) => ({ ...s, [r.key]: f }))
                setPreflight(null)
              }}
              onReassign={(newSlot) => handleReassign(r.key, newSlot)}
              detectedMeta={preflight?.sequence_metadata?.[r.key]}
            />
          ))}
        </div>

        {/* Optional Expert Mask */}
        <div className="mt-2.5">
          <Dropzone
            slot="expert"
            label="Expert Reference Mask"
            hint="Ground truth labels (NCR=1, ED=2, ET=4) for segmentation validation"
            file={files.expert}
            onPick={(f) => {
              setFiles((s) => ({ ...s, expert: f }))
              setPreflight(null)
            }}
            onReassign={(newSlot) => handleReassign('expert', newSlot)}
            optional
            detectedMeta={preflight?.sequence_metadata?.expert}
          />
        </div>

        {/* Pre-flight Inspection Results HUD */}
        {preflight && (
          <div
            className={`mt-3 rounded-md border p-3 font-mono text-[10.5px] ${
              preflight.ok && preflight.geometry.compatible
                ? 'border-emerald-600/40 bg-emerald-500/5 text-slate-300'
                : 'border-rose-600/40 bg-rose-500/5 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">Pre-flight Verification Summary</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                  preflight.ok && preflight.geometry.compatible
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {preflight.ok && preflight.geometry.compatible ? 'READY FOR INFERENCE' : 'ACTION REQUIRED'}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-edge/60 pt-2 text-[10px]">
              <div>
                <span className="text-slate-500">Sequences: </span>
                <span className="font-medium text-slate-200">{preflight.sequences_received.length}/4</span>
              </div>
              <div>
                <span className="text-slate-500">Dimensions: </span>
                <span className="font-medium text-slate-200">
                  {preflight.geometry.shape ? preflight.geometry.shape.join(' × ') : 'Mismatched'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Spacing: </span>
                <span className="font-medium text-slate-200">
                  {preflight.geometry.spacing
                    ? `${preflight.geometry.spacing.map((s) => s.toFixed(2)).join(' × ')} mm`
                    : 'Non-uniform'}
                </span>
              </div>
            </div>

            {preflight.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {preflight.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>[{w.code}] {w.message}</span>
                  </div>
                ))}
              </div>
            )}

            {preflight.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {preflight.errors.map((e, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-rose-300">
                    <ShieldAlert className="h-3 w-3 shrink-0" />
                    <span>[{e.code}] {e.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upload & Inference Progress */}
        {status === 'uploading' && (
          <div className="mt-3 rounded-md border border-sky-600/40 bg-sky-500/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
              <span className="font-mono text-[11px] text-sky-300">{stageMessage ?? 'Processing pipeline…'}</span>
            </div>
            {stage === 'queued' && queuePosition !== null && (
              <p className="mt-1 pl-5 font-mono text-[10px] text-amber-300">
                {queuePosition === 0 ? 'Next in line' : `Position ${queuePosition + 1} in queue`}
                {queueEtaSeconds !== null && ` · ~${Math.round(queueEtaSeconds)}s estimated wait`}
              </p>
            )}
            <div className="mt-2 flex gap-1">
              {PIPELINE.map((s) => {
                const i = PIPELINE.indexOf(s)
                const current = PIPELINE.indexOf(stage ?? 'received')
                return (
                  <span
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= current ? 'bg-sky-400' : 'bg-slate-700'
                    }`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Errors Display */}
        {status === 'error' && errors.length > 0 && (
          <div className="mt-3 space-y-1 rounded-md border border-rose-600/40 bg-rose-500/5 px-3 py-2.5">
            <div className="text-[11px] font-medium text-rose-300">Input rejected — inference was not started.</div>
            {errors.map((e, i) => (
              <div key={i} className="font-mono text-[10px] text-rose-200/80">
                [{e.code}{e.sequence ? `:${e.sequence}` : ''}] {e.message}
              </div>
            ))}
          </div>
        )}

        {/* Done message */}
        {status === 'done' && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-600/40 bg-emerald-500/5 px-3 py-2 font-mono text-[10.5px] text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Segmentation and 3D surface reconstruction complete. Opening Studio…</span>
          </div>
        )}

        {/* Actions Bar */}
        <div className="mt-4 flex items-center justify-between border-t border-edge/60 pt-3">
          <button
            onClick={() => {
              reset()
              setFiles({ T1: null, T1Gd: null, T2: null, FLAIR: null, expert: null })
              setUnmatched([])
              setPreflight(null)
            }}
            className="font-mono text-[11px] text-slate-500 hover:text-slate-300"
          >
            Reset Form
          </button>

          <div className="flex items-center gap-2">
            {fileCount > 0 && (
              <button
                type="button"
                onClick={handlePreflight}
                disabled={inspecting}
                className="flex items-center gap-1.5 rounded-md border border-edge/80 bg-panel-2 px-3 py-1.5 font-mono text-[11px] text-slate-200 hover:border-slate-500 disabled:opacity-50"
              >
                {inspecting ? (
                  <RefreshCw className="h-3 w-3 animate-spin text-sky-400" />
                ) : (
                  <Search className="h-3 w-3 text-sky-400" />
                )}
                <span>{inspecting ? 'Inspecting…' : 'Inspect Geometry'}</span>
              </button>
            )}

            <button
              onClick={run}
              disabled={!ready || status === 'uploading'}
              className="flex items-center gap-1.5 rounded-md border border-sky-500/50 bg-sky-500/20 px-4 py-1.5 text-[11.5px] font-medium text-sky-200 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>{status === 'uploading' ? 'Processing…' : 'Run Segmentation'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
