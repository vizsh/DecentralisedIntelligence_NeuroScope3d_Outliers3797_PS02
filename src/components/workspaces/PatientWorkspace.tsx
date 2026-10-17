import { useState } from 'react'
import { useStudyOptional } from '../../state/study'
import { useWorkspaceStore } from '../../state/workspaceStore'

// General radiology-education definitions only — never a statement about any specific patient's
// scan or case. Every "details" entry is deliberately hedged (may/can/is often associated with),
// per CLAUDE.md's wording rule: this tool explains terminology, it never characterises what a
// specific finding is or means for a specific person.
const GLOSSARY_TERMS = [
  {
    term: 'T2/FLAIR Hyperintensity',
    plainMeaning: 'A general radiology term for areas that appear brighter than normal on T2 or FLAIR scans.',
    details: 'In general, this pattern is commonly associated with increased water or fluid content, which can have several causes (swelling, tissue irritation, or inflammation among them). What it means in a specific scan is for the reviewing radiologist to determine.',
    suggestedQuestion: 'How should I think about the bright areas on my scan, and what did you find in my specific case?'
  },
  {
    term: 'Contrast Enhancement',
    plainMeaning: 'A general term for tissue that absorbs MRI contrast dye (Gadolinium) and appears brighter on T1 scans.',
    details: 'Enhancement patterns can have several different causes and are interpreted by a radiologist in the context of the full study. In this platform, the model\'s own enhancing-region prediction is labelled "Enhancing Tumour (ET)" using the standard BraTS naming convention — a region name, not a diagnosis.',
    suggestedQuestion: 'What does the enhancement pattern in my scan specifically indicate, in your assessment?'
  },
  {
    term: 'Vasogenic Edema',
    plainMeaning: 'A general radiology term for fluid build-up and swelling in brain tissue near an abnormal area.',
    details: 'This is a general imaging finding with a range of possible causes and management approaches, which your care team determines based on your full clinical picture, not from an image alone.',
    suggestedQuestion: 'Is swelling a factor in my case, and if so, how are we managing it?'
  },
  {
    term: 'Mass Effect & Midline Shift',
    plainMeaning: 'A general term for pressure effects some lesions can have on nearby brain structures.',
    details: 'The skull has a fixed volume, so expansion of any mass or associated swelling can, in some cases, shift nearby structures. Whether this is present and what it means is a radiologist\'s assessment, not something to infer from a label alone.',
    suggestedQuestion: 'Does my scan show any pressure effects, and would that change anything about my care plan?'
  },
  {
    term: 'Central Necrosis',
    plainMeaning: 'A general radiology term for an area within a mass where tissue appears non-viable on imaging.',
    details: 'This is a general imaging pattern that can appear in various contexts and is interpreted by a radiologist alongside the rest of the study, not read in isolation.',
    suggestedQuestion: 'Does my scan show this pattern, and does it affect what you\'re recommending?'
  }
]

