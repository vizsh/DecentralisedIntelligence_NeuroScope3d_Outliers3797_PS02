import { BRATS } from './phantom'
import type { Vec3 } from './volume'
import { voxelVolumeMm3 } from './volume'

export type RegionKey = 'WT' | 'TC' | 'ET'

export interface RegionDef {
  key: RegionKey
  label: string
  short: string
  /** BraTS codes that make up this region */
  codes: number[]
  colour: string
  hex: number
}

export const REGIONS: RegionDef[] = [
  { key: 'WT', label: 'Whole Tumour', short: 'WT', codes: [BRATS.NCR, BRATS.ED, BRATS.ET], colour: '#4fc9a6', hex: 0x4fc9a6 },
  { key: 'TC', label: 'Tumour Core', short: 'TC', codes: [BRATS.NCR, BRATS.ET], colour: '#f2a75c', hex: 0xf2a75c },
  { key: 'ET', label: 'Enhancing Tumour', short: 'ET', codes: [BRATS.ET], colour: '#e8738e', hex: 0xe8738e },
]

export function regionMask(label: Uint8Array, codes: number[]): Uint8Array {
  const out = new Uint8Array(label.length)
  const a = codes[0] ?? -1, b = codes[1] ?? -1, c = codes[2] ?? -1
  for (let p = 0; p < label.length; p++) {
    const v = label[p]
    if (v === a || v === b || v === c) out[p] = 1
  }
  return out
}

export function countVoxels(mask: Uint8Array): number {
  let n = 0
  for (let p = 0; p < mask.length; p++) if (mask[p]) n++
  return n
}

export function volumeML(voxels: number, spacing: Vec3): number {
  return (voxels * voxelVolumeMm3(spacing)) / 1000
}

export interface Metric {
  dice: number
  sensitivity: number
  intersection: number
  predicted: number
  expert: number
}

export function compare(pred: Uint8Array, truth: Uint8Array): Metric {
  let inter = 0, p = 0, t = 0
  for (let i = 0; i < pred.length; i++) {
    const a = pred[i] ? 1 : 0
    const b = truth[i] ? 1 : 0
    p += a; t += b
    if (a && b) inter++
  }
  return {
    dice: p + t === 0 ? 1 : (2 * inter) / (p + t),
    sensitivity: t === 0 ? 1 : inter / t,
    intersection: inter,
    predicted: p,
    expert: t,
  }
}

export interface RegionReport {
  def: RegionDef
  predVoxels: number
  predML: number
  expertVoxels: number
  expertML: number
  metric: Metric
  fractionOfBrain: number
}

export interface MaskDiffSide {
  count: number
  volumeML: number
  /** voxel-index centroid of this side's voxels; null if there are none */
  centroid: Vec3 | null
}

/** Where the model and the expert mask disagree for one region, computed
 *  directly from the two label masks — real per-case geometry, not a
 *  canned example. `fp` = model flagged tumour the expert didn't (over-call),
 *  `fn` = the expert flagged tumour the model missed (under-call). */
export function diffStats(
  predicted: Uint8Array, expert: Uint8Array, dims: Vec3, spacing: Vec3,
): { fp: MaskDiffSide; fn: MaskDiffSide } {
  const [nx, ny, nz] = dims
  let fpN = 0, fpX = 0, fpY = 0, fpZ = 0
  let fnN = 0, fnX = 0, fnY = 0, fnZ = 0
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      const row = nx * (j + ny * k)
      for (let i = 0; i < nx; i++) {
        const idx = row + i
        const p = predicted[idx], e = expert[idx]
        if (p && !e) { fpN++; fpX += i; fpY += j; fpZ += k }
        else if (!p && e) { fnN++; fnX += i; fnY += j; fnZ += k }
      }
    }
  }
  return {
    fp: {
      count: fpN, volumeML: volumeML(fpN, spacing),
      centroid: fpN ? [Math.round(fpX / fpN), Math.round(fpY / fpN), Math.round(fpZ / fpN)] : null,
    },
    fn: {
      count: fnN, volumeML: volumeML(fnN, spacing),
      centroid: fnN ? [Math.round(fnX / fnN), Math.round(fnY / fnN), Math.round(fnZ / fnN)] : null,
    },
  }
}

export function buildReport(
  predicted: Uint8Array, expert: Uint8Array, brainVoxels: number, spacing: Vec3,
): Record<RegionKey, RegionReport> {
  const out = {} as Record<RegionKey, RegionReport>
  for (const def of REGIONS) {
    const pm = regionMask(predicted, def.codes)
    const em = regionMask(expert, def.codes)
    const pv = countVoxels(pm)
    const ev = countVoxels(em)
    out[def.key] = {
      def,
      predVoxels: pv,
      predML: volumeML(pv, spacing),
      expertVoxels: ev,
      expertML: volumeML(ev, spacing),
      metric: compare(pm, em),
      fractionOfBrain: brainVoxels ? pv / brainVoxels : 0,
    }
  }
  return out
}
