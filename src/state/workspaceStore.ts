import { create } from 'zustand'

export type WorkspaceKey =
  | 'landing'
  | 'dashboard'
  | 'viewer'
  | 'review'
  | 'research'
  | 'trust'
  | 'patient'
  | 'learn'
  | 'graph'

export type ReviewDisposition = 'pending' | 'accepted' | 'flagged' | 'unusable'

export type ErrorCategory =
  | 'infiltrative_boundary'
  | 'edema_oversegmentation'
  | 'necrotic_misclassification'
  | 'skullstrip_artifact'
  | 'low_contrast_miss'
  | 'none'

export interface FlaggedCluster {
  id: string
  label: string
  region: 'WT' | 'TC' | 'ET'
  voxel: [number, number, number]
  volumeMl: number
  type: 'FP' | 'FN'
  note?: string
}

export interface ReviewState {
  disposition: ReviewDisposition
  notes: string
  errorCategory: ErrorCategory
  flaggedClusters: FlaggedCluster[]
  reviewedAt: string | null
  reviewerId: string
}

export interface SpatialBookmark {
  id: string
  label: string
  studyId: string
  voxel: [number, number, number]
  plane: 'axial' | 'coronal' | 'sagittal'
  sequence: string
  note: string
  createdAt: string
}

export interface CohortCaseResult {
  caseId: string
  label: string
  split: 'held_out' | 'train' | 'synthetic'
  wtDice: number
  tcDice: number
  etDice: number
  hd95Mm: number
  volumeErrorPct: number
  hasExpert: boolean
  disposition: ReviewDisposition
  notes?: string
}

export interface WorkspaceStore {
  activeWorkspace: WorkspaceKey
  setActiveWorkspace: (w: WorkspaceKey) => void

  selectedStudyId: string
  setSelectedStudyId: (id: string) => void

  // Review states keyed by studyId
  reviews: Record<string, ReviewState>
  setReviewDisposition: (studyId: string, disposition: ReviewDisposition) => void
  setReviewNotes: (studyId: string, notes: string) => void
  setReviewCategory: (studyId: string, category: ErrorCategory) => void
  addFlaggedCluster: (studyId: string, cluster: FlaggedCluster) => void

  // Spatial Bookmarks
  bookmarks: SpatialBookmark[]
  addBookmark: (b: Omit<SpatialBookmark, 'id' | 'createdAt'>) => void
  removeBookmark: (id: string) => void

  // Research Lab Experiment State
  selectedCohort: 'held_out' | 'all_decathlon' | 'synthetic'
  setSelectedCohort: (c: 'held_out' | 'all_decathlon' | 'synthetic') => void
  experimentTta: boolean
  setExperimentTta: (tta: boolean) => void
  experimentThreshold: number
  setExperimentThreshold: (t: number) => void

  // Trust workspace states
  uncertaintyThreshold: number
  setUncertaintyThreshold: (t: number) => void

  // NeuroLearn state
  activeLearnLab: 'sequences' | 'labels' | 'geometry' | 'failures' | 'quest'
  setActiveLearnLab: (lab: 'sequences' | 'labels' | 'geometry' | 'failures' | 'quest') => void
  completedLabs: Record<string, boolean>
  setLabCompleted: (lab: string) => void
}

export const INITIAL_REVIEWS: Record<string, ReviewState> = {
  brats_206: {
    disposition: 'flagged',
    notes: 'Mild boundary discrepancy in enhancing rim on sagittal view (ET). False negative cluster observed near medial border.',
    errorCategory: 'infiltrative_boundary',
    flaggedClusters: [
      {
        id: 'c1',
        label: 'Medial ET boundary under-prediction',
        region: 'ET',
        voxel: [84, 112, 78],
        volumeMl: 1.57,
        type: 'FN',
        note: 'High local flip-TTA uncertainty correlates with rater edge ambiguity.'
      }
    ],
    reviewedAt: '2026-10-16 19:40',
    reviewerId: 'RAD-INVESTIGATOR-01'
  },
  brats_306: {
    disposition: 'accepted',
    notes: 'High spatial congruence. Necrotic core and surrounding edema match rater boundaries with WT Dice > 0.90.',
    errorCategory: 'none',
    flaggedClusters: [],
    reviewedAt: '2026-10-16 20:10',
    reviewerId: 'RAD-INVESTIGATOR-01'
  },
  brats_449: {
    disposition: 'accepted',
    notes: 'Well-circumscribed temporal core. Small peritumoral edema tail correctly captured.',
    errorCategory: 'none',
    flaggedClusters: [],
    reviewedAt: '2026-10-16 20:30',
    reviewerId: 'RAD-INVESTIGATOR-02'
  },
  brats_457: {
    disposition: 'flagged',
    notes: 'Diffuse edema boundary over-segmentation along cortical margin.',
    errorCategory: 'edema_oversegmentation',
    flaggedClusters: [
      {
        id: 'c2',
        label: 'Cortical margin edema spill',
        region: 'WT',
        voxel: [98, 88, 92],
        volumeMl: 2.14,
        type: 'FP',
        note: 'CSF partial volume effect at brain boundary.'
      }
    ],
    reviewedAt: '2026-10-16 20:55',
    reviewerId: 'RAD-INVESTIGATOR-01'
  },
  demo_multifocal_left: {
    disposition: 'accepted',
    notes: '26-connectivity accurately splits the 2 distinct left hemisphere lesions.',
    errorCategory: 'none',
    flaggedClusters: [],
    reviewedAt: '2026-10-16 18:20',
    reviewerId: 'BENCHMARK-HARNESS'
  }
}

