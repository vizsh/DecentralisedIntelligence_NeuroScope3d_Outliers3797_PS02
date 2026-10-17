import { useCallback, useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type {
  HoverInspectionPayload,
  MeshUserData,
  IntersectedMeshKind,
} from '../lib/digitalTwinTypes'
import type { Vec3 } from '../lib/volume'

// =============================================================================
// useBrainRaycaster — Custom hook for hover inspection + crosshair sync
//
//  • Fires on pointermove at ≤60 Hz (debounced via rAF)
//  • Resolves the first intersected mesh whose userData.meshKind exists
//  • Emits a HoverInspectionPayload for the tooltip popover
//  • On click, extracts the world-space intersection & userData for MPR / segment sync
// =============================================================================

export interface RaycasterResult {
  /** Current hover payload — null when not hovering anything */
  hoverPayload: HoverInspectionPayload | null
  /** The mesh kind currently highlighted (for emissive glow) */
  highlightedKind: IntersectedMeshKind | null
  /** The Three.js uuid of the hovered mesh (for per-object highlight) */
  highlightedUuid: string | null
  /** The specific brain segment id (if hovering an anatomical lobe) */
  highlightedSegmentId: string | null
}

interface UseBrainRaycasterOptions {
  /** Called when the user clicks a mesh — receives world-space xyz and mesh userData */
  onClickIntersect?: (worldPoint: Vec3, userData?: MeshUserData) => void
  /** Whether raycasting is enabled */
  enabled?: boolean
}

export function useBrainRaycaster(
  opts: UseBrainRaycasterOptions = {},
): RaycasterResult {
  const { onClickIntersect, enabled = true } = opts
  const { gl, camera, scene } = useThree()

  const [hoverPayload, setHoverPayload] = useState<HoverInspectionPayload | null>(null)
  const [highlightedKind, setHighlightedKind] = useState<IntersectedMeshKind | null>(null)
  const [highlightedUuid, setHighlightedUuid] = useState<string | null>(null)
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null)

  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerRef = useRef(new THREE.Vector2())
  const rafRef = useRef<number | null>(null)
  const lastScreenRef = useRef({ x: 0, y: 0 })

  // Debounced raycast on pointermove
  const castRay = useCallback(() => {
    if (!enabled) return

    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    const intersects = raycasterRef.current.intersectObjects(scene.children, true)

    let found: THREE.Intersection | null = null
    for (const hit of intersects) {
      const ud = hit.object.userData as MeshUserData | undefined
      if (ud?.meshKind) {
        found = hit
        break
      }
    }

    if (found) {
      const ud = found.object.userData as MeshUserData
      const p = found.point

      setHoverPayload({
        region: ud.meta,
        volumetrics: ud.volumetrics,
        provenance: ud.provenance,
        worldPoint: [p.x, p.y, p.z],
        screenPoint: { ...lastScreenRef.current },
      })
      setHighlightedKind(ud.meshKind)
      setHighlightedUuid(found.object.uuid)
      setHighlightedSegmentId(ud.segmentId ?? null)
    } else {
      setHoverPayload(null)
      setHighlightedKind(null)
      setHighlightedUuid(null)
      setHighlightedSegmentId(null)
    }

    rafRef.current = null
  }, [enabled, camera, scene])

  useEffect(() => {
    if (!enabled) return

    const canvas = gl.domElement

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointerRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      lastScreenRef.current = { x: e.clientX, y: e.clientY }

      // Throttle to 1 raycast per animation frame
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(castRay)
      }
    }

    const onPointerLeave = () => {
      setHoverPayload(null)
      setHighlightedKind(null)
      setHighlightedUuid(null)
      setHighlightedSegmentId(null)
    }

    const onClick = (e: PointerEvent) => {
      if (!onClickIntersect) return

      const rect = canvas.getBoundingClientRect()
      const ptr = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycasterRef.current.setFromCamera(ptr, camera)
      const intersects = raycasterRef.current.intersectObjects(scene.children, true)

      for (const hit of intersects) {
        const ud = hit.object.userData as MeshUserData | undefined
        if (ud?.meshKind) {
          const p = hit.point
          onClickIntersect([p.x, p.y, p.z], ud)
          break
        }
      }
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('click', onClick)

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('click', onClick)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, gl, camera, scene, castRay, onClickIntersect])

  return { hoverPayload, highlightedKind, highlightedUuid, highlightedSegmentId }
}
