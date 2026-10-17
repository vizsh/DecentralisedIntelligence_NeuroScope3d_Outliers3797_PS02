import { exportBundleUrl, reportUrl } from '../lib/api'
import { useLiveStudy } from '../state/liveStudy'
import { useStudyOptional } from '../state/study'
import { useStore } from '../state/store'
import { useWorkspaceStore } from '../state/workspaceStore'

const SAMPLES_LIST = [
  { id: 'demo_phantom', label: 'Procedural Demo Phantom' },
  { id: 'brats_206', label: 'Real Case · Decathlon BRATS_206' },
  { id: 'brats_306', label: 'Real Case · Decathlon BRATS_306' },
  { id: 'brats_449', label: 'Real Case · Decathlon BRATS_449' },
  { id: 'brats_457', label: 'Real Case · Decathlon BRATS_457' },
  { id: 'demo_unifocal_right', label: 'Synthetic · Unifocal Right' },
  { id: 'demo_multifocal_left', label: 'Synthetic · Multifocal Left' },
  { id: 'demo_large_diffuse', label: 'Synthetic · Large Diffuse' }
]

export default function TopBar() {
  const bundle = useStudyOptional()
  const setUploadOpen = useStore((s) => s.setUploadOpen)
  const setDatasetsOpen = useStore((s) => s.setDatasetsOpen)
  const reset = useLiveStudy((s) => s.reset)
  const runSample = useLiveStudy((s) => s.runSample)

  const selectedStudyId = useWorkspaceStore((s) => s.selectedStudyId)
  const setSelectedStudyId = useWorkspaceStore((s) => s.setSelectedStudyId)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)

  const handleStudyChange = (studyId: string) => {
    setSelectedStudyId(studyId)
    if (studyId === 'demo_phantom') {
      reset()
    } else {
      runSample(studyId)
    }
  }

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-edge bg-panel px-4 py-2">
      {/* Brand & Logo */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-gradient-to-br from-sky-400 to-indigo-600 shadow-sm shadow-sky-500/30">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0b1017" strokeWidth={2.2} className="h-3.5 w-3.5">
            <path
              d="M12 4a4 4 0 00-4 4 3 3 0 00-1 5.8V16a3 3 0 003 3h4a3 3 0 003-3v-2.2A3 3 0 0016 8a4 4 0 00-4-4z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-[14px] font-semibold tracking-tight text-slate-100">
          NeuroScope<span className="text-sky-400"> 3D</span>
        </span>
        <span className="hidden rounded border border-edge/80 bg-panel-2 px-1.5 py-[1px] font-mono text-[9px] text-slate-500 xl:inline">
          Studio v0.2.0
        </span>
      </div>

      {/* Persistent Study Selector */}
      <div className="flex items-center gap-2 border-l border-edge/80 pl-4">
        <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">STUDY:</span>
        <select
          value={bundle?.mode === 'live' && bundle.study.caseId ? bundle.study.caseId.toLowerCase() : selectedStudyId}
          onChange={(e) => handleStudyChange(e.target.value)}
          className="rounded border border-edge bg-panel-2 px-2.5 py-1 text-[11.5px] font-medium text-slate-200 focus:border-sky-500 focus:outline-none"
        >
          {SAMPLES_LIST.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        {bundle && (
          <span className="hidden items-center gap-1.5 font-mono text-[10px] text-slate-400 lg:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full pulse-ring ${
                bundle.mode === 'live' ? 'bg-sky-400' : 'bg-emerald-400'
              }`}
            />
            {bundle.mode === 'live' ? 'LIVE BACKEND' : 'LOCAL PHANTOM'}
          </span>
        )}
      </div>

      {/* Persistent Model & Run Selector */}
      <div className="hidden items-center gap-1.5 rounded border border-edge/60 bg-panel-2/60 px-2 py-0.5 font-mono text-[10px] text-slate-400 md:flex">
        <span className="text-slate-500">RUN:</span>
        <span className="font-semibold text-slate-300">SegResNet (BraTS-18)</span>
        <span className="text-slate-600">·</span>
        <span className="text-sky-400">2-Pass TTA</span>
      </div>

      {/* Actions */}
      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={() => setDatasetsOpen(true)}
          className="hidden rounded border border-edge bg-panel-2 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-slate-100 sm:inline"
        >
          Datasets Gallery
        </button>

        <button
          onClick={() => setUploadOpen(true)}
          className="rounded border border-sky-500/50 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300 transition hover:bg-sky-500/20"
        >
          Upload case
        </button>

        <button
          onClick={() => bundle?.mode === 'live' && bundle.jobId && window.open(reportUrl(bundle.jobId), '_blank')}
          disabled={bundle?.mode !== 'live'}
          title={bundle?.mode === 'live' ? 'Open the provenance report' : 'Upload or run a real case to download full report'}
          className="rounded border border-edge px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Report
        </button>

        <button
          onClick={() => bundle?.mode === 'live' && bundle.jobId && window.open(exportBundleUrl(bundle.jobId), '_blank')}
          disabled={bundle?.mode !== 'live'}
          title={bundle?.mode === 'live' ? 'Download report + metadata + prediction NIfTI as a zip' : 'Upload or run a real case to export it'}
          className="rounded border border-edge px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export
        </button>

        <span
          className="flex h-7 w-7 items-center justify-center rounded-full border border-edge bg-panel-2 text-[10px] font-semibold text-slate-300 shadow-sm"
          title="Clinical Investigator Session"
        >
          CI
        </span>
      </div>
    </header>
  )
}
