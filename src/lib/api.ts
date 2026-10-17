/** Client for the local FastAPI server in backend/server — see backend/server/main.py. */

const BASE = 'http://127.0.0.1:8008'

export interface RegionVolume {
  voxels: number
  volume_ml: number
  formula: string
}

export interface RegionMetric {
  region: string
  dice: number
  sensitivity: number
  precision?: number
  intersection_voxels: number
  predicted_voxels: number
  expert_voxels: number
  /** 95th-percentile Hausdorff distance in mm; null when either mask is empty (undefined, not 0/inf) */
  hd95_mm: number | null
  hd95_definition: string
}

export interface UncertaintySummary {
  mean: number
  max: number
}

export interface ConnectivitySummary {
  component_count: number
  component_volumes_ml: number[]
  largest_fraction: number
}

export interface GeometrySummary {
  max_diameter_mm: number
  max_diameter_definition: string
  diameter_from_mm: number[]
  diameter_to_mm: number[]
  surface_area_mm2: number
  surface_area_definition: string
  centroid_voxel: number[]
  bbox_mm: number[]
}

export interface AgreementSummary {
  true_positive: number
  false_positive: number
  false_negative: number
  largest_miss_voxel: number[] | null
  largest_miss_volume_ml: number
}

export interface Finding {
  code: string
  sequence: string | null
  message: string
}

export interface SegmentMetadata {
  dims: [number, number, number]
  spacing: [number, number, number]
  affine: number[]
  regions: Record<'WT' | 'TC' | 'ET', RegionVolume>
  connectivity: Record<'WT' | 'TC' | 'ET', ConnectivitySummary>
  geometry: Record<'WT' | 'TC' | 'ET', GeometrySummary>
  expert: Record<'WT' | 'TC' | 'ET', RegionVolume> | null
  metrics: Record<'WT' | 'TC' | 'ET', RegionMetric> | null
  agreement: Record<'WT' | 'TC' | 'ET', AgreementSummary> | null
  has_expert: boolean
  has_uncertainty: boolean
  uncertainty_scale: number
  uncertainty: Record<'WT' | 'TC' | 'ET', UncertaintySummary> | null
  execution_mode?: 'model_inference' | 'heuristic_fallback' | 'synthetic_demo'
  model: {
    name: string; version: string; licence: string; source: string
    deterministic: boolean; tta_passes: number
    execution_mode?: 'model_inference' | 'heuristic_fallback' | 'synthetic_demo'
  }
  warnings: Finding[]
  input_sha256: Record<string, string>
  code_commit: string
  timestamp: string
  runtime_seconds: number
  disclaimer: string
  limitations: string[]
}

export interface SegmentResult {
  job_id: string
  status: string
  metadata: SegmentMetadata
}

export class ApiError extends Error {
  errors: Finding[]
  constructor(errors: Finding[]) {
    super(errors.map((e) => e.message).join('\n') || 'Request failed.')
    this.errors = errors
  }
}

export async function health(): Promise<{ status: string; model_ready: boolean; model_name: string } | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/health`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface UploadFiles {
  T1: File
  T1Gd: File
  T2: File
  FLAIR: File
  expert?: File
}

/** 32 lowercase hex chars, minted client-side so /status can be polled before the upload resolves. */
export function newJobId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface Stage {
  stage: string
  message: string
  at: number
  /** Present only while stage === 'queued': 0 = next in line. */
  queue_position?: number
  /** Present only while stage === 'queued': a measured-average estimate, not a guarantee. */
  eta_seconds?: number
}

export async function pollStage(jobId: string): Promise<Stage | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/jobs/${jobId}/status`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface SampleInfo {
  id: string
  label: string
  description: string
  source: 'synthetic' | 'decathlon'
  has_expert: boolean
  available: boolean
}

export async function listSamples(): Promise<SampleInfo[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/samples`)
    if (!res.ok) return []
    const body = await res.json()
    return body.samples ?? []
  } catch {
    return []
  }
}

export interface InspectResult {
  ok: boolean
  stage: string
  inference_ready: boolean
  sequences_received: string[]
  sequence_metadata: Record<string, { shape: number[]; spacing: number[]; units: string }>
  geometry: {
    compatible: boolean
    shape: number[] | null
    spacing: number[] | null
    orientation: string
  }
  warnings: Finding[]
  errors: Finding[]
}

export async function inspectStudy(files: Partial<Record<'T1' | 'T1Gd' | 'T2' | 'FLAIR' | 'expert', File>>): Promise<InspectResult> {
  const form = new FormData()
  if (files.T1) form.append('T1', files.T1)
  if (files.T1Gd) form.append('T1Gd', files.T1Gd)
  if (files.T2) form.append('T2', files.T2)
  if (files.FLAIR) form.append('FLAIR', files.FLAIR)
  if (files.expert) form.append('expert', files.expert)

  try {
    const res = await fetch(`${BASE}/api/v1/studies/inspect`, { method: 'POST', body: form })
    return await res.json()
  } catch (e) {
    return {
      ok: false,
      stage: 'validation',
      inference_ready: false,
      sequences_received: [],
      sequence_metadata: {},
      geometry: { compatible: false, shape: null, spacing: null, orientation: 'unknown' },
      warnings: [],
      errors: [{ code: 'unreachable', sequence: null, message: 'Cannot reach inspection service at ' + BASE }],
    }
  }
}

export interface DicomSeriesMeta {
  series_uid: string
  series_description: string
  modality: string
  detected_sequence: string | null
  slice_count: number
  shape: number[]
  spacing_mm: number[]
  patient_deidentified: boolean
}

export interface DicomInspectResult {
  ok: boolean
  series_count: number
  deidentified: boolean
  has_required_sequences: boolean
  auto_mapped: Record<string, string>
  series: DicomSeriesMeta[]
  warnings: Finding[]
  message?: string
}

export async function inspectDicomStudy(files: File[] | File): Promise<DicomInspectResult> {
  const form = new FormData()
  if (Array.isArray(files)) {
    for (const f of files) form.append('files', f)
  } else {
    form.append('files', files)
  }
  try {
    const res = await fetch(`${BASE}/api/v1/studies/inspect-dicom`, { method: 'POST', body: form })
    return await res.json()
  } catch {
    return {
      ok: false,
      series_count: 0,
      deidentified: false,
      has_required_sequences: false,
      auto_mapped: {},
      series: [],
      warnings: [{ code: 'unreachable', sequence: null, message: 'Cannot reach DICOM inspection service at ' + BASE }],
      message: 'Network error connecting to local server.',
    }
  }
}


export async function runSample(sampleId: string, jobId: string): Promise<SegmentResult> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api/v1/samples/${sampleId}/run/${jobId}`, { method: 'POST' })
  } catch {
    throw new ApiError([
      { code: 'unreachable', sequence: null, message: 'Cannot reach the local NeuroScope server at ' + BASE + '. Is it running?' },
    ])
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body.errors ?? [{ code: body.code ?? 'error', sequence: null, message: body.message ?? body.detail ?? `Request failed (HTTP ${res.status}).` }])
  }
  return body as SegmentResult
}

