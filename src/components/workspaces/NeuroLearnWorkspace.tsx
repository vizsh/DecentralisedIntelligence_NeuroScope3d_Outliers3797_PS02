import { useState } from 'react'
import { useWorkspaceStore } from '../../state/workspaceStore'

export default function NeuroLearnWorkspace() {
  const activeLearnLab = useWorkspaceStore((s) => s.activeLearnLab)
  const setActiveLearnLab = useWorkspaceStore((s) => s.setActiveLearnLab)
  const completedLabs = useWorkspaceStore((s) => s.completedLabs)
  const setLabCompleted = useWorkspaceStore((s) => s.setLabCompleted)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  // Interactive Lab 1: MRI Sequences State
  const [selectedSequence, setSelectedSequence] = useState<'T1' | 'T1Gd' | 'T2' | 'FLAIR'>('T1Gd')

  // Interactive Lab 2: BraTS Labels Boolean Algebra State
  const [activeCodes, setActiveCodes] = useState<{ ncr: boolean; ed: boolean; et: boolean }>({
    ncr: true,
    ed: true,
    et: true
  })

  // Interactive Lab 3: Geometry & Anisotropy Simulator State
  const [sliceThickness, setSliceThickness] = useState<number>(1.0) // 1mm to 6mm
  const [simulatedVolume, setSimulatedVolume] = useState<number>(42.15)

  // Interactive Lab 4: Failure Modes State
  const [selectedFailureCase, setSelectedFailureCase] = useState<string>('infiltrative')

  // Interactive Lab 5: Voxel Quest Challenge State
  const [questStep, setQuestStep] = useState(0)
  const [questScore, setQuestScore] = useState(0)
  const [questAnswer, setQuestAnswer] = useState<number | null>(null)
  const [questSubmitted, setQuestSubmitted] = useState(false)

  const QUEST_QUESTIONS = [
    {
      question: 'A scan has 45,000 WT voxels with spacing [0.5 mm, 0.5 mm, 2.0 mm]. What is the true physical volume in mL?',
      options: ['45.00 mL (1mm isotropic assumption)', '22.50 mL (45,000 × 0.5 × 0.5 × 2.0 / 1000)', '90.00 mL', '11.25 mL'],
      correct: 1,
      explanation: 'Voxel volume = 0.5 × 0.5 × 2.0 = 0.5 mm³. 45,000 voxels × 0.5 mm³ = 22,500 mm³ = 22.50 mL.',
    },
    {
      question: 'Which Boolean expression satisfies the official BraTS hierarchical nesting contract for Whole Tumor (WT)?',
      options: ['WT = ED only', 'WT = NCR ∪ ED ∪ ET (Necrotic Core + Edema + Enhancing Tumor)', 'WT = TC ∩ ET', 'WT = ET only'],
      correct: 1,
      explanation: 'BraTS defines WT as the union of all pathological tumor sub-compartments: necrotic core (1), peritumoral edema (2), and enhancing rim (4).',
    },
    {
      question: 'If flip-TTA ensemble standard deviation σ > 0.40 at a lesion border, what does this mathematically prove?',
      options: [
        'It proves with 95% certainty that the prediction is wrong',
        'It measures model prediction variance under spatial transformation, indicating boundary ambiguity without being a ground truth proof',
        'It proves that the patient moved during scanning',
        'It proves the model weights are corrupted',
      ],
      correct: 1,
      explanation: 'TTA disagreement is an uncalibrated empirical stability metric, not a posterior error probability. Low uncertainty does not guarantee correctness, and high uncertainty is an investigation trigger.',
    },
    {
      question: 'In standard radiological RAS+ coordinate space, which orthogonal view has Left-Right on X and Anterior-Posterior on Y?',
      options: ['Sagittal plane (slices along X)', 'Coronal plane (slices along Y)', 'Axial plane (slices along Z: from Inferior to Superior)', 'Oblique reformatted plane'],
      correct: 2,
      explanation: 'The Axial plane traverses the neuroanatomy horizontally with X representing Left-Right, Y representing Anterior-Posterior, and Z indexing slices along the Inferior-Superior axis.',
    },
  ]

  const labs = [
    { id: 'sequences', title: '1. MRI Modalities & Contrast', desc: 'T1, T1Gd, T2, FLAIR physical mechanisms' },
    { id: 'labels', title: '2. BraTS Label Dissection', desc: 'NCR, ED, ET Boolean composition into WT & TC' },
    { id: 'geometry', title: '3. Geometry & Anisotropy', desc: 'Voxel spacing, slice thickness, partial volume effects' },
    { id: 'failures', title: '4. Failure Modes & Edge Cases', desc: 'Boundary ambiguity and uncertainty detection' },
    { id: 'quest', title: '5. Voxel Quest Challenge', desc: 'Spatial reasoning, coordinate mapping, and volumetrics game' },
  ] as const

  const handleGeometryChange = (val: number) => {
    setSliceThickness(val)
    // Partial volume effect causes volume estimate expansion / distortion
    const distortionFactor = 1 + (val - 1) * 0.045
    setSimulatedVolume(Number((42.15 * distortionFactor).toFixed(2)))
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 space-y-4 bg-ink text-slate-200">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 rounded-lg border border-edge bg-panel/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-semibold text-slate-100">NeuroLearn Interactive Academy</h1>
            <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-300 border border-sky-500/20">
              Teaching Environment
            </span>
          </div>
          <p className="mt-1 text-[11.5px] text-slate-400">
            Guided curriculum for researchers, clinicians, and students to master MRI physics, segmentation labels, and AI failure modes.
          </p>
        </div>

        <button
          onClick={() => setActiveWorkspace('viewer')}
          className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 transition hover:bg-sky-500/20"
        >
          Apply in 3D Studio →
        </button>
      </div>

      {/* Lab Nav Bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {labs.map((lab) => {
          const isActive = activeLearnLab === lab.id
          const isDone = completedLabs[lab.id]
          return (
            <button
              key={lab.id}
              onClick={() => setActiveLearnLab(lab.id)}
              className={`rounded-lg border p-3 text-left transition ${
                isActive
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
                  : 'border-edge bg-panel-2/50 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold">{lab.title}</span>
                {isDone && <span className="text-[10px] text-emerald-400 font-mono">✓ Done</span>}
              </div>
              <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">{lab.desc}</p>
            </button>
          )
        })}
      </div>

      {/* LAB 1: MRI MODALITIES & CONTRAST */}
      {activeLearnLab === 'sequences' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-1">
            <h2 className="text-[13px] font-semibold text-slate-100">Select MRI Modality</h2>
            <div className="space-y-2">
              {[
                { id: 'T1' as const, name: 'T1-Weighted (Native)', signal: 'Anatomical Boundaries', csf: 'Dark (hypointense)' },
                { id: 'T1Gd' as const, name: 'T1-Gd (Post-Contrast)', signal: 'Active Enhancing Rim', csf: 'Dark (hypointense)' },
                { id: 'T2' as const, name: 'T2-Weighted', signal: 'Structural Lesion Extent', csf: 'Bright (hyperintense)' },
                { id: 'FLAIR' as const, name: 'FLAIR (Fluid Attenuated)', signal: 'Peritumoral Edema / Swelling', csf: 'Suppressed (dark)' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedSequence(m.id)}
                  className={`w-full rounded border p-2.5 text-left transition ${
                    selectedSequence === m.id
                      ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                      : 'border-edge bg-panel-2/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center text-[11.5px] font-bold">
                    <span>{m.id}</span>
                    <span className="font-normal text-[10px] text-slate-400">{m.name}</span>
                  </div>
                  <div className="mt-1 font-mono text-[9.5px] text-slate-400">Target: {m.signal}</div>
                  <div className="font-mono text-[9px] text-slate-500">CSF Fluid: {m.csf}</div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setLabCompleted('sequences')}
              className="w-full mt-2 rounded border border-emerald-500/50 bg-emerald-500/10 py-1.5 font-mono text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              ✓ Mark Module 1 Complete
            </button>
          </div>

          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-2">
            <h2 className="text-[13px] font-semibold text-slate-100">Biophysical Imaging Significance: {selectedSequence}</h2>
            <div className="rounded-md border border-edge/80 bg-panel-2/60 p-4 space-y-3">
              {selectedSequence === 'T1' && (
                <>
                  <h3 className="font-semibold text-sky-300 text-[12px]">T1 Native: Morphological Baseline</h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    T1-weighted relaxation showcases baseline brain anatomy. Gray and white matter boundaries are crisply differentiated.
                    In glioma imaging, non-contrast T1 establishes normal parenchyma landmarks, midline shift, and ventricular compression.
                  </p>
                  <div className="font-mono text-[10px] text-slate-400 border-l-2 border-sky-400 pl-3 py-1">
                    Tissue Rule: Fat = Bright, Water/CSF = Dark, Normal Brain Tissue = Intermediate Gray.
                  </div>
                </>
              )}
              {selectedSequence === 'T1Gd' && (
                <>
                  <h3 className="font-semibold text-amber-300 text-[12px]">T1Gd: Blood-Brain Barrier Breakdown</h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Gadolinium chelates cannot cross an intact blood-brain barrier (BBB). In high-grade gliomas, neo-angiogenesis produces leaky,
                    fenestrated capillaries. Contrast pools extravascularly, brightly highlighting the viable, proliferating tumor rim (Enhancing Tumor - ET).
                  </p>
                  <div className="font-mono text-[10px] text-slate-400 border-l-2 border-amber-400 pl-3 py-1">
                    Tissue Rule: Active tumor capillaries leak gadolinium = intense bright hyperenhancement around dark necrotic core.
                  </div>
                </>
              )}
              {selectedSequence === 'T2' && (
                <>
                  <h3 className="font-semibold text-indigo-300 text-[12px]">T2-Weighted: Lesion Architecture & Fluid</h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    T2 highlights water content. Both necrotic tumor tissue and vasogenic edema produce prolonged T2 relaxation times (bright signal).
                    T2 provides crucial structural context surrounding the entire neoplastic mass.
                  </p>
                  <div className="font-mono text-[10px] text-slate-400 border-l-2 border-indigo-400 pl-3 py-1">
                    Tissue Rule: Free fluid (CSF in ventricles) and interstitial edema fluid are both hyperintense (white).
                  </div>
                </>
              )}
              {selectedSequence === 'FLAIR' && (
                <>
                  <h3 className="font-semibold text-emerald-300 text-[12px]">FLAIR: Fluid-Attenuated Inversion Recovery</h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    FLAIR suppresses free ventricular fluid signal (CSF turns black) while keeping pathological interstitial fluid hyperintense.
                    This makes peritumoral edema conspicuous without being masked by adjacent ventricular or sulcal CSF.
                  </p>
                  <div className="font-mono text-[10px] text-slate-400 border-l-2 border-emerald-400 pl-3 py-1">
                    Tissue Rule: Free CSF is inverted and nullified; only vasogenic edema and infiltrative tumor tissue remain brightly visible.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LAB 2: BRATS LABELS LAB */}
      {activeLearnLab === 'labels' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-1">
            <h2 className="text-[13px] font-semibold text-slate-100">Toggle Tissue Components</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2 rounded border border-edge bg-panel-2/50 p-2.5 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeCodes.ncr}
                  onChange={(e) => setActiveCodes({ ...activeCodes, ncr: e.target.checked })}
                  className="accent-indigo-500"
                />
                <div>
                  <span className="font-bold text-indigo-300">NCR (Label 1)</span>
                  <span className="block text-[9.5px] text-slate-500">Necrotic / Non-enhancing Core</span>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded border border-edge bg-panel-2/50 p-2.5 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeCodes.ed}
                  onChange={(e) => setActiveCodes({ ...activeCodes, ed: e.target.checked })}
                  className="accent-sky-500"
                />
                <div>
                  <span className="font-bold text-sky-300">ED (Label 2)</span>
                  <span className="block text-[9.5px] text-slate-500">Peritumoral Vasogenic Edema</span>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded border border-edge bg-panel-2/50 p-2.5 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeCodes.et}
                  onChange={(e) => setActiveCodes({ ...activeCodes, et: e.target.checked })}
                  className="accent-amber-500"
                />
                <div>
                  <span className="font-bold text-amber-300">ET (Label 4)</span>
                  <span className="block text-[9.5px] text-slate-500">Active Enhancing Tumor</span>
                </div>
              </label>
            </div>

            <button
              onClick={() => setLabCompleted('labels')}
              className="w-full mt-2 rounded border border-emerald-500/50 bg-emerald-500/10 py-1.5 font-mono text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              ✓ Mark Module 2 Complete
            </button>
          </div>

          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-2">
            <h2 className="text-[13px] font-semibold text-slate-100">BraTS Nested Region Composition</h2>
            <div className="rounded-md border border-edge/80 bg-panel-2/60 p-4 space-y-3 font-mono text-[11px]">
              <div className="border-b border-edge/60 pb-2">
                <span className="text-slate-400">Whole Tumor (WT): </span>
                <span className="text-sky-300 font-bold">
                  {activeCodes.ncr || activeCodes.ed || activeCodes.et ? 'ACTIVE' : 'EMPTY'}
                </span>
                <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                  Formula: WT = NCR ∪ ED ∪ ET · The total abnormal volume including peripheral swelling.
                </p>
              </div>

              <div className="border-b border-edge/60 pb-2">
                <span className="text-slate-400">Tumor Core (TC): </span>
                <span className="text-indigo-300 font-bold">
                  {activeCodes.ncr || activeCodes.et ? 'ACTIVE' : 'EMPTY'}
                </span>
                <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                  Formula: TC = NCR ∪ ET · The solid tumor bulk, omitting the surrounding edema.
                </p>
              </div>

              <div>
                <span className="text-slate-400">Enhancing Tumor (ET): </span>
                <span className="text-amber-300 font-bold">
                  {activeCodes.et ? 'ACTIVE' : 'EMPTY'}
                </span>
                <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                  Formula: ET = ET (Label 4) · The viable vascularized rim requiring contrast.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LAB 3: GEOMETRY & ANISOTROPY LAB */}
      {activeLearnLab === 'geometry' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-4 lg:col-span-1">
            <h2 className="text-[13px] font-semibold text-slate-100">Anisotropic Spacing Simulator</h2>
            <p className="text-[10.5px] text-slate-400">
              Drag slice thickness slider to observe partial volume effects on volumetric measurement.
            </p>

            <div className="space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Axial Slice Thickness (Δz):</span>
                <span className="font-mono text-sky-300 font-bold">{sliceThickness.toFixed(1)} mm</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="6.0"
                step="0.5"
                value={sliceThickness}
                onChange={(e) => handleGeometryChange(parseFloat(e.target.value))}
                className="w-full accent-sky-400"
              />
              <div className="flex justify-between font-mono text-[9px] text-slate-500">
                <span>1.0 mm (Isotropic)</span>
                <span>3.0 mm (Standard)</span>
                <span>6.0 mm (Thick)</span>
              </div>
            </div>

            <button
              onClick={() => setLabCompleted('geometry')}
              className="w-full mt-2 rounded border border-emerald-500/50 bg-emerald-500/10 py-1.5 font-mono text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              ✓ Mark Module 3 Complete
            </button>
          </div>

          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-2">
            <h2 className="text-[13px] font-semibold text-slate-100">Physical Volume Distortion Impact</h2>
            <div className="rounded-md border border-edge/80 bg-panel-2/60 p-4 space-y-3">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-400">Ground Truth Isotropic Volume:</span>
                <span className="text-slate-200">42.15 mL</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-400">Estimated Volume at {sliceThickness.toFixed(1)}mm:</span>
                <span className={`font-bold ${sliceThickness > 2 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {simulatedVolume} mL ({(((simulatedVolume - 42.15) / 42.15) * 100).toFixed(1)}% error)
                </span>
              </div>

              <div className="text-[10.5px] text-slate-400 font-sans leading-relaxed pt-2 border-t border-edge/60">
                <strong>Why this occurs:</strong> Thick slices cause <em>partial volume averaging</em>. Voxels containing
                both tumor edge and healthy cortex are averaged into a single intermediate intensity. This expands boundary
                blur and causes systematic volume overestimation on stair-stepped reconstructions.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LAB 4: FAILURE MODES LAB */}
      {activeLearnLab === 'failures' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-1">
            <h2 className="text-[13px] font-semibold text-slate-100">Select Failure Case Study</h2>
            <div className="space-y-2">
              {[
                { id: 'infiltrative', title: '1. Infiltrative Edge Under-call', metric: 'ET FN Miss' },
                { id: 'edema', title: '2. Cortical Edema Over-call', metric: 'WT FP Spill' },
                { id: 'skullstrip', title: '3. Skull-Strip Edge Leak', metric: 'Boundary Artifact' }
              ].map((cs) => (
                <button
                  key={cs.id}
                  onClick={() => setSelectedFailureCase(cs.id)}
                  className={`w-full rounded border p-2.5 text-left transition ${
                    selectedFailureCase === cs.id
                      ? 'border-sky-500 bg-sky-500/20 text-sky-200 font-bold'
                      : 'border-edge bg-panel-2/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[11.5px]">{cs.title}</div>
                  <div className="font-mono text-[9.5px] text-slate-500">{cs.metric}</div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setLabCompleted('failures')}
              className="w-full mt-2 rounded border border-emerald-500/50 bg-emerald-500/10 py-1.5 font-mono text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              ✓ Complete Full Curriculum
            </button>
          </div>

          <div className="rounded-lg border border-edge bg-panel/60 p-4 space-y-3 lg:col-span-2">
            <h2 className="text-[13px] font-semibold text-slate-100">Failure Mode Analysis & Detection</h2>
            <div className="rounded-md border border-edge/80 bg-panel-2/60 p-4 space-y-3 text-[11px] text-slate-300 leading-relaxed font-sans">
              {selectedFailureCase === 'infiltrative' && (
                <>
                  <h3 className="font-semibold text-rose-300">Infiltrative Enhancing Rim Under-Prediction</h3>
                  <p>
                    Where tumor cells infiltrate without dense neo-vascularization, gadolinium uptake is subtle.
                    The standard 0.5 sigmoid threshold classifies these voxels as background.
                  </p>
                  <div className="font-mono text-[10px] text-sky-300 bg-sky-950/30 p-2.5 rounded border border-sky-500/30">
                    <strong>Trust Layer Catch:</strong> Flip-TTA standard deviation (σ) is elevated (&gt; 0.40) exactly along this border,
                    alerting the clinician to ambiguity even when the raw binary mask omits the region.
                  </div>
                </>
              )}
              {selectedFailureCase === 'edema' && (
                <>
                  <h3 className="font-semibold text-amber-300">Vasogenic Edema vs CSF Cortical Spill</h3>
                  <p>
                    FLAIR hyperintensity in cortical sulci due to CSF pulsation or partial volume can mimic edema,
                    leading the model to over-segment WT into normal cortex.
                  </p>
                  <div className="font-mono text-[10px] text-amber-300 bg-amber-950/30 p-2.5 rounded border border-amber-500/30">
                    <strong>Trust Layer Catch:</strong> 26-connectivity analysis flags a secondary detached component
                    with volume under 0.5 mL, separating it from the primary mass.
                  </div>
                </>
              )}
              {selectedFailureCase === 'skullstrip' && (
                <>
                  <h3 className="font-semibold text-purple-300">Skull-Strip Residual Artifact</h3>
                  <p>
                    If skull-stripping leaves fat or bone marrow fragments on T1, models trained on clean BraTS cases
                    can predict false tumor islands at the calvarium boundary.
                  </p>
                  <div className="font-mono text-[10px] text-purple-300 bg-purple-950/30 p-2.5 rounded border border-purple-500/30">
                    <strong>Trust Layer Catch:</strong> Ingestion validation check #5 (skull-strip air attenuation)
                    flags non-brain peripheral intensities before segmentation runs.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LAB 5: VOXEL QUEST SPATIAL CHALLENGE */}
      {activeLearnLab === 'quest' && (
        <div className="rounded-lg border border-edge bg-panel/70 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-edge/60 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 border border-amber-500/20">
                  Interactive Quest
                </span>
                <h2 className="text-[14px] font-semibold text-slate-100">
                  Spatial Coordinate & QC Proficiency Challenge
                </h2>
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                Test and certify your intuition of 3D NIfTI affines, physical millimeters, and BraTS Boolean logic.
              </p>
            </div>
            <div className="text-right font-mono">
              <span className="text-[10px] text-slate-500">Score: </span>
              <span className="text-[13px] font-bold text-amber-300">
                {questScore} / {QUEST_QUESTIONS.length}
              </span>
            </div>
          </div>

          {questStep < QUEST_QUESTIONS.length ? (
            <div className="space-y-4">
              <div className="rounded-md border border-edge bg-panel-2/60 p-4">
                <span className="font-mono text-[10px] font-semibold text-sky-400">
                  QUESTION {questStep + 1} OF {QUEST_QUESTIONS.length}
                </span>
                <p className="mt-2 text-[12.5px] font-medium text-slate-200 leading-snug">
                  {QUEST_QUESTIONS[questStep].question}
                </p>

                <div className="mt-4 space-y-2">
                  {QUEST_QUESTIONS[questStep].options.map((opt, i) => {
                    const isSelected = questAnswer === i
                    let itemStyle = 'border-edge bg-panel hover:border-slate-500 text-slate-300'
                    if (questSubmitted) {
                      if (i === QUEST_QUESTIONS[questStep].correct) {
                        itemStyle = 'border-emerald-500 bg-emerald-500/15 text-emerald-200 font-semibold'
                      } else if (isSelected) {
                        itemStyle = 'border-rose-500 bg-rose-500/15 text-rose-200'
                      } else {
                        itemStyle = 'border-edge/40 bg-panel/40 text-slate-500 opacity-60'
                      }
                    } else if (isSelected) {
                      itemStyle = 'border-sky-500 bg-sky-500/20 text-sky-100 font-medium'
                    }

                    return (
                      <button
                        key={i}
                        disabled={questSubmitted}
                        onClick={() => setQuestAnswer(i)}
                        className={`flex w-full items-center justify-between rounded-md border p-3 text-left font-mono text-[11px] transition ${itemStyle}`}
                      >
                        <span>{opt}</span>
                        {questSubmitted && i === QUEST_QUESTIONS[questStep].correct && (
                          <span className="text-emerald-400">✓ Correct</span>
                        )}
                        {questSubmitted && isSelected && i !== QUEST_QUESTIONS[questStep].correct && (
                          <span className="text-rose-400">✗ Incorrect</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {questSubmitted && (
                  <div className="mt-4 rounded-md border border-edge bg-slate-900/60 p-3 font-mono text-[10.5px] text-slate-300">
                    <strong className="text-sky-300">Explanation: </strong>
                    {QUEST_QUESTIONS[questStep].explanation}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-500">
                  Physical and mathematical ground truth checked locally.
                </span>

                {!questSubmitted ? (
                  <button
                    disabled={questAnswer === null}
                    onClick={() => {
                      if (questAnswer === null) return
                      const isCorrect = questAnswer === QUEST_QUESTIONS[questStep].correct
                      if (isCorrect) setQuestScore((s) => s + 1)
                      setQuestSubmitted(true)
                    }}
                    className="rounded-md border border-sky-500/50 bg-sky-500/20 px-4 py-1.5 font-mono text-[11px] font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-40"
                  >
                    Confirm Answer
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const next = questStep + 1
                      if (next >= QUEST_QUESTIONS.length) {
                        setLabCompleted('quest')
                      }
                      setQuestStep(next)
                      setQuestAnswer(null)
                      setQuestSubmitted(false)
                    }}
                    className="rounded-md border border-emerald-500/50 bg-emerald-500/20 px-4 py-1.5 font-mono text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/30"
                  >
                    {questStep + 1 < QUEST_QUESTIONS.length ? 'Next Question →' : 'Complete Quest →'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20">
              <span className="text-2xl">🏆</span>
              <h3 className="text-[15px] font-semibold text-emerald-200">
                Voxel Quest Completed!
              </h3>
              <p className="max-w-md font-mono text-[11px] text-slate-300">
                You scored {questScore} out of {QUEST_QUESTIONS.length}. You have certified proficiency in NIfTI physical coordinates, affine geometry, and BraTS regional logic.
              </p>
              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => {
                    setQuestStep(0)
                    setQuestScore(0)
                    setQuestAnswer(null)
                    setQuestSubmitted(false)
                  }}
                  className="rounded border border-edge bg-panel px-3 py-1 font-mono text-[10.5px] text-slate-300 hover:bg-panel-2"
                >
                  Restart Quest
                </button>
                <button
                  onClick={() => setActiveWorkspace('viewer')}
                  className="rounded border border-emerald-500/40 bg-emerald-500/20 px-3.5 py-1 font-mono text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                >
                  Jump into 3D Twin Viewer →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
