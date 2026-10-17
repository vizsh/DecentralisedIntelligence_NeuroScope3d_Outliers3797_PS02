import AssistantPanel from './components/AssistantPanel'
import BottomActivityStrip from './components/BottomActivityStrip'
import DatasetsPanel from './components/DatasetsPanel'
import DisclaimerBanner from './components/DisclaimerBanner'
import FormulaSheetModal from './components/FormulaSheetModal'
import HelpPanel from './components/HelpPanel'
import NavigationSidebar from './components/NavigationSidebar'
import TopBar from './components/TopBar'
import UploadPanel from './components/UploadPanel'
import CommandCentreWorkspace from './components/workspaces/CommandCentreWorkspace'
import NeuroLearnWorkspace from './components/workspaces/NeuroLearnWorkspace'
import PatientWorkspace from './components/workspaces/PatientWorkspace'
import ResearchGraphWorkspace from './components/workspaces/ResearchGraphWorkspace'
import ResearchLabWorkspace from './components/workspaces/ResearchLabWorkspace'
import ReviewWorkspace from './components/workspaces/ReviewWorkspace'
import TrustExplainabilityWorkspace from './components/workspaces/TrustExplainabilityWorkspace'
import ViewerWorkspace from './components/workspaces/ViewerWorkspace'
import { useShortcuts } from './lib/useShortcuts'
import { useStore } from './state/store'
import { StudyProvider } from './state/study'
import { useWorkspaceStore } from './state/workspaceStore'

function Loading({ stage }: { stage: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-ink">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-2 border-edge" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-sky-400" />
      </div>
      <div className="text-center">
        <div className="text-[13px] font-medium text-slate-200">NeuroScope 3D</div>
        <div className="mt-1 font-mono text-[11px] text-slate-500">{stage}…</div>
      </div>
      <p className="max-w-sm text-center text-[10.5px] leading-relaxed text-slate-600">
        Building the digital twin: isosurfaces are extracted in world millimetre space from the
        study affine, so geometry, slices and volumes share one coordinate system.
      </p>
    </div>
  )
}

function Shortcuts() {
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  useShortcuts(() => setHelpOpen(true))
  return null
}

export default function App() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink select-none font-sans">
      <Shortcuts />
      <TopBar />
      <DisclaimerBanner />
      <UploadPanel />
      <DatasetsPanel />
      <HelpPanel />
      <AssistantPanel />
      <FormulaSheetModal />

      {/* Main Workspace Layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavigationSidebar />

        <div
          key={activeWorkspace}
          className="animate-fade-in flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {activeWorkspace === 'dashboard' && <CommandCentreWorkspace />}

          {activeWorkspace === 'viewer' && (
            <StudyProvider fallback={(stage) => <Loading stage={stage} />}>
              <ViewerWorkspace />
            </StudyProvider>
          )}

          {activeWorkspace === 'review' && (
            <StudyProvider fallback={(stage) => <Loading stage={stage} />}>
              <ReviewWorkspace />
            </StudyProvider>
          )}

          {activeWorkspace === 'research' && <ResearchLabWorkspace />}

          {activeWorkspace === 'trust' && (
            <StudyProvider fallback={(stage) => <Loading stage={stage} />}>
              <TrustExplainabilityWorkspace />
            </StudyProvider>
          )}

          {activeWorkspace === 'patient' && <PatientWorkspace />}

          {activeWorkspace === 'learn' && <NeuroLearnWorkspace />}

          {activeWorkspace === 'graph' && <ResearchGraphWorkspace />}

          <BottomActivityStrip />
        </div>
      </div>
    </div>
  )
}
