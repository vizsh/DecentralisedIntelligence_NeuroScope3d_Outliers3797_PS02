import type { Vec3 } from './volume'

// =============================================================================
// ANATOMICAL INSPECTION METADATA TYPES
// =============================================================================

/** Identifies which category of 3D mesh was intersected by the raycaster. */
export type IntersectedMeshKind =
  | 'brain-shell'
  | 'tumor-wt'
  | 'tumor-tc'
  | 'tumor-et'
  | 'artery'
  | 'vein'
  | 'nerve'
  | 'nucleus'
  | 'ventricle'
  | 'tract'

/** Region name and pathological state for one hoverable mesh. */
export interface AnatomicalRegionMeta {
  /** Canonical anatomical name, e.g. "Parahippocampal Gyrus (Temporal Lobe)" */
  regionName: string
  /** Pathological interpretation, e.g. "Peritumoral Edema (ED) / Whole Tumor Region (WT)" */
  pathologicalState: string
  /** Which tissue layer this mesh belongs to */
  meshKind: IntersectedMeshKind
  /** Display colour hex string, e.g. '#4fc9a6' */
  colour: string
}

/** Quantitative volumetric data for the tooltip popover. */
export interface VolumetricData {
  /** Volume in millilitres */
  volumeMl: number
  /** Total voxel count for this region */
  voxelCount: number
}

/** Clinical provenance and model uncertainty for the hovered region. */
export interface ClinicalProvenance {
  /** Test-Time Augmentation variance, e.g. "±2.5%" */
  ttaVariance: string
  /** Functional proximity notes, e.g. "Proximity to speech/auditory pathways" */
  functionalNotes: string
}

/** Complete tooltip payload emitted by the raycaster and consumed by the inspection card. */
export interface HoverInspectionPayload {
  /** The anatomical region metadata */
  region: AnatomicalRegionMeta
  /** Volumetric measurements */
  volumetrics: VolumetricData
  /** Clinical provenance and uncertainty */
  provenance: ClinicalProvenance
  /** World-space intersection point (mm, RAS+) */
  worldPoint: Vec3
  /** Screen-space cursor position for tooltip anchoring */
  screenPoint: { x: number; y: number }
}

// =============================================================================
// MPR CROSSHAIR SYNCHRONIZATION EVENT
// =============================================================================

/** Emitted when the user clicks a point on the 3D mesh to sync with MPR slices. */
export interface CrossViewportSyncEvent {
  /** World coordinates of the click intersection (mm, RAS+) */
  worldCoord: Vec3
  /** Voxel indices computed from the inverse affine */
  voxelIndex: Vec3
}

// =============================================================================
// LAYER VISIBILITY / OPACITY CONFIGURATION
// =============================================================================

export interface LayerConfig {
  visible: boolean
  opacity: number
}

export interface TwinLayerState {
  brain: LayerConfig
  wt: LayerConfig
  tc: LayerConfig
  et: LayerConfig
}

export const DEFAULT_TWIN_LAYERS: TwinLayerState = {
  brain: { visible: true, opacity: 0.2 },
  wt: { visible: true, opacity: 0.28 },
  tc: { visible: true, opacity: 0.55 },
  et: { visible: true, opacity: 0.72 },
}

// =============================================================================
// METADATA FOR EACH MESH REGISTERED WITH THE RAYCASTER
// =============================================================================

/** Attached as userData on each Three.js mesh so the raycaster can read it. */
export interface MeshUserData {
  /** The kind of anatomical mesh */
  meshKind: IntersectedMeshKind
  /** Precomputed tooltip metadata */
  meta: AnatomicalRegionMeta
  /** Precomputed volumetric data */
  volumetrics: VolumetricData
  /** Precomputed clinical provenance */
  provenance: ClinicalProvenance
  /** Unique anatomical segment identifier if this mesh is a brain segment */
  segmentId?: string
}
