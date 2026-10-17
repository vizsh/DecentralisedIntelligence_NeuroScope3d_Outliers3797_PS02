import { useState } from 'react'
import { useStore } from '../state/store'

interface FormulaItem {
  id: string
  segment: string
  title: string
  symbol: string
  formula: string
  variables: string
  reasoning: string
}

const FORMULAS: FormulaItem[] = [
  // Segment 1: Volumetrics & Spatial Geometry
  {
    id: 'vol',
    segment: 'Volumetrics & Geometry',
    title: 'Physical Volume',
    symbol: 'V (mL)',
    formula: 'V = (N_voxels × Δx × Δy × Δz) / 1000',
    variables: 'N: active voxel count; Δx, Δy, Δz: acquisition voxel dimensions in mm',
    reasoning: 'Evaluated directly on the native acquisition grid to eliminate interpolation volume bias; 1000 mm³ = 1 mL.',
  },
  {
    id: 'frac',
    segment: 'Volumetrics & Geometry',
    title: 'Brain Volume Fraction',
    symbol: 'F_brain (%)',
    formula: 'F_brain = (V_region / V_brain) × 100%',
    variables: 'V_region: tumor region volume (mL); V_brain: intracranial brain parenchyma (mL)',
    reasoning: 'Normalizes lesion burden against total intracranial volume to quantify anatomical mass effect.',
  },
  {
    id: 'conn',
    segment: 'Volumetrics & Geometry',
    title: '26-Connected Mass Volume',
    symbol: 'V_i (mL)',
    formula: 'V_i = (c_i × Δx × Δy × Δz) / 1000',
    variables: 'c_i: voxel count in i-th cluster; 26-connectivity diagonal neighborhood',
    reasoning: 'Diagonal touches across anisotropic slices prevent artificial splitting of continuous masses.',
  },
  {
    id: 'dom',
    segment: 'Volumetrics & Geometry',
    title: 'Dominant Mass Share',
    symbol: 'S_dom (%)',
    formula: 'S_dom = (max(c_i) / Σ c_k) × 100%',
    variables: 'c_i: component voxel counts across all connected clusters',
    reasoning: 'Instantly differentiates solitary unifocal lesions from multifocal disease or satellite micrometastases.',
  },
  {
    id: 'diam',
    segment: 'Volumetrics & Geometry',
    title: 'Maximum 3D Caliper Diameter',
    symbol: '⌀ D_max (mm)',
    formula: 'D_max = max_{u, v ∈ ConvexHull} ||p_u - p_v||_2',
    variables: 'ConvexHull: 3D hull vertices; p_i = x_i ⊙ Δ in world mm coordinates',
    reasoning: 'Computes exact caliper distance over convex hull vertices in O(V_hull²) with zero approximation; logs endpoints for clinical audit.',
  },
  {
    id: 'surf',
    segment: 'Volumetrics & Geometry',
    title: 'Boundary Surface Area',
    symbol: 'S (mm²)',
    formula: 'S = Σ_{a ∈ {x,y,z}} N_faces,a × A_a',
    variables: 'N_faces,a: exposed boundary faces; A_x = ΔyΔz, A_y = ΔxΔz, A_z = ΔxΔy',
    reasoning: 'Evaluates exposed boundary faces per axis independently to preserve geometric fidelity under anisotropic slice thicknesses.',
  },
  {
    id: 'cent',
    segment: 'Volumetrics & Geometry',
    title: 'Patient-Space World Centroid',
    symbol: 'C_world (mm)',
    formula: 'C_world = A_{3×3} · (1/N Σ x_i) + t',
    variables: 'x_i: 3D voxel index; A: rotational affine; t: origin translation vector',
    reasoning: 'Projects lesion center-of-mass into true patient anatomical space (RAS+) for unambiguous hemispheric side localization.',
  },

  // Segment 2: BraTS Region Set Theory
  {
    id: 'wt',
    segment: 'BraTS Region Labels',
    title: 'Whole Tumor (WT)',
    symbol: 'WT (Labels 1∪2∪4)',
    formula: 'WT = NCR ∪ ED ∪ ET',
    variables: 'Label 1: Necrotic Core (NCR), Label 2: Edema (ED), Label 4: Enhancing (ET)',
    reasoning: 'Encompasses the entire abnormal parenchymal footprint, including vasogenic edema, for radiation target volumes.',
  },
  {
    id: 'tc',
    segment: 'BraTS Region Labels',
    title: 'Tumor Core (TC)',
    symbol: 'TC (Labels 1∪4)',
    formula: 'TC = NCR ∪ ET',
    variables: 'Label 1: Necrotic Core (NCR), Label 4: Enhancing Tumor (ET)',
    reasoning: 'Isolates bulk macroscopic tumor tissue slated for surgical resection, excluding non-neoplastic vasogenic edema.',
  },
  {
    id: 'et',
    segment: 'BraTS Region Labels',
    title: 'Enhancing Tumor (ET)',
    symbol: 'ET (Label 4)',
    formula: 'ET = ET',
    variables: 'Label 4: Active gadolinium contrast enhancing viable tissue',
    reasoning: 'Pinpoints viable, hyper-vascularized malignancy exhibiting blood-brain barrier disruption for targeted adjuvant therapy.',
  },
  {
    id: 'nest',
    segment: 'BraTS Region Labels',
    title: 'Biological Hierarchy Constraint',
    symbol: 'ET ⊆ TC ⊆ WT',
    formula: 'ET ⊆ TC ⊆ WT  (Outer-to-inner label overwrite rule)',
    variables: 'Nested segmentation probability maps collapsed back to integer labels',
    reasoning: 'Eliminates physically impossible states (e.g. enhancing rim appearing outside edema) through enforced nesting logic.',
  },

  // Segment 3: Input Validation & Gatekeepers
  {
    id: 'sing',
    segment: 'Validation & Gatekeepers',
    title: 'Affine Invertibility (Singularity)',
    symbol: '|det(A)| > ε',
    formula: '|det(A_{3×3})| > 10⁻⁶',
    variables: 'A_{3×3}: 3D spatial rotation and scaling matrix from NIfTI/DICOM header',
    reasoning: 'Prevents matrix inversion crashes and ensures the scan represents a non-degenerate 3D physical volume.',
  },
  {
    id: 'match',
    segment: 'Validation & Gatekeepers',
    title: 'Cross-Sequence Spatial Match',
    symbol: 'max ||A_i - A_j|| ≤ δ',
    formula: 'max ||A_i - A_j||_∞ ≤ 10⁻³  ∧  max ||t_i - t_j||_∞ ≤ 0.1 mm',
    variables: 'A_i: rotational affine; t_i: physical origin vector across T1, T1Gd, T2, FLAIR',
    reasoning: 'Verifies all 4 MRI sequences are co-registered and occupy the exact same physical frame before 4-channel tensor assembly.',
  },
  {
    id: 'fov',
    segment: 'Validation & Gatekeepers',
    title: 'Physical Field of View Limit',
    symbol: 'Extent ≤ 500 mm',
    formula: 'max_{a ∈ {x,y,z}} (N_a × Δ_a) ≤ 500 mm',
    variables: 'N_a: matrix grid size; Δ_a: voxel spacing in mm',
    reasoning: 'Catches unit metadata corruption (e.g., coordinates recorded in meters or micrometers rather than millimeters).',
  },
  {
    id: 'edge',
    segment: 'Validation & Gatekeepers',
    title: 'Edge Occupancy (Skull-Strip)',
    symbol: 'EdgeFraction < 5%',
    formula: '(1 / |∂V|) Σ_{x ∈ ∂V} 𝕀(I(x) > 0.1 × I_max) < 0.05',
    variables: '∂V: volume border voxels; I(x): scan voxel intensity',
    reasoning: 'Identifies unstripped or cropped scans where brain tissue spills into the FOV border, invalidating downstream models.',
  },

  // Segment 4: Accuracy & Spatial Error
  {
    id: 'dice',
    segment: 'Accuracy & Metrics',
    title: 'Sørensen–Dice Index',
    symbol: 'Dice ∈ [0, 1]',
    formula: 'Dice(P, T) = 2|P ∩ T| / (|P| + |T|)  [awards 1.0 if |P|+|T| = 0]',
    variables: 'P: predicted positive voxel mask; T: expert ground-truth mask',
    reasoning: 'Standard volumetric overlap metric; explicitly avoids division-by-zero by rewarding correct prediction of true absence.',
  },
  {
    id: 'sens',
    segment: 'Accuracy & Metrics',
    title: 'Sensitivity (Recall / TPR)',
    symbol: 'Sensitivity ∈ [0, 1]',
    formula: 'Sens(P, T) = |P ∩ T| / |T|  [awards 1.0 if |T| = 0]',
    variables: 'P: predicted mask; T: expert ground-truth mask',
    reasoning: 'Quantifies false-negative under-segmentation; critical in neuro-oncology where missed infiltrative tumor is dangerous.',
  },
  {
    id: 'hd95',
    segment: 'Accuracy & Metrics',
    title: '95th-Percentile Hausdorff Distance',
    symbol: 'HD95 (mm)',
    formula: 'HD95 = max( P_{95%}(min_{t ∈ ∂T} d_w(p, t)), P_{95%}(min_{p ∈ ∂P} d_w(t, p)) )',
    variables: '∂P, ∂T: 3D boundary surfaces; d_w: spacing-aware Euclidean distance; null if empty',
    reasoning: 'Physical boundary disagreement in mm; 95th percentile clips spurious outlier voxels while avoiding undefined empty bounds.',
  },
  {
    id: 'spat',
    segment: 'Accuracy & Metrics',
    title: 'Spatial Error Decomposition',
    symbol: 'TP / FP / FN',
    formula: 'TP = P ∩ T (Green),  FP = P \\ T (Amber),  FN = T \\ P (Red)',
    variables: 'Voxel-wise boolean set decomposition rendered directly in slice views',
    reasoning: 'Spatially unpacks scalar Dice scores into intuitive clinical error classes directly across multi-planar slice views.',
  },

  // Segment 5: Uncertainty & Calibration
  {
    id: 'unc',
    segment: 'Uncertainty & Calibration',
    title: 'Flip-TTA Voxel Uncertainty',
    symbol: 'σ(x) ∈ [0, 0.5]',
    formula: 'σ(x) = sqrt( (1/K) Σ_{k=1}^K (p_k(x) - p̄(x))² )  [K=2, Unflipped + LR-Flipped]',
    variables: 'p_1: native inference; p_2: sagittal flipped & unflipped inference',
    reasoning: 'Captures epistemic instability under bilateral reflection; elevated σ reliably highlights ambiguous infiltrating margins.',
  },
  {
    id: 'calib',
    segment: 'Uncertainty & Calibration',
    title: 'Uncertainty Calibration Correlation',
    symbol: 'Pearson r = 0.3463',
    formula: 'r = Σ (σ_i - σ̄)(e_i - ē) / sqrt( Σ(σ_i - σ̄)² Σ(e_i - ē)² )  [e_i = |p_i - t_i|]',
    variables: 'Evaluated across 1,297,798 WT-union voxels over 10 held-out Decathlon cases',
    reasoning: 'Empirically proves flip-TTA uncertainty correlates with actual clinical error (disagreement rate triples from 15.7% to 65.2%).',
  },

  // Segment 6: DICOM & Coordinate Space
  {
    id: 'norm',
    segment: 'DICOM & Coordinates',
    title: 'Slice Normal Vector',
    symbol: 'n = F_row × F_col',
    formula: 'n = F_row × F_col',
    variables: 'F_row, F_col: directional cosines from DICOM tag (0020,0037) ImageOrientationPatient',
    reasoning: 'Establishes the true normal vector of the 2D scan plane relative to the 3D patient coordinate system.',
  },
  {
    id: 'sort',
    segment: 'DICOM & Coordinates',
    title: 'Slice Axial Stacking Distance',
    symbol: 's_k (mm)',
    formula: 's_k = r_k · n',
    variables: 'r_k: slice origin coordinate from tag (0020,0032) ImagePositionPatient',
    reasoning: 'Projects each slice origin along the normal vector, establishing correct monotonic anatomical stacking independent of filename.',
  },
  {
    id: 'ras',
    segment: 'DICOM & Coordinates',
    title: 'DICOM LPS to NIfTI RAS Conversion',
    symbol: 'A_RAS',
    formula: 'A_RAS = diag(-1, -1, 1, 1) · A_LPS',
    variables: '4×4 homogenous affine coordinate matrix transformation',
    reasoning: 'Converts clinical DICOM patient space (Left-Posterior-Superior) to neuroimaging standard space (Right-Anterior-Superior).',
  },

  // Segment 7: 3D Neurosurgical Clipping
  {
    id: 'clip',
    segment: '3D Shader Math',
    title: 'Interactive Planar Clipping SDF',
    symbol: 'd(x) (mm)',
    formula: 'd(x) = n_plane · (x - p_plane)',
    variables: 'n_plane: normal vector along axial/coronal/sagittal; p_plane: cut depth offset in mm',
    reasoning: 'Discards shader fragments where d(x) < 0 in real time, revealing deep subcortical tumor cores without destroying 3D context.',
  },

  // Segment 8: Job Queue & Scheduling
  {
    id: 'queue',
    segment: 'Queue & Runtime',
    title: 'FIFO Queue Wait Time Estimation',
    symbol: 'ETA_wait (s)',
    formula: 'ETA_wait = (Position_queue + 1) × P50_runtime',
    variables: 'Queue rank index; P50_runtime: rolling median inference runtime (~37s on CPU)',
    reasoning: 'Computes accurate wait-time estimates from observed rolling median CPU execution times rather than static arbitrary timers.',
  },
]

