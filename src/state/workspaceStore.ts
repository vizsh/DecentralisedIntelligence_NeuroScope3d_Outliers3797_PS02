import { create } from 'zustand'

export type WorkspaceKey =
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

export const COHORT_DATA: CohortCaseResult[] = [
  {
    caseId: 'BRATS_206',
    label: 'Decathlon BRATS_206',
    split: 'held_out',
    wtDice: 0.8801,
    tcDice: 0.9125,
    etDice: 0.8951,
    hd95Mm: 3.42,
    volumeErrorPct: 2.3,
    hasExpert: true,
    disposition: 'flagged',
    notes: 'Held-out test patient; minor medial boundary disagreement'
  },
  {
    caseId: 'BRATS_214',
    label: 'Decathlon BRATS_214',
    split: 'held_out',
    wtDice: 0.9142,
    tcDice: 0.8920,
    etDice: 0.8610,
    hd95Mm: 2.85,
    volumeErrorPct: 1.8,
    hasExpert: true,
    disposition: 'accepted',
    notes: 'Held-out test patient; sharp boundary agreement'
  },
  {
    caseId: 'BRATS_218',
    label: 'Decathlon BRATS_218',
    split: 'train',
    wtDice: 0.9230,
    tcDice: 0.9080,
    etDice: 0.8740,
    hd95Mm: 2.45,
    volumeErrorPct: 1.4,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_265',
    label: 'Decathlon BRATS_265',
    split: 'train',
    wtDice: 0.8910,
    tcDice: 0.8850,
    etDice: 0.8320,
    hd95Mm: 4.12,
    volumeErrorPct: 3.1,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_306',
    label: 'Decathlon BRATS_306',
    split: 'train',
    wtDice: 0.9082,
    tcDice: 0.8741,
    etDice: 0.8412,
    hd95Mm: 3.18,
    volumeErrorPct: 2.0,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_318',
    label: 'Decathlon BRATS_318',
    split: 'train',
    wtDice: 0.9310,
    tcDice: 0.9190,
    etDice: 0.8850,
    hd95Mm: 2.10,
    volumeErrorPct: 1.2,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_365',
    label: 'Decathlon BRATS_365',
    split: 'train',
    wtDice: 0.8750,
    tcDice: 0.8620,
    etDice: 0.8140,
    hd95Mm: 4.80,
    volumeErrorPct: 4.2,
    hasExpert: true,
    disposition: 'flagged',
    notes: 'Large infiltrative edema margin'
  },
  {
    caseId: 'BRATS_434',
    label: 'Decathlon BRATS_434',
    split: 'train',
    wtDice: 0.9180,
    tcDice: 0.9010,
    etDice: 0.8690,
    hd95Mm: 2.70,
    volumeErrorPct: 1.9,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_449',
    label: 'Decathlon BRATS_449',
    split: 'train',
    wtDice: 0.9140,
    tcDice: 0.9050,
    etDice: 0.8590,
    hd95Mm: 2.90,
    volumeErrorPct: 2.1,
    hasExpert: true,
    disposition: 'accepted'
  },
  {
    caseId: 'BRATS_457',
    label: 'Decathlon BRATS_457',
    split: 'train',
    wtDice: 0.8990,
    tcDice: 0.8940,
    etDice: 0.8460,
    hd95Mm: 3.65,
    volumeErrorPct: 2.8,
    hasExpert: true,
    disposition: 'flagged',
    notes: 'Cortical boundary false positives'
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
  activeWorkspace: 'dashboard',
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
