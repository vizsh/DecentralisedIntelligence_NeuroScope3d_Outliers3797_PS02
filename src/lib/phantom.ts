import type { Mat4, ScalarVolume, SequenceName, Vec3 } from './volume'
import { makeAffine, SEQUENCES, voxelToWorld } from './volume'

export const TISSUE = {
  BG: 0, CSF: 1, GREY: 2, WHITE: 3, NCR: 4, ET: 5, ED: 6,
} as const

/** BraTS 2021 label codes. */
export const BRATS = { NCR: 1, ED: 2, ET: 4 } as const

export interface Study {
  dims: Vec3
  spacing: Vec3
  affine: Mat4
  sequences: Record<SequenceName, ScalarVolume>
  /** expert annotation, BraTS codes 0/1/2/4 */
  expert: Uint8Array
  /** model output, BraTS codes 0/1/2/4 */
  predicted: Uint8Array
  /** every in-head voxel, used for the volume denominator */
  brain: Uint8Array
  /** parenchyma only (CSF excluded) — this is what the 3D shell is meshed from */
  surface: Uint8Array
  caseId: string
}

/** Smooth value noise on a coarse lattice, sampled in normalised volume space. */
function makeNoise(seed: number, n: number) {
  const g = new Float32Array(n * n * n)
  let s = seed >>> 0
  for (let i = 0; i < g.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    g[i] = (s / 4294967296) * 2 - 1
  }
  const fade = (t: number) => t * t * (3 - 2 * t)
  return (u: number, v: number, w: number) => {
    const x = Math.min(n - 1.001, Math.max(0, u * (n - 1)))
    const y = Math.min(n - 1.001, Math.max(0, v * (n - 1)))
    const z = Math.min(n - 1.001, Math.max(0, w * (n - 1)))
    const xi = x | 0, yi = y | 0, zi = z | 0
    const tx = fade(x - xi), ty = fade(y - yi), tz = fade(z - zi)
    const at = (a: number, b: number, c: number) => g[a + n * (b + n * c)]
    const c00 = at(xi, yi, zi) + tx * (at(xi + 1, yi, zi) - at(xi, yi, zi))
    const c10 = at(xi, yi + 1, zi) + tx * (at(xi + 1, yi + 1, zi) - at(xi, yi + 1, zi))
    const c01 = at(xi, yi, zi + 1) + tx * (at(xi + 1, yi, zi + 1) - at(xi, yi, zi + 1))
    const c11 = at(xi, yi + 1, zi + 1) + tx * (at(xi + 1, yi + 1, zi + 1) - at(xi, yi + 1, zi + 1))
    const c0 = c00 + ty * (c10 - c00)
    const c1 = c01 + ty * (c11 - c01)
    return c0 + tz * (c1 - c0)
  }
}

interface TumourSpec {
  centre: Vec3
  rNcr: number
  rEt: number
  rEd: number
  phase: number
}

function buildLabels(
  dims: Vec3, affine: Mat4, tumour: TumourSpec, warp: (x: number, y: number, z: number) => number,
): Uint8Array {
  const [nx, ny, nz] = dims
  const out = new Uint8Array(nx * ny * nz)
  const [cx, cy, cz] = tumour.centre
  const reach = tumour.rEd * 1.8
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      const row = nx * (j + ny * k)
      for (let i = 0; i < nx; i++) {
        const [x, y, z] = voxelToWorld(affine, i, j, k)
        const dx = x - cx, dy = y - cy, dz = z - cz
        const r = Math.hypot(dx, dy * 0.92, dz * 1.08)
        if (r > reach) continue
        // Irregular boundary: scale the radius by a smooth lobed modulation.
        const m = 1 + 0.26 * warp(dx / reach, dy / reach, dz / reach)
        const rn = r / m
        let code = 0
        if (rn < tumour.rNcr) code = BRATS.NCR
        else if (rn < tumour.rEt) {
          // Enhancement is a broken rim, so necrosis reaches oedema in places.
          const gap = warp(dx / reach + 1.3, dy / reach - 0.9, dz / reach + 0.6)
          code = gap < -0.35 ? BRATS.NCR : BRATS.ET
        } else if (rn < tumour.rEd) code = BRATS.ED
        if (code) out[row + i] = code
      }
    }
  }
  return out
}