export const INITIAL_BOOKMARKS: SpatialBookmark[] = [
  {
    id: 'bm-1',
    label: 'Primary Solid Core Peak',
    studyId: 'demo_unifocal_right',
    voxel: [82, 98, 82],
    plane: 'axial',
    sequence: 'T1Gd',
    note: 'Active rim contrast enhancement',
    createdAt: '2026-10-16 18:00'
  },
  {
    id: 'bm-2',
    label: 'Multifocal Lesion #2 Center',
    studyId: 'demo_multifocal_left',
    voxel: [62, 108, 90],
    plane: 'coronal',
    sequence: 'FLAIR',
    note: 'Secondary satellite focus separated from primary core',
    createdAt: '2026-10-16 18:15'
  },
  {
    id: 'bm-3',
    label: 'Decathlon 206 Disagreement Focus',
    studyId: 'brats_206',
    voxel: [84, 112, 78],
    plane: 'sagittal',
    sequence: 'T1Gd',
    note: 'Largest false-negative boundary cluster',
    createdAt: '2026-10-16 19:42'
  }
]

// Real, measured figures — reproducible via `cd backend && python evaluate.py --root data/decathlon
// --limit 10 --out data/real_sample_eval.json --model bundle`; committed source of truth is
// backend/data/real_sample_eval.json (per-case Dice/sensitivity/HD95) and backend/data/decathlon_split.json
// (patient-level held-out/train split). Do not hand-edit these numbers — regenerate and re-copy instead.
export const COHORT_DATA: CohortCaseResult[] = [
  {
    caseId: 'BRATS_206',
    label: 'Decathlon BRATS_206',
    split: 'held_out',
    wtDice: 0.8801,
    tcDice: 0.9125,
    etDice: 0.8951,
    hd95Mm: 4.123,
    volumeErrorPct: 19.6,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_214',
    label: 'Decathlon BRATS_214',
    split: 'held_out',
    wtDice: 0.6469,
    tcDice: 0.7912,
    etDice: 0.7294,
    hd95Mm: 27.092,
    volumeErrorPct: 38.9,
    hasExpert: true,
    disposition: 'flagged',
    notes: 'Lowest WT Dice of the 10-case real evaluation (0.647); large WT boundary distance (HD95 27.1mm) — review before citing this case as representative'
  },
  {
    caseId: 'BRATS_218',
    label: 'Decathlon BRATS_218',
    split: 'train',
    wtDice: 0.9390,
    tcDice: 0.8772,
    etDice: 0.3083,
    hd95Mm: 4.123,
    volumeErrorPct: 10.1,
    hasExpert: true,
    disposition: 'flagged',
    notes: 'ET Dice drops to 0.308, far below the other nine cases — reported as measured, not excluded (see docs/VERIFICATION.md)'
  },
  {
    caseId: 'BRATS_265',
    label: 'Decathlon BRATS_265',
    split: 'train',
    wtDice: 0.9479,
    tcDice: 0.9556,
    etDice: 0.9353,
    hd95Mm: 2.449,
    volumeErrorPct: 7.2,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_306',
    label: 'Decathlon BRATS_306',
    split: 'train',
    wtDice: 0.8542,
    tcDice: 0.9227,
    etDice: 0.8242,
    hd95Mm: 19.209,
    volumeErrorPct: 15.7,
    hasExpert: true,
    disposition: 'flagged',
    notes: 'WT boundary distance elevated (HD95 19.2mm) despite a reasonable Dice — a thin surface disagreement, not a gross region miss'
  },
  {
    caseId: 'BRATS_318',
    label: 'Decathlon BRATS_318',
    split: 'train',
    wtDice: 0.8702,
    tcDice: 0.8840,
    etDice: 0.8291,
    hd95Mm: 6.000,
    volumeErrorPct: 13.4,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_365',
    label: 'Decathlon BRATS_365',
    split: 'train',
    wtDice: 0.9118,
    tcDice: 0.7163,
    etDice: 0.8035,
    hd95Mm: 9.000,
    volumeErrorPct: 6.5,
    hasExpert: true,
    disposition: 'flagged',
    notes: 'TC Dice (0.716) notably lower than WT/ET on this case'
  },
  {
    caseId: 'BRATS_434',
    label: 'Decathlon BRATS_434',
    split: 'train',
    wtDice: 0.8866,
    tcDice: 0.8767,
    etDice: 0.8785,
    hd95Mm: 6.633,
    volumeErrorPct: 16.1,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_449',
    label: 'Decathlon BRATS_449',
    split: 'train',
    wtDice: 0.9574,
    tcDice: 0.9321,
    etDice: 0.8679,
    hd95Mm: 2.236,
    volumeErrorPct: 5.2,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_457',
    label: 'Decathlon BRATS_457',
    split: 'train',
    wtDice: 0.9135,
    tcDice: 0.8283,
    etDice: 0.8141,
    hd95Mm: 3.464,
    volumeErrorPct: 1.2,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'demo_unifocal_right',
    label: 'Synthetic Unifocal Right',
    split: 'synthetic',
    wtDice: 0.9610,
    tcDice: 0.9210,
    etDice: 0.9520,
    hd95Mm: 1.20,
    volumeErrorPct: 0.3,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'demo_multifocal_left',
    label: 'Synthetic Multifocal Left',
    split: 'synthetic',
    wtDice: 0.9480,
    tcDice: 0.9150,
    etDice: 0.9380,
    hd95Mm: 1.60,
    volumeErrorPct: 0.6,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'demo_large_diffuse',
    label: 'Synthetic Large Diffuse',
    split: 'synthetic',
    wtDice: 0.9320,
    tcDice: 0.8890,
    etDice: 0.9120,
    hd95Mm: 2.15,
    volumeErrorPct: 1.1,
    hasExpert: true,
    disposition: 'accepted'
  }
]

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeWorkspace: 'landing',
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),

  selectedStudyId: 'demo_phantom',
  setSelectedStudyId: (selectedStudyId) => set({ selectedStudyId }),

  reviews: INITIAL_REVIEWS,
  setReviewDisposition: (studyId, disposition) =>
    set((s) => ({
      reviews: {
        ...s.reviews,
        [studyId]: {
          ...(s.reviews[studyId] || {
            notes: '',
            errorCategory: 'none',
            flaggedClusters: [],
            reviewerId: 'INVESTIGATOR-DEFAULT'
          }),
          disposition,
          reviewedAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
        }
      }
    })),
  setReviewNotes: (studyId, notes) =>
    set((s) => ({
      reviews: {
        ...s.reviews,
        [studyId]: {
          ...(s.reviews[studyId] || {
            disposition: 'pending',
            errorCategory: 'none',
            flaggedClusters: [],
            reviewerId: 'INVESTIGATOR-DEFAULT',
            reviewedAt: null
          }),
          notes
        }
      }
    })),
  setReviewCategory: (studyId, errorCategory) =>
    set((s) => ({
      reviews: {
        ...s.reviews,
        [studyId]: {
          ...(s.reviews[studyId] || {
            disposition: 'pending',
            notes: '',
            flaggedClusters: [],
            reviewerId: 'INVESTIGATOR-DEFAULT',
            reviewedAt: null
          }),
          errorCategory
        }
      }
    })),
  addFlaggedCluster: (studyId, cluster) =>
    set((s) => ({
      reviews: {
        ...s.reviews,
        [studyId]: {
          ...(s.reviews[studyId] || {
            disposition: 'flagged',
            notes: '',
            errorCategory: 'none',
            reviewerId: 'INVESTIGATOR-DEFAULT',
            reviewedAt: null
          }),
          flaggedClusters: [...(s.reviews[studyId]?.flaggedClusters || []), cluster]
        }
      }
    })),

  bookmarks: INITIAL_BOOKMARKS,
  addBookmark: (b) =>
    set((s) => ({
      bookmarks: [
        ...s.bookmarks,
        {
          ...b,
          id: `bm-${Date.now()}`,
          createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
        }
      ]
    })),
  removeBookmark: (id) =>
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

  selectedCohort: 'held_out',
  setSelectedCohort: (selectedCohort) => set({ selectedCohort }),
  experimentTta: true,
  setExperimentTta: (experimentTta) => set({ experimentTta }),
  experimentThreshold: 0.5,
  setExperimentThreshold: (experimentThreshold) => set({ experimentThreshold }),

  uncertaintyThreshold: 0.35,
  setUncertaintyThreshold: (uncertaintyThreshold) => set({ uncertaintyThreshold }),

  activeLearnLab: 'sequences',
  setActiveLearnLab: (activeLearnLab) => set({ activeLearnLab }),
  completedLabs: { sequences: true },
  setLabCompleted: (lab) =>
    set((s) => ({ completedLabs: { ...s.completedLabs, [lab]: true } }))
}))
