import {
  LayoutDashboard,
  Box,
  Activity,
  CheckCircle2,
  FlaskConical,
  ShieldCheck,
  HeartHandshake,
  GraduationCap,
  Network,
  Menu,
  Sparkles,
} from 'lucide-react'
import { useWorkspaceStore, type WorkspaceKey } from '../state/workspaceStore'

interface NavItem {
  key: WorkspaceKey
  number: string
  label: string
  shortLabel: string
  badge?: string
  Icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    number: '01',
    label: 'Command Centre',
    shortLabel: 'Overview',
    Icon: LayoutDashboard,
  },
  {
    key: 'viewer',
    number: '02',
    label: '3D Studio Viewer',
    shortLabel: '3D Studio',
    badge: '3D',
    Icon: Box,
  },
  {
    key: 'deep-twin',
    number: '03',
    label: 'Deep Neuro-Twin Atlas',
    shortLabel: 'Risk Atlas',
    badge: 'VASCULAR',
    Icon: Activity,
  },
  {
    key: 'review',
    number: '04',
    label: 'Segmentation Review',
    shortLabel: 'Review',
    badge: 'QC',
    Icon: CheckCircle2,
  },
  {
    key: 'research',
    number: '05',
    label: 'Research Lab',
    shortLabel: 'Cohort',
    badge: '10 Cases',
    Icon: FlaskConical,
  },
  {
    key: 'trust',
    number: '06',
    label: 'Trust & Explainability',
    shortLabel: 'Trust',
    badge: 'Flip-TTA',
    Icon: ShieldCheck,
  },
  {
    key: 'patient',
    number: '07',
    label: 'Patient Companion',
    shortLabel: 'Patient',
    badge: 'Clear',
    Icon: HeartHandshake,
  },
  {
    key: 'learn',
    number: '08',
    label: 'NeuroLearn Academy',
    shortLabel: 'Learn',
    Icon: GraduationCap,
  },
  {
    key: 'graph',
    number: '09',
    label: 'Research Graph',
    shortLabel: 'Graph',
    badge: 'DAG',
    Icon: Network,
  },
]

export default function NavigationSidebar() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-panel/90 text-slate-300">
      <div className="flex items-center gap-2 border-b border-edge/80 px-4 py-3">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-sky-500/10 text-sky-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </span>
        <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
          Workspaces
        </span>
        <span className="ml-auto rounded border border-edge/60 bg-panel-2 px-1 py-0.5 font-mono text-[9px] text-slate-500">
          v0.2.0
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activeWorkspace === item.key
          return (
            <button
              key={item.key}
              onClick={() => setActiveWorkspace(item.key)}
              className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11.5px] transition-all ${
                isActive
                  ? 'border border-sky-500/30 bg-sky-500/10 font-medium text-sky-200 shadow-sm shadow-sky-950/40'
                  : 'border border-transparent text-slate-400 hover:border-edge/50 hover:bg-white/[0.03] hover:text-slate-200'
              }`}
            >
              <span
                className={`font-mono text-[9px] transition-colors ${
                  isActive ? 'text-sky-400 font-bold' : 'text-slate-600 group-hover:text-slate-400'
                }`}
              >
                {item.number}
              </span>

              <span
                className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                  isActive
                    ? 'text-sky-300'
                    : 'text-slate-500 group-hover:text-slate-300'
                }`}
              >
                <item.Icon className="h-4 w-4" />
              </span>

              <span className="truncate">{item.label}</span>

              {item.badge && (
                <span
                  className={`ml-auto shrink-0 rounded px-1.5 py-[1px] font-mono text-[8.5px] font-medium ${
                    isActive
                      ? 'border border-sky-400/30 bg-sky-400/20 text-sky-200'
                      : 'border border-edge/60 bg-panel-2 text-slate-500'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* System Status Footnote */}
      <div className="border-t border-edge/70 p-3">
        <div className="rounded-md border border-edge/60 bg-panel-2/40 p-2.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-medium text-slate-300">MONAI SegResNet</span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Pinned
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-slate-500">
            <span>Inference: CPU/T4</span>
            <span className="text-slate-400">17/17 tests pass</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-edge/40 pt-1.5 text-[9px] text-slate-500">
            <span>Storage: Local Zero-Cloud</span>
            <span className="text-slate-400">CC-BY-SA 4.0</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
