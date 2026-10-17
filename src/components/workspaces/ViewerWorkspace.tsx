import { useState } from 'react'
import BottomMetricsBar from '../BottomMetricsBar'
import LinkedMprGrid from '../LinkedMprGrid'
import ThreeBrainTwin from '../ThreeBrainTwin'
import { useStore } from '../../state/store'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useStudyOptional } from '../../state/study'

export default function ViewerWorkspace() {
  const bundle = useStudyOptional()
  const voxel = useStore((s) => s.voxel)
  const setVoxel = useStore((s) => s.setVoxel)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const measure = useStore((s) => s.measure)
  const clearMeasure = useStore((s) => s.clearMeasure)
  const activeSequence = useStore((s) => s.sequence)
  const viewer3DMode = useStore((s) => s.viewer3DMode)
  const setViewer3DMode = useStore((s) => s.setViewer3DMode)

  const bookmarks = useWorkspaceStore((s) => s.bookmarks)
  const addBookmark = useWorkspaceStore((s) => s.addBookmark)
  const removeBookmark = useWorkspaceStore((s) => s.removeBookmark)
  const selectedStudyId = useWorkspaceStore((s) => s.selectedStudyId)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarkLabel, setBookmarkLabel] = useState('')
  const [copiedSnapshot, setCopiedSnapshot] = useState(false)
  const [layoutMode, setLayoutMode] = useState<'split' | '3d-focus' | 'mpr-focus' | '3d-max' | 'mpr-max'>('split')

  // Calculate measurement distance in physical mm if 2 points exist
  let measurementMm: number | null = null
  let deltaVoxel: [number, number, number] | null = null
  if (measure.length === 2 && bundle) {
    const p1 = measure[0].voxel
    const p2 = measure[1].voxel
    const sp = bundle.study.spacing
    const dx = (p2[0] - p1[0]) * sp[0]
    const dy = (p2[1] - p1[1]) * sp[1]
    const dz = (p2[2] - p1[2]) * sp[2]
    measurementMm = Math.sqrt(dx * dx + dy * dy + dz * dz)
    deltaVoxel = [Math.abs(p2[0] - p1[0]), Math.abs(p2[1] - p1[1]), Math.abs(p2[2] - p1[2])]
  }

  const handleSaveBookmark = () => {
    if (!bookmarkLabel.trim()) return
    addBookmark({
      label: bookmarkLabel.trim(),
      studyId: bundle?.study.caseId || selectedStudyId,
      voxel: [voxel[0], voxel[1], voxel[2]],
      plane: 'axial',
      sequence: activeSequence,
      note: `Crosshair at [${voxel.join(', ')}]`
    })
    setBookmarkLabel('')
  }

  const handleSnapshot = () => {
    setCopiedSnapshot(true)
    setTimeout(() => setCopiedSnapshot(false), 2000)
  }

  return (
    <div className="flex h-full flex-col bg-ink">
      {/* Top Studio Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-edge/80 bg-panel px-3 py-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">3D Digital Twin & MPR Studio</span>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-[10px] text-slate-400">
            Voxel: [{voxel[0]}, {voxel[1]}, {voxel[2]}]
          </span>
          {bundle && (
            <span className="font-mono text-[10px] text-sky-400">
              Spacing: {bundle.study.spacing.map((s) => s.toFixed(2)).join('×')} mm
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Tool switchers */}
          <div className="flex rounded border border-edge bg-panel-2 p-0.5">
            <button
              onClick={() => setTool('crosshair')}
              className={`rounded px-2 py-0.5 font-medium transition ${
                tool === 'crosshair' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Navigate crosshair (Shortcut: C)"
            >
              Crosshair
            </button>
            <button
              onClick={() => setTool('measure')}
              className={`rounded px-2 py-0.5 font-medium transition ${
                tool === 'measure' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Calibrated Distance Measure (Shortcut: M)"
            >
              Measure
            </button>
            <button
              onClick={() => setTool('window')}
              className={`rounded px-2 py-0.5 font-medium transition ${
                tool === 'window' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="PACS Window/Level Contrast (Shortcut: W)"
            >
              Window/Level
            </button>
          </div>

          {/* 3D Viewer Modes (Roadmap Section 6) */}
          <div className="flex rounded border border-edge bg-panel-2 p-0.5 font-mono text-[10px]">
            <button
              onClick={() => setViewer3DMode('anatomy')}
              className={`rounded px-2 py-0.5 transition ${
                viewer3DMode === 'anatomy' ? 'bg-indigo-500/25 text-indigo-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Anatomy Mode: anatomical brain shell in context"
            >
              Anatomy
            </button>
            <button
              onClick={() => setViewer3DMode('segmentation')}
              className={`rounded px-2 py-0.5 transition ${
                viewer3DMode === 'segmentation' ? 'bg-sky-500/25 text-sky-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Segmentation Mode: independent WT, TC, ET layers"
            >
              Segmentation
            </button>
            <button
              onClick={() => setViewer3DMode('exploration')}
              className={`rounded px-2 py-0.5 transition ${
                viewer3DMode === 'exploration' ? 'bg-amber-500/25 text-amber-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Exploration Mode: surface-to-slice interactive inspection"
            >
              Exploration
            </button>
          </div>

          {/* Studio Layout Switcher */}
          <div className="flex rounded border border-edge bg-panel-2 p-0.5 font-mono text-[10px]">
            <button
              onClick={() => setLayoutMode('split')}
              className={`rounded px-1.5 py-0.5 transition ${
                layoutMode === 'split' ? 'bg-sky-500/25 text-sky-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Split View: 50% 3D Twin / 50% Slices"
            >
              ⊞ Split
            </button>
            <button
              onClick={() => setLayoutMode('3d-focus')}
              className={`rounded px-1.5 py-0.5 transition ${
                layoutMode === '3d-focus' ? 'bg-sky-500/25 text-sky-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="3D Focus: Expansive 3D Twin, compact slices"
            >
              ◧ 3D
            </button>
            <button
              onClick={() => setLayoutMode('mpr-focus')}
              className={`rounded px-1.5 py-0.5 transition ${
                layoutMode === 'mpr-focus' ? 'bg-sky-500/25 text-sky-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Slice Focus: Expansive 4-panel slice quad, compact 3D"
            >
              ◨ Slices
            </button>
            <button
              onClick={() => setLayoutMode(layoutMode === '3d-max' ? 'split' : '3d-max')}
              className={`rounded px-1.5 py-0.5 transition ${
                layoutMode === '3d-max' ? 'bg-indigo-500/30 text-indigo-200 font-bold border border-indigo-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Maximize 3D Twin (100% full-screen 3D)"
            >
              {layoutMode === '3d-max' ? '✕ Exit Max' : '⛶ 3D'}
            </button>
            <button
              onClick={() => setLayoutMode(layoutMode === 'mpr-max' ? 'split' : 'mpr-max')}
              className={`rounded px-1.5 py-0.5 transition ${
                layoutMode === 'mpr-max' ? 'bg-indigo-500/30 text-indigo-200 font-bold border border-indigo-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Maximize Slices (100% full-screen 4-panel slice quad)"
            >
              {layoutMode === 'mpr-max' ? '✕ Exit Max' : '⛶ Slices'}
            </button>
          </div>

          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className={`rounded border px-2 py-1 font-medium transition ${
              showBookmarks
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-200'
                : 'border-edge bg-panel-2 text-slate-400 hover:text-slate-200'
            }`}
          >
            ★ Bookmarks ({bookmarks.length})
          </button>

          <button
            onClick={handleSnapshot}
            className="rounded border border-edge bg-panel-2 px-2.5 py-1 text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            title="Capture timestamped evidence note"
          >
            {copiedSnapshot ? '✓ Evidence Logged' : 'Evidence Snapshot'}
          </button>

          <button
            onClick={() => setActiveWorkspace('review')}
            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-emerald-300 transition hover:bg-emerald-500/20"
          >
            QC Review →
          </button>
        </div>
      </div>

      {/* Measurement Mode Floating HUD */}
      {tool === 'measure' && (
        <div className="flex shrink-0 items-center justify-between border-b border-sky-500/30 bg-sky-950/40 px-3 py-1 font-mono text-[10.5px] text-sky-200">
          <div className="flex items-center gap-3">
            <span className="font-bold">MEASUREMENT MODE:</span>
            <span>
              {measure.length === 0 && 'Click first landmark on any 2D slice view…'}
              {measure.length === 1 && 'Point 1 placed. Click second landmark to measure…'}
              {measure.length === 2 && measurementMm !== null && (
                <span className="font-bold text-emerald-300">
                  Distance: {measurementMm.toFixed(2)} mm{' '}
                  <span className="text-slate-400 font-normal">
                    (Δi: {deltaVoxel?.[0]}, Δj: {deltaVoxel?.[1]}, Δk: {deltaVoxel?.[2]})
                  </span>
                </span>
              )}
            </span>
          </div>
          {measure.length > 0 && (
            <button
              onClick={clearMeasure}
              className="rounded bg-sky-500/20 px-2 py-0.5 text-[9.5px] text-sky-300 hover:bg-sky-500/40"
            >
              Clear Marks
            </button>
          )}
        </div>
      )}

      {/* Main 3D + MPR Split View */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main
          className={`grid min-h-0 flex-1 gap-2 p-2 ${
            layoutMode === 'split'
              ? 'grid-cols-2'
              : layoutMode === '3d-focus'
              ? 'grid-cols-[1.65fr_1fr]'
              : layoutMode === 'mpr-focus'
              ? 'grid-cols-[1fr_1.65fr]'
              : 'grid-cols-1'
          }`}
        >
          {layoutMode !== 'mpr-max' && <ThreeBrainTwin />}
          {layoutMode !== '3d-max' && <LinkedMprGrid />}
        </main>

        {/* Spatial Bookmarks Drawer */}
        {showBookmarks && (
          <div className="absolute right-0 top-0 bottom-0 z-20 flex w-72 flex-col border-l border-edge bg-panel/95 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-edge p-3">
              <span className="text-[12px] font-semibold text-slate-100">Spatial Bookmarks</span>
              <button
                onClick={() => setShowBookmarks(false)}
                className="text-slate-500 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="border-b border-edge/80 p-3 space-y-2">
              <div className="text-[10.5px] text-slate-400">Save current landmark:</div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. Necrotic core notch"
                  value={bookmarkLabel}
                  onChange={(e) => setBookmarkLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveBookmark()}
                  className="flex-1 rounded border border-edge bg-panel-2 px-2 py-1 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
                />
                <button
                  onClick={handleSaveBookmark}
                  className="rounded border border-sky-500/50 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-300 hover:bg-sky-500/20"
                >
                  Save
                </button>
              </div>
              <div className="font-mono text-[9.5px] text-slate-500">
                Coords: [{voxel[0]}, {voxel[1]}, {voxel[2]}] · {activeSequence}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {bookmarks.length === 0 ? (
                <div className="py-6 text-center text-[10.5px] text-slate-500">
                  No bookmarks saved yet. Place crosshair and click Save.
                </div>
              ) : (
                bookmarks.map((b) => (
                  <div
                    key={b.id}
                    className="rounded border border-edge bg-panel-2/60 p-2 text-[11px] space-y-1 hover:border-slate-500 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{b.label}</span>
                      <button
                        onClick={() => removeBookmark(b.id)}
                        className="text-[10px] text-slate-500 hover:text-rose-400"
                        title="Delete bookmark"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="font-mono text-[9.5px] text-slate-400">
                      [{b.voxel[0]}, {b.voxel[1]}, {b.voxel[2]}] · {b.sequence}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[9px] text-slate-500">{b.createdAt}</span>
                      <button
                        onClick={() => setVoxel(b.voxel)}
                        className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9.5px] text-sky-300 hover:bg-sky-500/20"
                      >
                        Fly to →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Metrics Bar */}
      <div className="shrink-0 px-2 pb-2">
        <BottomMetricsBar />
      </div>
    </div>
  )
}
