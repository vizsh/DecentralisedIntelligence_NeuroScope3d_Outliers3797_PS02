import { create } from 'zustand'
import * as api from '../lib/api'

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface LiveState {
  status: UploadStatus
  jobId: string | null
  metadata: api.SegmentMetadata | null
  errors: api.Finding[]
  /** live pipeline stage while uploading — "validating", "segmenting", etc. */
  stage: string | null
  stageMessage: string | null
  /** set only while stage === 'queued' */
  queuePosition: number | null
  queueEtaSeconds: number | null
  /** bumped on every successful submit or reset, so StudyProvider knows to rebuild */
  generation: number
  /** which sample is currently running, if this run was started from the Datasets panel */
  activeSampleId: string | null
  submit: (files: api.UploadFiles) => Promise<void>
  runSample: (sampleId: string) => Promise<void>
  reset: () => void
}

export const useLiveStudy = create<LiveState>((set, get) => ({
  status: 'idle',
  jobId: null,
  metadata: null,
  errors: [],
  stage: null,
  stageMessage: null,
  queuePosition: null,
  queueEtaSeconds: null,
  generation: 0,
  activeSampleId: null,

  submit: async (files) => {
    const jobId = api.newJobId()
    set({ status: 'uploading', errors: [], jobId, stage: 'received', stageMessage: 'Uploading…', activeSampleId: null })

    let polling = true
    const poll = async () => {
      while (polling) {
        const s = await api.pollStage(jobId)
        if (s && get().jobId === jobId) set({ stage: s.stage, stageMessage: s.message, queuePosition: s.queue_position ?? null, queueEtaSeconds: s.eta_seconds ?? null })
        await new Promise((r) => setTimeout(r, 400))
      }
    }
    poll()

    try {
      const result = await api.submitStudy(jobId, files)
      polling = false
      set((s) => ({
        status: 'done', jobId: result.job_id, metadata: result.metadata, generation: s.generation + 1,
      }))
    } catch (e) {
      polling = false
      const errors = e instanceof api.ApiError
        ? e.errors
        : [{ code: 'error', sequence: null, message: (e as Error).message }]
      set({ status: 'error', errors })
    }
  },

  runSample: async (sampleId) => {
    const jobId = api.newJobId()
    set({
      status: 'uploading', errors: [], jobId, stage: 'received', stageMessage: 'Starting…',
      activeSampleId: sampleId,
    })

    let polling = true
    const poll = async () => {
      while (polling) {
        const s = await api.pollStage(jobId)
        if (s && get().jobId === jobId) set({ stage: s.stage, stageMessage: s.message, queuePosition: s.queue_position ?? null, queueEtaSeconds: s.eta_seconds ?? null })
        await new Promise((r) => setTimeout(r, 400))
      }
    }
    poll()

    try {
      const result = await api.runSample(sampleId, jobId)
      polling = false
      set((s) => ({
        status: 'done', jobId: result.job_id, metadata: result.metadata, generation: s.generation + 1,
      }))
    } catch (e) {
      polling = false
      const errors = e instanceof api.ApiError
        ? e.errors
        : [{ code: 'error', sequence: null, message: (e as Error).message }]
      set({ status: 'error', errors })
    }
  },

  reset: () => set((s) => ({
    status: 'idle', jobId: null, metadata: null, errors: [], stage: null, stageMessage: null,
    activeSampleId: null, generation: s.generation + 1,
  })),
}))