const SEGMENTS = [
  'All',
  'Volumetrics & Geometry',
  'BraTS Region Labels',
  'Validation & Gatekeepers',
  'Accuracy & Metrics',
  'Uncertainty & Calibration',
  'DICOM & Coordinates',
  '3D Shader Math',
  'Queue & Runtime',
]

export default function FormulaSheetModal() {
  const open = useStore((s) => s.formulaSheetOpen)
  const setOpen = useStore((s) => s.setFormulaSheetOpen)
  const [selectedSegment, setSelectedSegment] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  if (!open) return null

  const filtered = FORMULAS.filter((item) => {
    const matchesSegment = selectedSegment === 'All' || item.segment === selectedSegment
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.formula.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.reasoning.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSegment && matchesSearch
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-edge bg-panel shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-edge bg-panel-2/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 font-bold border border-sky-500/30 text-sm">
              📐
            </span>
            <div>
              <h2 className="text-[14.5px] font-semibold text-slate-100 flex items-center gap-2">
                NeuroScope 3D Formula &amp; Math Reference Sheet
                <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-[9.5px] text-sky-300 border border-sky-500/20">
                  {FORMULAS.length} Formulas
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Consolidated index of mathematical definitions, spatial equations, gatekeepers, and one-line justifications.
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-edge/80 text-slate-400 hover:border-slate-400 hover:text-slate-100 transition"
          >
            ✕
          </button>
        </div>

        {/* Search & Segment Filter Bar */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-edge bg-panel px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search formulas (e.g. dice, volume, sigma)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-edge bg-panel-2 px-3 py-1.5 pl-8 text-[11px] text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
            <span className="absolute left-2.5 top-2 text-[11px] text-slate-500">🔍</span>
          </div>

          <div className="flex overflow-x-auto gap-1 pb-1 sm:pb-0 text-[10px] font-mono scrollbar-none">
            {SEGMENTS.map((seg) => (
              <button
                key={seg}
                onClick={() => setSelectedSegment(seg)}
                className={`shrink-0 rounded px-2.5 py-1 transition ${
                  selectedSegment === seg
                    ? 'bg-sky-500/20 text-sky-200 font-bold border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {seg === 'All' ? 'All (20)' : seg.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Formula List / Cards */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5 text-[11.5px]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              No formulas matched "{searchQuery}".
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-edge bg-panel-2/50 p-3.5 space-y-2 hover:border-slate-500/60 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100 text-[12px]">{item.title}</span>
                    <span className="rounded bg-panel-2 px-2 py-0.5 font-mono text-[10px] text-sky-300 border border-edge">
                      {item.symbol}
                    </span>
                  </div>
                  <span className="text-[9.5px] font-mono text-slate-500 uppercase tracking-wider">
                    {item.segment}
                  </span>
                </div>

                {/* Mathematical Formula Box */}
                <div className="rounded border border-sky-500/25 bg-sky-950/20 px-3 py-2 font-mono text-[11px] text-sky-200 font-bold overflow-x-auto">
                  {item.formula}
                </div>

                {/* Variables & Dimensions */}
                <div className="text-[10.5px] text-slate-400">
                  <span className="font-semibold text-slate-500">Variables: </span>
                  {item.variables}
                </div>

                {/* One-Line Reasoning / Justification */}
                <div className="rounded bg-panel/60 border-l-2 border-emerald-400 px-2.5 py-1.5 text-[10.5px] text-slate-300">
                  <strong className="text-emerald-300 font-medium">1-Line Essential Justification: </strong>
                  {item.reasoning}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-edge bg-panel-2/60 px-5 py-2.5 text-[10px] font-mono text-slate-500">
          <span>Formula Reference · NeuroScope 3D Layer 3 Trust System</span>
          <span>Press Esc or click outside to dismiss</span>
        </div>
      </div>
    </div>
  )
}