// Default id for the procedurally-generated phantom. Never a real dataset's case ID —
// BraTS 2021 itself has never been obtained (it's human-gated, see
// docs/IMPLEMENTATION_PLAN.md Phase 1b) — so defaulting this to something that looks
// like a real BraTS 2021 case id would be exactly the kind of fabricated-looking claim
// CLAUDE.md's rule 1 exists to prevent, even though it's "just" a synthetic demo.
export function generateStudy(caseId = 'synthetic_demo_phantom'): Study {
  const dims: Vec3 = [160, 192, 160]
  const spacing: Vec3 = [1.1, 1.1, 1.1]
  const affine = makeAffine(spacing, dims)
  const [nx, ny, nz] = dims
  const total = nx * ny * nz

  const nSurface = makeNoise(7, 10)
  const nSulci = makeNoise(21, 18)
  const nTissue = makeNoise(99, 24)
  const nGrain = makeNoise(5, 40)
  const nTumA = makeNoise(1337, 8)
  const nTumB = makeNoise(4242, 8)

  const tissue = new Uint8Array(total)
  const brain = new Uint8Array(total)

  const RX = 72, RY = 92, RZ = 70

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      const row = nx * (j + ny * k)
      for (let i = 0; i < nx; i++) {
        const [x, y, z] = voxelToWorld(affine, i, j, k)
        const u = (x / 180) + 0.5, v = (y / 220) + 0.5, w = (z / 180) + 0.5

        // Cerebrum: ellipsoid, flattened inferiorly, with a lumpy cortical edge.
        const zz = z > 0 ? z / RZ : z / (RZ * 0.82)
        let e = (x / RX) ** 2 + (y / RY) ** 2 + zz ** 2
        e *= 1 - 0.07 * nSurface(u, v, w)
        let inside = e < 1

        // Cerebellum and brainstem so the shell is recognisably a brain.
        const cereb = ((x / 44) ** 2 + ((y + 62) / 34) ** 2 + ((z + 46) / 24) ** 2) < 1
        const s = (-14 - z) / 62
        const stemR = s >= 0 && s <= 1 ? 11 * Math.sqrt(1 - s * s) : 0
        const stem = stemR > 0.5 && ((x / stemR) ** 2 + ((y + 24) / (stemR * 1.3)) ** 2) < 1
        if (cereb || stem) inside = true

        if (!inside) continue
        brain[row + i] = 1

        const depth = 1 - e

        let t: number
        if (depth < 0.26) {
          // Sulci are the thin zero level set of the fold field, not blobs; the
          // sheet narrows with depth so they taper the way real sulci do.
          // Lower frequency and a wider sheet, so each sulcus spans 2-3 voxels and
          // survives meshing — a sub-voxel groove just disappears into the surface.
          const fold = nSulci(u * 1.9, v * 1.9, w * 1.9)
          const width = 0.3 * (1 - depth / 0.26) + 0.04
          t = Math.abs(fold) < width ? TISSUE.CSF : TISSUE.GREY
        } else {
          t = TISSUE.WHITE
          if (nTissue(u * 1.3, v * 1.3, w * 1.3) > 0.72) t = TISSUE.GREY
        }

        // Deep grey — thalamus and basal ganglia.
        const deepGrey = ((Math.abs(x) - 15) / 9) ** 2 + ((y - 2) / 21) ** 2 + ((z - 1) / 13) ** 2 < 1
        if (deepGrey) t = TISSUE.GREY

        // Lateral ventricles: slim and curved, sitting inside the deep grey.
        const vx = Math.abs(x) - 11
        const ventricle = (vx / 5) ** 2 + ((y - 2) / 27) ** 2 + ((z - 7) / 7) ** 2 < 1
        if (ventricle) t = TISSUE.CSF

        // Interhemispheric fissure, open superiorly, closed at the corpus callosum.
        // Wide enough that the two hemispheres read as separate bodies in 3D.
        const fissure = Math.abs(x) < 6.0 + 1.4 * nSurface(u, v * 2, w) && z > -4 && Math.abs(y) < 86
        if (fissure && !stem) t = TISSUE.CSF
        if (cereb) {
          const folia = nSulci(u * 4.2, v * 4.2, w * 4.2)
          t = Math.abs(folia) < 0.1 ? TISSUE.CSF : TISSUE.GREY
        }
        if (stem) t = TISSUE.WHITE

        tissue[row + i] = t
      }
    }
  }

  // Expert annotation and a deliberately imperfect model output.
  const expertSpec: TumourSpec = { centre: [33, 7, 13], rNcr: 11.4, rEt: 15.4, rEd: 20.8, phase: 0 }
  const predSpec: TumourSpec = {
    centre: [34.3, 5.9, 13.9], rNcr: 10.7, rEt: 15.1, rEd: 21.6, phase: 1,
  }
  const warpA = (a: number, b: number, c: number) => nTumA(a * 0.5 + 0.5, b * 0.5 + 0.5, c * 0.5 + 0.5)
  const warpB = (a: number, b: number, c: number) =>
    0.82 * nTumA(a * 0.5 + 0.5, b * 0.5 + 0.5, c * 0.5 + 0.5) +
    0.30 * nTumB(a * 0.5 + 0.5, b * 0.5 + 0.5, c * 0.5 + 0.5)

  const expert = buildLabels(dims, affine, expertSpec, warpA)
  const predicted = buildLabels(dims, affine, predSpec, warpB)

  // Burn the expert annotation into the tissue map so the imagery matches it.
  const surface = new Uint8Array(total)
  for (let p = 0; p < total; p++) {
    if (!brain[p]) { expert[p] = 0; predicted[p] = 0; continue }
    const c = expert[p]
    if (c === BRATS.NCR) tissue[p] = TISSUE.NCR
    else if (c === BRATS.ET) tissue[p] = TISSUE.ET
    else if (c === BRATS.ED) tissue[p] = TISSUE.ED
    if (tissue[p] !== TISSUE.CSF) surface[p] = 1
  }

  // Per-sequence appearance: base intensity per tissue class plus grain.
  const LUT: Record<SequenceName, number[]> = {
    //        BG  CSF GREY WHITE NCR  ET   ED
    T1:    [0, 12, 44, 112, 158, 62, 104, 96],
    T1Gd:  [0, 12, 46, 114, 160, 58, 236, 100],
    T2:    [0, 14, 196, 120, 82, 178, 150, 214],
    FLAIR: [0, 14, 28, 128, 96, 150, 160, 228],
  } as unknown as Record<SequenceName, number[]>

  const sequences = {} as Record<SequenceName, ScalarVolume>
  for (const seq of SEQUENCES) {
    const lut = LUT[seq]
    const data = new Uint8Array(total)
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        const row = nx * (j + ny * k)
        for (let i = 0; i < nx; i++) {
          const p = row + i
          const t = tissue[p]
          if (t === TISSUE.BG) continue
          const base = lut[t]
          const grain = nGrain(i / nx, j / ny, k / nz) * 11
          const v = base + grain
          data[p] = v < 0 ? 0 : v > 255 ? 255 : v
        }
      }
    }
    sequences[seq] = { data, dims, spacing, affine }
  }

  return { dims, spacing, affine, sequences, expert, predicted, brain, surface, caseId }
}