export async function submitStudy(jobId: string, files: UploadFiles): Promise<SegmentResult> {
  const form = new FormData()
  form.append('T1', files.T1)
  form.append('T1Gd', files.T1Gd)
  form.append('T2', files.T2)
  form.append('FLAIR', files.FLAIR)
  if (files.expert) form.append('expert', files.expert)

  let res: Response
  try {
    res = await fetch(`${BASE}/api/v1/segment/${jobId}`, { method: 'POST', body: form })
  } catch {
    throw new ApiError([
      { code: 'unreachable', sequence: null, message: 'Cannot reach the local NeuroScope server at ' + BASE + '. Is it running?' },
    ])
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body.errors ?? [{ code: body.code ?? 'error', sequence: null, message: body.message ?? body.detail ?? `Request failed (HTTP ${res.status}).` }])
  }
  return body as SegmentResult
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export const fetchVolume = (jobId: string, seq: 'T1' | 'T1Gd' | 'T2' | 'FLAIR') =>
  fetchBytes(`/api/v1/jobs/${jobId}/volume/${seq}`)

export const fetchLabels = (jobId: string) => fetchBytes(`/api/v1/jobs/${jobId}/labels`)

export const fetchUncertainty = (jobId: string, region: 'WT' | 'TC' | 'ET') =>
  fetchBytes(`/api/v1/jobs/${jobId}/uncertainty/${region}`)

export const fetchExpertLabels = (jobId: string) => fetchBytes(`/api/v1/jobs/${jobId}/expert-labels`)

export const reportUrl = (jobId: string) => `${BASE}/api/v1/jobs/${jobId}/report`
export const exportBundleUrl = (jobId: string) => `${BASE}/api/v1/jobs/${jobId}/export`

export interface ModelStatus {
  status: 'ready' | 'fallback'
  name: string
  version: string
  licence: string
  source: string
  execution_mode: 'model_inference' | 'heuristic_fallback' | 'synthetic_demo'
  checkpoint_sha256: string | null
  tta_passes: number
  hardware_target: string
}

export async function getModelStatus(): Promise<ModelStatus | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/models/status`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getJobManifest(jobId: string): Promise<any | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/jobs/${jobId}/manifest`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getJobComponents(jobId: string, region: 'WT' | 'TC' | 'ET'): Promise<any | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/jobs/${jobId}/components/${region}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getJobErrors(jobId: string, region: 'WT' | 'TC' | 'ET'): Promise<any | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/jobs/${jobId}/errors/${region}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function compareJobs(jobA: string, jobB: string): Promise<any | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/comparisons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_a: jobA, job_b: jobB }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export const predictionUrl = (jobId: string) => `${BASE}/api/v1/jobs/${jobId}/prediction`

// ---------------------------------------------------------------- Assistant (local Ollama only)
// Clinician/trainee tool-copilot only — never patient-facing. The backend never sends it raw
// image/voxel data, only a small docs corpus and an allow-listed subset of a job's already-
// computed metadata fields. See backend/neuroscope/assistant.py for the guardrail design.

export type AssistantMode = 'trainee' | 'clinician'

export interface AssistantHealth {
  available: boolean
  chat_model: string
  chat_model_ready: boolean
  embed_model: string
  embed_model_ready: boolean
}

export async function assistantHealth(): Promise<AssistantHealth | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/assistant/health`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface AssistantAnswer {
  answer: string
  cited_fields: string[]
  caveat: string | null
  refused: boolean
  mode: AssistantMode
}

export class AssistantError extends Error {}

export async function assistantAsk(
  question: string,
  jobId: string | null,
  mode: AssistantMode
): Promise<AssistantAnswer> {
  const res = await fetch(`${BASE}/api/v1/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, job_id: jobId, mode }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new AssistantError(body?.message || body?.detail || `Assistant request failed (${res.status}).`)
  }
  return await res.json()
}
