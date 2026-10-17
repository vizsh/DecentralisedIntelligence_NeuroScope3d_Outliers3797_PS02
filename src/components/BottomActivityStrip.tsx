import { useStore } from '../state/store'
import { useStudyOptional } from '../state/study'
import { useWorkspaceStore } from '../state/workspaceStore'

export default function BottomActivityStrip() {
  const bundle = useStudyOptional()
  const voxel = useStore((s) => s.voxel)
  const tool = useStore((s) => s.tool)
  const activeSequence = useStore((s) => s.sequence)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const setAssistantOpen = useStore((s) => s.setAssistantOpen)

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const selectedStudyId = useWorkspaceStore((s) => s.selectedStudyId)
  const reviews = useWorkspaceStore((s) => s.reviews)

  const caseKey = (bundle?.study.caseId || selectedStudyId).toLowerCase()
  const review = reviews[caseKey]

  // Calculate world coordinates from voxel if spacing is known
  const spacing = bundle?.study.spacing || [1, 1, 1]
  const worldMm = [
    (voxel[0] * spacing[0]).toFixed(1),
    (voxel[1] * spacing[1]).toFixed(1),
    (voxel[2] * spacing[2]).toFixed(1)
  ]

  return (
    <footer className="flex shrink-0 items-center justify-between border-t border-edge/80 bg-panel px-3 py-1 font-mono text-[10px] text-slate-400">
      <div className="flex items-center gap-4">
        {/* Study indicator */}
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="font-semibold text-slate-200">
            {bundle?.study.caseId || selectedStudyId}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-sky-300">{activeSequence}</span>
        </div>

        {/* Spatial coordinates */}
        <div className="hidden sm:flex items-center gap-2 text-slate-400 border-l border-edge/80 pl-3">
          <span>Voxel: [{voxel.join(', ')}]</span>
          <span className="text-slate-600">|</span>
          <span>World: [{worldMm.join(', ')}] mm</span>
        </div>

        {/* Tool status */}
        <div className="hidden md:flex items-center gap-1.5 border-l border-edge/80 pl-3">
          <span className="text-slate-500">Tool:</span>
          <span className="text-slate-200 uppercase">{tool}</span>
        </div>

        {/* Engine & Execution Mode */}
        <div className="hidden lg:flex items-center gap-1.5 border-l border-edge/80 pl-3">
          <span className="text-slate-500">Engine:</span>
          {bundle?.liveMetadata?.execution_mode === 'model_inference' ? (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
              MONAI SegResNet (Inference)
            </span>
          ) : bundle?.liveMetadata?.execution_mode === 'heuristic_fallback' ? (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
              Heuristic Baseline
            </span>
          ) : (
            <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300">
              Synthetic Phantom
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* QC status */}
        {review && (
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${
              review.disposition === 'accepted'
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                : review.disposition === 'flagged'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                : 'bg-slate-500/10 text-slate-400 border border-edge'
            }`}
          >
            QC: {review.disposition}
          </span>
        )}

        <span className="hidden lg:inline text-slate-500">
          Workspace: <strong className="text-slate-300 uppercase">{activeWorkspace}</strong>
        </span>

        <button
          onClick={() => setAssistantOpen(true)}
          className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-300 hover:bg-sky-500/20"
          title="Open the tool copilot (clinician/trainee — explains this tool's own output, never a diagnosis)"
        >
          Assistant
        </button>

        <button
          onClick={() => setHelpOpen(true)}
          className="rounded border border-edge/60 bg-panel-2 px-1.5 py-0.5 text-slate-400 hover:text-slate-200"
          title="Open Help & Shortcuts"
        >
          ? Help
        </button>
      </div>
    </footer>
  )
}
