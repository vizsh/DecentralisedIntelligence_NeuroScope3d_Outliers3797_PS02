import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useStore } from '../../state/store'
import { ExternalLink, Play, Sparkles } from 'lucide-react'

export default function LandingWorkspace() {
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const setUploadOpen = useStore((s) => s.setUploadOpen)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NAVIGATE_WORKSPACE') {
        setActiveWorkspace(e.data.workspace || 'viewer')
      } else if (e.data?.type === 'OPEN_UPLOAD') {
        setUploadOpen(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [setActiveWorkspace, setUploadOpen])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#020617]">
      {/* HUD Quick Jump Toolbar */}
      <div className="absolute right-4 top-3 z-30 flex items-center gap-2">
        <a
          href="/landing.html"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-slate-950/85 px-3 py-1.5 font-mono text-[11px] text-cyan-300 shadow-lg backdrop-blur-md transition hover:border-cyan-400 hover:bg-slate-900"
          title="Open landing page in full dedicated browser tab"
        >
          <ExternalLink className="h-3 w-3" />
          <span>Full Tab</span>
        </a>
        <button
          onClick={() => setActiveWorkspace('viewer')}
          className="flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-gradient-to-r from-sky-500 to-blue-600 px-3.5 py-1.5 font-mono text-[11px] font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:brightness-110 active:scale-95"
        >
          <Play className="h-3 w-3 fill-slate-950" />
          <span>Launch 3D Studio</span>
        </button>
      </div>

      <iframe
        ref={iframeRef}
        src="/landing.html"
        title="Tumor Lens — Transparent Neural Journey"
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
      />
    </div>
  )
}
