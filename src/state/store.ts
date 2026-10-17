import { create } from 'zustand'
import type { RegionKey } from '../lib/regions'
import type { SequenceName, Vec3 } from '../lib/volume'

export type PlaneKey = 'axial' | 'coronal' | 'sagittal'
export type MaskSource = 'predicted' | 'expert'

/** What a click on a slice does. Crosshair navigates; the others measure or
 *  re-window, so they take the pointer over from navigation while active. */
export type Tool = 'crosshair' | 'measure' | 'window'

export interface MeasurePoint {
  voxel: Vec3
  plane: PlaneKey
}

/** Greyscale window, in the same 0–255 units the slice data arrives in.
 *  The defaults reproduce the fixed ramp this viewer shipped with before the
 *  control existed, so opening the panel changes nothing until it's touched. */
export const DEFAULT_WINDOW = { center: 80, width: 180 }

interface RegionUi {
  visible: boolean
  opacity: number
}

interface State {
  sequence: SequenceName
  setSequence: (s: SequenceName) => void

  /** crosshair in voxel indices (i, j, k) */
  voxel: Vec3
  setVoxel: (v: Vec3) => void

  activePanel: PlaneKey | null
  setActivePanel: (p: PlaneKey | null) => void

  regions: Record<RegionKey, RegionUi>
  toggleRegion: (k: RegionKey) => void
  setOpacity: (k: RegionKey, o: number) => void

  brainVisible: boolean
  toggleBrain: () => void
  brainOpacity: number
  setBrainOpacity: (o: number) => void

  /** region the camera has flown to; outer shells drop to wireframe */
  isolated: RegionKey | null
  setIsolated: (k: RegionKey | null) => void

  wireframe: boolean
  setWireframe: (w: boolean) => void

  /** slow idle rotation, stopped the moment the user touches the scene */
  autoOrbit: boolean
  setAutoOrbit: (a: boolean) => void

  maskSource: MaskSource
  setMaskSource: (m: MaskSource) => void

  showOverlay: boolean
  toggleOverlay: () => void

  /** 'segmentation' washes WT/TC/ET region colours; 'uncertainty' shows the
   *  flip-TTA confidence heatmap; 'agreement' colours the prediction against
   *  the expert mask as hit / false alarm / miss. */
  overlayMode: 'segmentation' | 'uncertainty' | 'agreement'
  setOverlayMode: (m: 'segmentation' | 'uncertainty' | 'agreement') => void

  tool: Tool
  setTool: (t: Tool) => void

  /** Up to two points; the second completes a measurement, a third restarts. */
  measure: MeasurePoint[]
  pushMeasure: (p: MeasurePoint) => void
  clearMeasure: () => void

  windowCenter: number
  windowWidth: number
  setWindow: (center: number, width: number) => void
  resetWindow: () => void

  uploadOpen: boolean
  setUploadOpen: (open: boolean) => void

  datasetsOpen: boolean
  setDatasetsOpen: (open: boolean) => void

  helpOpen: boolean
  setHelpOpen: (open: boolean) => void

  assistantOpen: boolean
  setAssistantOpen: (open: boolean) => void

  /** Roadmap Section 6 Viewer Modes: Anatomy, Segmentation, Exploration */
  viewer3DMode: 'anatomy' | 'segmentation' | 'exploration'
  setViewer3DMode: (mode: 'anatomy' | 'segmentation' | 'exploration') => void

  /** Interactive 3D clipping planes for neurosurgical exploration */
  clippingEnabled: boolean
  setClippingEnabled: (enabled: boolean) => void
  clippingAxis: 'axial' | 'coronal' | 'sagittal'
  setClippingAxis: (axis: 'axial' | 'coronal' | 'sagittal') => void
  clippingOffset: number
  setClippingOffset: (offset: number) => void
}

export const useStore = create<State>((set) => ({
  sequence: 'T1Gd',
  setSequence: (sequence) => set({ sequence }),

  voxel: [80, 96, 80],
  setVoxel: (voxel) => set({ voxel }),

  activePanel: null,
  setActivePanel: (activePanel) => set({ activePanel }),

  regions: {
    WT: { visible: true, opacity: 0.28 },
    TC: { visible: true, opacity: 0.55 },
    ET: { visible: true, opacity: 0.72 },
  },
  toggleRegion: (k) =>
    set((s) => ({ regions: { ...s.regions, [k]: { ...s.regions[k], visible: !s.regions[k].visible } } })),
  setOpacity: (k, opacity) =>
    set((s) => ({ regions: { ...s.regions, [k]: { ...s.regions[k], opacity } } })),

  brainVisible: true,
  toggleBrain: () => set((s) => ({ brainVisible: !s.brainVisible })),
  brainOpacity: 0.2,
  setBrainOpacity: (brainOpacity) => set({ brainOpacity }),

  isolated: null,
  setIsolated: (isolated) => set({ isolated }),

  wireframe: false,
  setWireframe: (wireframe) => set({ wireframe }),

  autoOrbit: true,
  setAutoOrbit: (autoOrbit) => set({ autoOrbit }),

  maskSource: 'predicted',
  setMaskSource: (maskSource) => set({ maskSource }),

  showOverlay: true,
  toggleOverlay: () => set((s) => ({ showOverlay: !s.showOverlay })),

  overlayMode: 'segmentation',
  setOverlayMode: (overlayMode) => set({ overlayMode }),

  tool: 'crosshair',
  setTool: (tool) => set({ tool, ...(tool === 'measure' ? {} : { measure: [] }) }),

  measure: [],
  pushMeasure: (p) => set((s) => ({ measure: s.measure.length >= 2 ? [p] : [...s.measure, p] })),
  clearMeasure: () => set({ measure: [] }),

  windowCenter: DEFAULT_WINDOW.center,
  windowWidth: DEFAULT_WINDOW.width,
  setWindow: (windowCenter, windowWidth) => set({ windowCenter, windowWidth }),
  resetWindow: () => set({ windowCenter: DEFAULT_WINDOW.center, windowWidth: DEFAULT_WINDOW.width }),

  uploadOpen: false,
  setUploadOpen: (uploadOpen) => set({ uploadOpen }),

  datasetsOpen: false,
  setDatasetsOpen: (datasetsOpen) => set({ datasetsOpen }),

  helpOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),

  assistantOpen: false,
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),

  viewer3DMode: 'segmentation',
  setViewer3DMode: (viewer3DMode) => {
    if (viewer3DMode === 'anatomy') {
      set({ viewer3DMode, brainVisible: true, brainOpacity: 0.28, isolated: null, wireframe: false })
    } else if (viewer3DMode === 'segmentation') {
      set({ viewer3DMode, brainVisible: true, brainOpacity: 0.18 })
    } else {
      // exploration mode
      set({ viewer3DMode, autoOrbit: false })
    }
  },

  clippingEnabled: false,
  setClippingEnabled: (clippingEnabled) => set({ clippingEnabled }),
  clippingAxis: 'axial',
  setClippingAxis: (clippingAxis) => set({ clippingAxis }),
  clippingOffset: 0,
  setClippingOffset: (clippingOffset) => set({ clippingOffset }),
}))