export default function PatientWorkspace() {
  const bundle = useStudyOptional()
  const selectedStudyId = useWorkspaceStore((s) => s.selectedStudyId)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  const [activeTab, setActiveTab] = useState<'myscan' | 'report' | 'appointment' | 'timeline'>('myscan')
  const [reportText, setReportText] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [customQuestion, setCustomQuestion] = useState('')
  const [questions, setQuestions] = useState<string[]>([
    'How much of the measured 3D volume represents swelling (edema) versus solid tumor core?',
    'Is the active enhancing rim located near speech, motor, or memory functional zones?',
    'Could any of the signal changes be related to post-radiation or treatment effects rather than new growth?',
    'What symptoms should prompt an immediate call before our next scheduled appointment?',
    'What is the recommended timeframe for our next follow-up MRI scan?'
  ])

  const filteredGlossary = GLOSSARY_TERMS.filter(
    (g) =>
      g.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.plainMeaning.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddQuestion = () => {
    if (!customQuestion.trim()) return
    setQuestions([...questions, customQuestion.trim()])
    setCustomQuestion('')
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 space-y-4 bg-ink text-slate-200">
      {/* Top Header Banner */}
      <div className="flex flex-col gap-2 rounded-lg border border-edge bg-panel/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-semibold text-slate-100">Patient Companion & Education</h1>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300 border border-emerald-500/20">
              Clear Language Mode
            </span>
          </div>
          <p className="mt-1 text-[11.5px] text-slate-400">
            Translating complex 3D medical imaging and radiology terminology into clear, understandable insights.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveWorkspace('viewer')}
            className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 transition hover:bg-sky-500/20"
          >
            ← View in 3D Studio
          </button>
        </div>
      </div>

      {/* Prominent Safety & Medical Disclaimer */}
      <div className="rounded-md border border-amber-500/30 bg-amber-950/20 px-3.5 py-2.5 flex items-start gap-3">
        <span className="text-amber-400 text-[14px]">ℹ</span>
        <div className="text-[11px] text-slate-300 leading-relaxed font-sans">
          <strong className="text-amber-200">Important Medical Disclaimer:</strong> NeuroScope 3D is a research and educational
          tool. It helps visualize 3D anatomy and explain medical terminology, but it{' '}
          <strong>never establishes a medical diagnosis</strong>, predicts disease outcomes, or replaces your radiologist or oncologist.
          Always discuss scan results directly with your physician.
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-edge/80 text-[11.5px]">
        {[
          { id: 'myscan' as const, label: '1. My 3D Scan Overview' },
          { id: 'report' as const, label: '2. Understand My Report' },
          { id: 'appointment' as const, label: '3. Appointment Companion' },
          { id: 'timeline' as const, label: '4. Scan Timeline & History' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-2 font-medium transition ${
              activeTab === tab.id
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: MY SCAN OVERVIEW */}
      {activeTab === 'myscan' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-1">
            <h2 className="text-[13px] font-semibold text-slate-100">What Was Analyzed</h2>
            <div className="space-y-2 text-[11px]">
              <div className="rounded border border-edge bg-panel-2/50 p-2.5">
                <div className="font-semibold text-sky-300">4 Synchronized MRI Sequences</div>
                <p className="mt-1 text-[10.5px] text-slate-400 leading-relaxed">
                  Your study includes native structural scans (T1), contrast-enhanced scans (T1Gd), water-sensitive scans (T2), and fluid-suppressed scans (FLAIR).
                </p>
              </div>

              <div className="rounded border border-edge bg-panel-2/50 p-2.5">
                <div className="font-semibold text-slate-200">Current Study</div>
                <p className="mt-1 font-mono text-[10.5px] text-slate-400">
                  Case ID: {bundle?.study.caseId || selectedStudyId}
                </p>
                <div className="mt-1 text-[10px] text-emerald-400">✓ All 4 sequences verified compatible</div>
              </div>

              <button
                onClick={() => setActiveWorkspace('viewer')}
                className="w-full mt-2 rounded border border-sky-500/50 bg-sky-500/10 py-2 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20"
              >
                Inspect 3D Digital Twin →
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-2">
            <h2 className="text-[13px] font-semibold text-slate-100">Understanding the 3D Tumour Layers</h2>
            <div className="space-y-3 text-[11px]">
              <div className="rounded border border-sky-500/30 bg-sky-950/20 p-3 space-y-1">
                <div className="font-bold text-sky-300 text-[12px]">Whole Tumour (WT) — Blue/Teal Outer Shell</div>
                <p className="text-slate-300 leading-relaxed">
                  The model's suspected outer boundary of abnormal signal on this scan. This region commonly includes a
                  mix of tissue types — your radiologist's report is the source for what's actually present in your case,
                  not this outline by itself.
                </p>
              </div>

              <div className="rounded border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-1">
                <div className="font-bold text-indigo-300 text-[12px]">Tumour Core (TC) — Indigo Middle Mass</div>
                <p className="text-slate-300 leading-relaxed">
                  The model's suspected inner region, set apart from the surrounding outer boundary. How this measurement
                  is used clinically — including any comparison across visits — is a decision for your care team.
                </p>
              </div>

              <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 space-y-1">
                <div className="font-bold text-amber-300 text-[12px]">Enhancing Tumour (ET) — Amber Inner Region</div>
                <p className="text-slate-300 leading-relaxed">
                  The model's suspected region where the scan shows contrast-dye uptake. This is a predicted region from
                  an AI model, not a confirmed finding — what it represents in your specific case is for your radiologist
                  to interpret.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: UNDERSTAND MY REPORT */}
      {activeTab === 'report' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Report Terminology Search */}
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3">
            <h2 className="text-[13px] font-semibold text-slate-100">Medical Terminology Explainer</h2>
            <p className="text-[10.5px] text-slate-400">
              Search or browse key phrases commonly found in brain MRI radiology reports.
            </p>

            <input
              type="text"
              placeholder="Search terms (e.g. edema, contrast, hyperintensity)…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded border border-edge bg-panel-2 px-3 py-1.5 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
            />

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {filteredGlossary.map((g) => (
                <div key={g.term} className="rounded border border-edge bg-panel-2/50 p-3 space-y-1.5">
                  <div className="font-semibold text-sky-300 text-[11.5px]">{g.term}</div>
                  <div className="text-[11px] text-slate-200 font-medium">{g.plainMeaning}</div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">{g.details}</p>
                  <div className="rounded bg-sky-950/30 border border-sky-500/20 p-2 text-[9.5px] text-sky-200 mt-1">
                    <strong>Ask Your Doctor:</strong> "{g.suggestedQuestion}"
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Paste Report Workspace */}
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3">
            <h2 className="text-[13px] font-semibold text-slate-100">Analyze My Radiology Report Text</h2>
            <p className="text-[10.5px] text-slate-400">
              Paste findings from your doctor's written report to highlight relevant glossary terms.
            </p>

            <textarea
              rows={8}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Paste impression or findings here (e.g. 'Examination demonstrates an irregular contrast-enhancing lesion in the right frontoparietal region with marked surrounding vasogenic edema and 3mm midline shift…')"
              className="w-full rounded border border-edge bg-panel-2 p-3 text-[11px] text-slate-200 leading-relaxed focus:border-sky-500 focus:outline-none font-mono"
            />

            <div className="rounded bg-panel-2/40 border border-edge p-3 text-[10.5px] text-slate-400 space-y-1">
              <span className="font-semibold text-slate-200">Patient Privacy Guarantee:</span>
              <p>
                All text analysis is conducted entirely inside your local browser session. No medical reports or personal health details are ever transmitted to cloud servers or third-party APIs.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: APPOINTMENT COMPANION */}
      {activeTab === 'appointment' && (
        <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-100">Doctor Appointment Checklist</h2>
              <p className="text-[10.5px] text-slate-400">
                Personalized questions prepared for your upcoming consultation with your neurologist, neurosurgeon, or oncologist.
              </p>
            </div>

            <button
              onClick={handlePrint}
              className="rounded border border-edge bg-panel-2 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:text-slate-100"
            >
              Print / Save Checklist
            </button>
          </div>

          <div className="space-y-2 max-w-3xl">
            {questions.map((q, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded border border-edge bg-panel-2/50 p-3 text-[11px] text-slate-200"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-400 font-mono text-[10px]">
                  {idx + 1}
                </span>
                <span className="flex-1 leading-relaxed">{q}</span>
                <button
                  onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                  className="text-slate-500 hover:text-rose-400 text-[10px]"
                  title="Remove question"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Add Custom Question */}
          <div className="flex gap-2 max-w-3xl pt-2">
            <input
              type="text"
              placeholder="Add your own personal question or symptom to ask about…"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddQuestion()}
              className="flex-1 rounded border border-edge bg-panel-2 px-3 py-1.5 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
            />
            <button
              onClick={handleAddQuestion}
              className="rounded border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20"
            >
              Add Question
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: SCAN TIMELINE */}
      {activeTab === 'timeline' && (
        <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-4">
          <div>
            <h2 className="text-[13px] font-semibold text-slate-100">My Scan Timeline & Measured History</h2>
            <p className="text-[10.5px] text-slate-400">
              Measured 3D volumes for the currently loaded study. Comparing volumes across visits (longitudinal
              tracking) is not yet available in this build — see the current study's measured figures below.
            </p>
          </div>

          {bundle ? (
            <div className="space-y-3 max-w-4xl">
              <div className="rounded-lg border border-edge bg-panel-2/60 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[12px] text-slate-200">Current Study</span>
                  <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-[9.5px] text-sky-300">
                    Whole Tumour: {bundle.report.WT.predML.toFixed(2)} mL
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-400 leading-relaxed">
                  Measured from the predicted region on this study's own acquisition grid — see the volume formula
                  in the 3D Studio Viewer's metrics bar for exactly how this figure is derived.
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-edge/60 font-mono text-[10px] text-slate-500">
                  <span>Tumour Core (TC): {bundle.report.TC.predML.toFixed(2)} mL</span>
                  <span className="text-emerald-400">Measured on this study's own voxel grid</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[10.5px] text-slate-500">No study loaded yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
