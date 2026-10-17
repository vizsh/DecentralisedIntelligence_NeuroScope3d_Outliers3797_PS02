import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { GizmoHelper, GizmoViewcube, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  ELOQUENT_STRUCTURES,
  createVentriclesGeometry,
  createTractStreamlines,
  createEloquentPatchGeometry,
  evaluateTissueProbe,
  type TissueProbeTelemetry,
  type EloquentStructure,
} from '../lib/anatomicalStructures'
import { meshCentroid } from '../lib/meshing'
import { REGIONS, type RegionKey } from '../lib/regions'
import type { Mesh as IsoMesh } from '../lib/surfaceNets'
import { voxelToWorld, worldToVoxel, type Vec3 } from '../lib/volume'
import { useStore } from '../state/store'
import { useStudy } from '../state/study'

function useGeometry(mesh: IsoMesh | null) {
  return useMemo(() => {
    if (!mesh || mesh.indices.length === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
    g.computeBoundingSphere()
    return g
  }, [mesh])
}

/**
 * Region surface supporting PBR materials, wireframe lattice, clipping planes,
 * and concentric radial explosion for interior tumor peeling.
 */
function RegionSurface({
  mesh,
  lattice,
  hex,
  opacity,
  visible,
  wireOnly,
  order,
  onSelect,
  clipPlanes,
  explosionOffset = 0,
  explosionNormal = [0, 0, 0],
  isUncertaintyMode = false,
}: {
  mesh: IsoMesh | null
  lattice: IsoMesh | null
  hex: number
  opacity: number
  visible: boolean
  wireOnly: boolean
  order: number
  onSelect: (e: ThreeEvent<MouseEvent>) => void
  clipPlanes?: THREE.Plane[]
  explosionOffset?: number
  explosionNormal?: [number, number, number]
  isUncertaintyMode?: boolean
}) {
  const geometry = useGeometry(mesh)
  const latticeGeometry = useGeometry(lattice)
  const [hovered, setHovered] = useState(false)
  if (!geometry) return null
  const wireGeometry = latticeGeometry ?? geometry

  // Compute position offset for layer explosion
  const positionOffset: [number, number, number] = [
    explosionNormal[0] * explosionOffset,
    explosionNormal[1] * explosionOffset,
    explosionNormal[2] * explosionOffset,
  ]

  const displayHex = isUncertaintyMode
    ? hex === 0x286f65
      ? 0xef4444 // WT boundary: high uncertainty red
      : hex === 0x8b5218
      ? 0xf59e0b // TC: transition gold
      : 0x38bdf8 // ET: confident cyan
    : hex

  return (
    <group
      visible={visible}
      position={positionOffset}
      onClick={onSelect}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      {!wireOnly && (
        <mesh geometry={geometry} renderOrder={order}>
          <meshPhysicalMaterial
            color={displayHex}
            transparent
            opacity={opacity}
            roughness={0.32}
            metalness={0.08}
            clearcoat={0.7}
            clearcoatRoughness={0.3}
            side={THREE.DoubleSide}
            depthWrite={false}
            fog={false}
            toneMapped={false}
            emissive={displayHex}
            emissiveIntensity={hovered ? 0.55 : isUncertaintyMode ? 0.35 : 0.18}
            clippingPlanes={clipPlanes}
            clipShadows={true}
          />
        </mesh>
      )}
      <mesh geometry={wireGeometry} renderOrder={order + 0.5}>
        <meshBasicMaterial
          color={displayHex}
          wireframe
          transparent
          fog={false}
          toneMapped={false}
          opacity={wireOnly ? (hovered ? 0.95 : 0.72) : Math.min(0.34, opacity * 0.4 + 0.08)}
          depthWrite={false}
          clippingPlanes={clipPlanes}
        />
      </mesh>
    </group>
  )
}

const FRESNEL_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const FRESNEL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uIntensity;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float f = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), uPower);
    gl_FragColor = vec4(uColor * f * uIntensity, f * uIntensity);
  }
`

function FresnelShell({
  geometry,
  intensity,
  clipPlanes,
}: {
  geometry: THREE.BufferGeometry
  intensity: number
  clipPlanes?: THREE.Plane[]
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(0xa5f3fc) },
      uPower: { value: 2.8 },
      uIntensity: { value: intensity },
    }),
    [],
  )
  uniforms.uIntensity.value = intensity

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <shaderMaterial
        vertexShader={FRESNEL_VERT}
        fragmentShader={FRESNEL_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        clipping={Boolean(clipPlanes && clipPlanes.length > 0)}
        clippingPlanes={clipPlanes}
      />
    </mesh>
  )
}

function BrainShell({
  mesh,
  lattice,
  opacity,
  visible,
  clipPlanes,
  onProbe,
}: {
  mesh: IsoMesh | null
  lattice: IsoMesh | null
  opacity: number
  visible: boolean
  clipPlanes?: THREE.Plane[]
  onProbe?: (point: THREE.Vector3) => void
}) {
  const geometry = useGeometry(mesh)
  const latticeGeometry = useGeometry(lattice)
  if (!geometry) return null
  const wireGeometry = latticeGeometry ?? geometry

  return (
    <group
      visible={visible}
      onClick={(e) => {
        if (onProbe) {
          e.stopPropagation()
          onProbe(e.point)
        }
      }}
    >
      {/* Backside pass for deep specimen-in-glass refraction */}
      <mesh geometry={geometry} renderOrder={0}>
        <meshPhysicalMaterial
          color={0x475569}
          transparent
          opacity={opacity * 0.25}
          roughness={0.8}
          metalness={0.05}
          side={THREE.BackSide}
          depthWrite={false}
          clippingPlanes={clipPlanes}
          clipShadows={true}
        />
      </mesh>
      {/* Frontside pass with clearcoat glass reflections */}
      <mesh geometry={geometry} renderOrder={1}>
        <meshPhysicalMaterial
          color={0x94a3b8}
          transparent
          opacity={opacity}
          roughness={0.4}
          metalness={0.1}
          clearcoat={0.85}
          clearcoatRoughness={0.25}
          side={THREE.FrontSide}
          depthWrite={false}
          clippingPlanes={clipPlanes}
          clipShadows={true}
        />
      </mesh>
      {/* Filament lattice overlay */}
      <mesh geometry={wireGeometry} renderOrder={2}>
        <meshBasicMaterial
          color={0x7dd3fc}
          wireframe
          transparent
          opacity={opacity * 0.18}
          depthWrite={false}
          clippingPlanes={clipPlanes}
        />
      </mesh>
      <FresnelShell geometry={geometry} intensity={opacity * 1.1} clipPlanes={clipPlanes} />
    </group>
  )
}

/**
 * 3D Ventricular System (CSF Cavities) — evaluates hydrocephalus and ventricular invasion risk.
 */
function Ventricles3D({
  visible,
  clipPlanes,
  onProbe,
}: {
  visible: boolean
  clipPlanes?: THREE.Plane[]
  onProbe?: (point: THREE.Vector3) => void
}) {
  const geom = useMemo(() => createVentriclesGeometry(), [])
  const [hovered, setHovered] = useState(false)

  return (
    <group
      visible={visible}
      onClick={(e) => {
        e.stopPropagation()
        if (onProbe) onProbe(e.point)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh geometry={geom} renderOrder={2.8}>
        <meshPhysicalMaterial
          color={0x06b6d4}
          emissive={0x0284c7}
          emissiveIntensity={hovered ? 0.65 : 0.35}
          transparent
          opacity={0.65}
          roughness={0.15}
          metalness={0.1}
          clearcoat={0.9}
          side={THREE.DoubleSide}
          depthWrite={false}
          clippingPlanes={clipPlanes}
        />
      </mesh>
      <mesh geometry={geom} renderOrder={2.9}>
        <meshBasicMaterial
          color={0x38bdf8}
          wireframe
          transparent
          opacity={hovered ? 0.5 : 0.25}
          depthWrite={false}
          clippingPlanes={clipPlanes}
        />
      </mesh>
    </group>
  )
}

/**
 * 3D White-Matter Tractography Streamlines (CST and Arcuate Fasciculus).
 */
function Tractography3D({
  visible,
  clipPlanes,
  tumorCentroid,
  onProbe,
}: {
  visible: boolean
  clipPlanes?: THREE.Plane[]
  tumorCentroid: [number, number, number]
  onProbe?: (point: THREE.Vector3) => void
}) {
  const tracts = useMemo(() => createTractStreamlines(), [])
  const [hoveredTract, setHoveredTract] = useState<string | null>(null)

  // Determine if tumor is encroaching CST (< 14mm)
  const cstProximityRisk = useMemo(() => {
    const leftCst = ELOQUENT_STRUCTURES.find((s) => s.id === 'cst-l')
    if (!leftCst) return false
    const d = Math.hypot(
      tumorCentroid[0] - leftCst.centerWorld[0],
      tumorCentroid[1] - leftCst.centerWorld[1],
      tumorCentroid[2] - leftCst.centerWorld[2],
    )
    return d < 14.0
  }, [tumorCentroid])

  return (
    <group visible={visible}>
      {tracts.map((tract) => {
        const isHovered = hoveredTract === tract.id
        const isWarning = tract.id.startsWith('cst') && cstProximityRisk
        const displayColor = isWarning ? 0xf59e0b : tract.color

        return (
          <group
            key={tract.id}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoveredTract(tract.id)
            }}
            onPointerOut={() => setHoveredTract(null)}
            onClick={(e) => {
              e.stopPropagation()
              if (onProbe) onProbe(e.point)
            }}
          >
            {tract.tubes.map((tube, i) => (
              <mesh key={i} geometry={tube} renderOrder={3.2}>
                <meshPhysicalMaterial
                  color={displayColor}
                  emissive={displayColor}
                  emissiveIntensity={isHovered ? 0.75 : isWarning ? 0.6 : 0.3}
                  transparent
                  opacity={isHovered ? 0.95 : 0.78}
                  roughness={0.2}
                  metalness={0.2}
                  clippingPlanes={clipPlanes}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        )
      })}
    </group>
  )
}

/**
 * Eloquent Cortical Functional Zones (Motor Strip, Broca, Wernicke).
 */
function EloquentPatches3D({
  visible,
  clipPlanes,
  activeZone,
  onSelectZone,
  onProbe,
}: {
  visible: boolean
  clipPlanes?: THREE.Plane[]
  activeZone: string | null
  onSelectZone: (zone: EloquentStructure) => void
  onProbe?: (point: THREE.Vector3) => void
}) {
  const patches = useMemo(() => {
    return ELOQUENT_STRUCTURES.filter((s) => s.category === 'cortex').map((struct) => ({
      struct,
      geometry: createEloquentPatchGeometry(struct.centerWorld, 14),
    }))
  }, [])

  return (
    <group visible={visible}>
      {patches.map(({ struct, geometry }) => {
        const isSelected = activeZone === struct.id
        return (
          <group
            key={struct.id}
            onClick={(e) => {
              e.stopPropagation()
              onSelectZone(struct)
              if (onProbe) onProbe(e.point)
            }}
          >
            <mesh geometry={geometry} renderOrder={3.5}>
              <meshPhysicalMaterial
                color={struct.hex}
                emissive={struct.hex}
                emissiveIntensity={isSelected ? 0.8 : 0.38}
                transparent
                opacity={isSelected ? 0.85 : 0.55}
                roughness={0.3}
                metalness={0.1}
                clearcoat={0.8}
                side={THREE.DoubleSide}
                depthWrite={false}
                clippingPlanes={clipPlanes}
              />
            </mesh>
            {/* Outline ring */}
            <mesh geometry={geometry} renderOrder={3.6}>
              <meshBasicMaterial
                color={0xffffff}
                wireframe
                transparent
                opacity={isSelected ? 0.65 : 0.25}
                depthWrite={false}
                clippingPlanes={clipPlanes}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/**
 * Neurosurgical Resection Corridor & Trajectory Simulator.
 */
function SurgicalCorridor3D({
  visible,
  targetPoint,
}: {
  visible: boolean
  targetPoint: [number, number, number]
}) {
  const corridor = useMemo(() => {
    const target = new THREE.Vector3(...targetPoint)
    // Find cranial entry along lateral/superior approach avoiding motor strip
    const entry = target.clone().add(new THREE.Vector3(38, 28, 48).normalize().multiplyScalar(58))
    const length = target.distanceTo(entry)
    const midPoint = target.clone().add(entry).multiplyScalar(0.5)

    const orientation = new THREE.Matrix4()
    const dir = target.clone().sub(entry).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    orientation.lookAt(entry, target, up)
    orientation.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))

    return {
      target,
      entry,
      length,
      midPoint,
      corridorGeometry: new THREE.CylinderGeometry(6, 6, length, 24, 1, true),
      pathPoints: new Float32Array([entry.x, entry.y, entry.z, target.x, target.y, target.z]),
    }
  }, [targetPoint])

  if (!visible) return null

  return (
    <group>
      {/* 12mm Tubular Retractor Corridor */}
      <mesh
        geometry={corridor.corridorGeometry}
        position={corridor.midPoint}
        quaternion={new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(
            corridor.entry,
            corridor.target,
            new THREE.Vector3(0, 0, 1),
          ).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)),
        )}
        renderOrder={4.1}
      >
        <meshPhysicalMaterial
          color={0x38bdf8}
          emissive={0x0284c7}
          emissiveIntensity={0.25}
          transparent
          opacity={0.28}
          roughness={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Central Trajectory Guideline */}
      <group renderOrder={4.2}>
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[corridor.pathPoints, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={0x38bdf8} depthTest={false} />
        </line>
      </group>

      {/* Craniotomy Entry Ring on Skull */}
      <mesh position={corridor.entry} renderOrder={4.3}>
        <ringGeometry args={[6, 7.5, 32]} />
        <meshBasicMaterial color={0xf59e0b} side={THREE.DoubleSide} depthTest={false} />
      </mesh>

      {/* Target Marker at Centroid */}
      <mesh position={corridor.target} renderOrder={4.3}>
        <sphereGeometry args={[2.8, 16, 16]} />
        <meshBasicMaterial color={0xef4444} depthTest={false} />
      </mesh>
    </group>
  )
}

/**
 * 3D Holographic Probe Pin placed at clicked surface point.
 */
function ProbePin3D({ probe }: { probe: TissueProbeTelemetry | null }) {
  if (!probe) return null
  const [wx, wy, wz] = probe.world
  const normal = probe.cranialNormal

  const stemPoints = useMemo(() => {
    return new Float32Array([
      wx, wy, wz,
      wx + normal[0] * 18, wy + normal[1] * 18, wz + normal[2] * 18,
    ])
  }, [wx, wy, wz, normal])

  return (
    <group renderOrder={5}>
      {/* Surface target node */}
      <mesh position={[wx, wy, wz]}>
        <sphereGeometry args={[2.2, 16, 16]} />
        <meshBasicMaterial color={0x38bdf8} depthTest={false} />
      </mesh>

      {/* Outer pulsing ring */}
      <mesh position={[wx, wy, wz]}>
        <ringGeometry args={[3.2, 4.4, 24]} />
        <meshBasicMaterial color={0x38bdf8} transparent opacity={0.7} side={THREE.DoubleSide} depthTest={false} />
      </mesh>

      {/* Normal needle stem */}
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stemPoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={0x38bdf8} linewidth={2} depthTest={false} />
      </line>

      {/* Top flag bead */}
      <mesh position={[wx + normal[0] * 18, wy + normal[1] * 18, wz + normal[2] * 18]}>
        <sphereGeometry args={[2.8, 16, 16]} />
        <meshBasicMaterial color={0xf59e0b} depthTest={false} />
      </mesh>
    </group>
  )
}

/**
 * Direct 3D Caliper & Distance Measurement Tool.
 */
function Ruler3D({ points }: { points: Vec3[] }) {
  if (points.length === 0) return null
  const p1 = points[0]
  const p2 = points[1]

  const linePoints = useMemo(() => {
    if (!p2) return null
    return new Float32Array([p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]])
  }, [p1, p2])

  const distance = p2 ? Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) : null

  return (
    <group renderOrder={5}>
      <mesh position={p1}>
        <sphereGeometry args={[2.5, 16, 16]} />
        <meshBasicMaterial color={0x10b981} depthTest={false} />
      </mesh>
      {p2 && linePoints && (
        <>
          <mesh position={p2}>
            <sphereGeometry args={[2.5, 16, 16]} />
            <meshBasicMaterial color={0x10b981} depthTest={false} />
          </mesh>
          <line>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={0x10b981} linewidth={2} depthTest={false} />
          </line>
        </>
      )}
    </group>
  )
}

function Crosshair3D({ position, extent }: { position: [number, number, number]; extent: number }) {
  const axes: Array<{ dir: [number, number, number]; colour: number }> = [
    { dir: [1, 0, 0], colour: 0xff5f6d },
    { dir: [0, 1, 0], colour: 0x6ee7a8 },
    { dir: [0, 0, 1], colour: 0x6cb6ff },
  ]
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[2.2, 16, 16]} />
        <meshBasicMaterial color={0x7dd3fc} />
      </mesh>
      {axes.map(({ dir, colour }, i) => {
        const pts = new Float32Array([
          -dir[0] * extent, -dir[1] * extent, -dir[2] * extent,
          dir[0] * extent, dir[1] * extent, dir[2] * extent,
        ])
        return (
          <line key={i}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[pts, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={colour} transparent opacity={0.45} depthTest={false} />
          </line>
        )
      })}
    </group>
  )
}

function SlicePlanes3D({
  crosshairWorld,
  centerWorld,
  extent,
  showAxial,
  showCoronal,
  showSagittal,
  opacity = 0.18,
}: {
  crosshairWorld: [number, number, number]
  centerWorld: [number, number, number]
  extent: [number, number, number]
  showAxial: boolean
  showCoronal: boolean
  showSagittal: boolean
  opacity?: number
}) {
  const [wX, wY, wZ] = extent

  return (
    <group>
      {showAxial && (
        <group position={[centerWorld[0], centerWorld[1], crosshairWorld[2]]}>
          <mesh renderOrder={1}>
            <planeGeometry args={[wX * 1.15, wY * 1.15]} />
            <meshBasicMaterial color={0x0284c7} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineSegments renderOrder={1.1}>
            <edgesGeometry args={[new THREE.PlaneGeometry(wX * 1.15, wY * 1.15)]} />
            <lineBasicMaterial color={0x38bdf8} transparent opacity={0.75} depthTest={false} />
          </lineSegments>
        </group>
      )}

      {showCoronal && (
        <group position={[centerWorld[0], crosshairWorld[1], centerWorld[2]]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh renderOrder={1}>
            <planeGeometry args={[wX * 1.15, wZ * 1.15]} />
            <meshBasicMaterial color={0x059669} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineSegments renderOrder={1.1}>
            <edgesGeometry args={[new THREE.PlaneGeometry(wX * 1.15, wZ * 1.15)]} />
            <lineBasicMaterial color={0x34d399} transparent opacity={0.75} depthTest={false} />
          </lineSegments>
        </group>
      )}

      {showSagittal && (
        <group position={[crosshairWorld[0], centerWorld[1], centerWorld[2]]} rotation={[0, Math.PI / 2, 0]}>
          <mesh renderOrder={1}>
            <planeGeometry args={[wY * 1.15, wZ * 1.15]} />
            <meshBasicMaterial color={0xd97706} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineSegments renderOrder={1.1}>
            <edgesGeometry args={[new THREE.PlaneGeometry(wY * 1.15, wZ * 1.15)]} />
            <lineBasicMaterial color={0xfbbf24} transparent opacity={0.75} depthTest={false} />
          </lineSegments>
        </group>
      )}
    </group>
  )
}

interface FlyTarget {
  centre: THREE.Vector3
  distance: number
}

function CameraRig({
  target,
  spin,
  onInteract,
}: {
  target: FlyTarget | null
  spin: boolean
  onInteract: () => void
}) {
  const controls = useRef<any>(null)
  const { camera } = useThree()
  const goal = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null)

  useEffect(() => {
    if (!target || !controls.current) return
    const dir = camera.position.clone().sub(controls.current.target).normalize()
    goal.current = {
      pos: target.centre.clone().add(dir.multiplyScalar(target.distance)),
      look: target.centre.clone(),
    }
  }, [target, camera])

  useFrame(() => {
    const c = controls.current
    if (!c) return
    if (goal.current) {
      camera.position.lerp(goal.current.pos, 0.08)
      c.target.lerp(goal.current.look, 0.08)
      if (camera.position.distanceTo(goal.current.pos) < 0.6) goal.current = null
    }
    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.7}
      minDistance={45}
      maxDistance={750}
      autoRotate={spin}
      autoRotateSpeed={0.4}
      onStart={onInteract}
      makeDefault
    />
  )
}

function Scene({
  show3DAxial,
  show3DCoronal,
  show3DSagittal,
  onProbeHit,
}: {
  show3DAxial: boolean
  show3DCoronal: boolean
  show3DSagittal: boolean
  onProbeHit: (point: THREE.Vector3) => void
}) {
  const bundle = useStudy()
  const { study, brainMesh, brainLattice, meshes, lattices } = bundle
  const { gl } = useThree()
  const {
    regions, brainVisible, brainOpacity, isolated, setIsolated,
    wireframe, voxel, maskSource, autoOrbit, setAutoOrbit,
    clippingEnabled, clippingAxis, clippingOffset,
    twin3DMode, showVentricles, showEloquentCortex, showWhiteMatterTracts,
    showSurgicalTrajectory, explosionOffset, activeProbe, ruler3DPoints,
    activeEloquentZone, setActiveEloquentZone,
  } = useStore()

  useEffect(() => {
    gl.localClippingEnabled = clippingEnabled
  }, [gl, clippingEnabled])

  const clipPlanes = useMemo(() => {
    if (!clippingEnabled) return []
    let normal = new THREE.Vector3(0, 0, -1)
    if (clippingAxis === 'sagittal') normal = new THREE.Vector3(-1, 0, 0)
    else if (clippingAxis === 'coronal') normal = new THREE.Vector3(0, -1, 0)
    return [new THREE.Plane(normal, clippingOffset)]
  }, [clippingEnabled, clippingAxis, clippingOffset])

  const activeMeshes = meshes[maskSource]
  const activeLattices = lattices[maskSource]

  const tumorCentroid = useMemo<[number, number, number]>(() => {
    const wt = activeMeshes.WT
    if (wt) return meshCentroid(wt)
    return [34, 6, 14]
  }, [activeMeshes])

  const flyTarget = useMemo<FlyTarget | null>(() => {
    const key = isolated
    if (!key) {
      return { centre: new THREE.Vector3(0, 0, 0), distance: 340 }
    }
    const m = activeMeshes[key]
    if (!m) return null
    const c = meshCentroid(m)
    const centre = new THREE.Vector3(c[0], c[1], c[2])
    let r = 0
    const p = m.positions
    for (let i = 0; i < p.length; i += 3) {
      r = Math.max(r, Math.hypot(p[i] - c[0], p[i + 1] - c[1], p[i + 2] - c[2]))
    }
    return { centre, distance: Math.max(70, r * 3.4) }
  }, [isolated, activeMeshes])

  const crosshairWorld = useMemo(
    () => voxelToWorld(study.affine, voxel[0], voxel[1], voxel[2]),
    [study.affine, voxel],
  )

  const centerWorld = useMemo(() => {
    return voxelToWorld(study.affine, study.dims[0] / 2, study.dims[1] / 2, study.dims[2] / 2) as [number, number, number]
  }, [study.affine, study.dims])

  const extent = useMemo(() => {
    return [
      study.dims[0] * study.spacing[0],
      study.dims[1] * study.spacing[1],
      study.dims[2] * study.spacing[2],
    ] as [number, number, number]
  }, [study.dims, study.spacing])

  const order: RegionKey[] = ['WT', 'TC', 'ET']
  const isolatedRank = isolated ? order.indexOf(isolated) : -1

  // Radial normal direction for layer explosion
  const radialExplosionNormal = useMemo<[number, number, number]>(() => {
    const v = new THREE.Vector3(...tumorCentroid).normalize()
    return [v.x || 1, v.y || 0, v.z || 0]
  }, [tumorCentroid])

  return (
    <>
      <fog attach="fog" args={['#080c15', 300, 700]} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={[0xcfeaf5, 0x0e141d, 0.85]} />
      <directionalLight position={[180, 220, 280]} intensity={1.4} color={0xeaf7ff} />
      <directionalLight position={[-260, -140, 120]} intensity={0.8} color={0xa8d8ea} />
      <directionalLight position={[0, -220, -200]} intensity={0.45} color={0xffe8d8} />

      {/* Brain Shell with Click-to-Probe */}
      <BrainShell
        mesh={brainMesh}
        lattice={brainLattice}
        opacity={isolated ? brainOpacity * 0.45 : brainOpacity}
        visible={brainVisible}
        clipPlanes={clipPlanes}
        onProbe={onProbeHit}
      />

      {/* 3D Tumor Segmentation Surfaces */}
      {REGIONS.map((def, rank) => {
        const ui = regions[def.key]
        const outerThanIsolated = isolatedRank >= 0 && rank < isolatedRank

        // Concentric displacement: WT expands 100%, TC expands 45%, ET stays at core
        const layerExplosionCoeff = def.key === 'WT' ? 1.0 : def.key === 'TC' ? 0.45 : 0.0

        return (
          <RegionSurface
            key={def.key}
            mesh={activeMeshes[def.key]}
            lattice={activeLattices[def.key]}
            hex={def.hex}
            opacity={ui.opacity}
            visible={ui.visible}
            order={2 + rank * 2}
            wireOnly={wireframe || outerThanIsolated}
            clipPlanes={clipPlanes}
            explosionOffset={explosionOffset * layerExplosionCoeff}
            explosionNormal={radialExplosionNormal}
            isUncertaintyMode={twin3DMode === 'uncertainty'}
            onSelect={(e) => {
              e.stopPropagation()
              setAutoOrbit(false)
              onProbeHit(e.point)
            }}
          />
        )
      })}

      {/* Ventricular System */}
      <Ventricles3D
        visible={showVentricles || twin3DMode === 'surgical'}
        clipPlanes={clipPlanes}
        onProbe={onProbeHit}
      />

      {/* White-Matter Tractography Streamlines */}
      <Tractography3D
        visible={showWhiteMatterTracts || twin3DMode === 'surgical'}
        clipPlanes={clipPlanes}
        tumorCentroid={tumorCentroid}
        onProbe={onProbeHit}
      />

      {/* Eloquent Cortical Functional Patches */}
      <EloquentPatches3D
        visible={showEloquentCortex || twin3DMode === 'surgical'}
        clipPlanes={clipPlanes}
        activeZone={activeEloquentZone}
        onSelectZone={(z) => setActiveEloquentZone(z.id)}
        onProbe={onProbeHit}
      />

      {/* Neurosurgical Trajectory Corridor */}
      <SurgicalCorridor3D
        visible={showSurgicalTrajectory || twin3DMode === 'surgical'}
        targetPoint={tumorCentroid}
      />

      {/* Interactive 3D Probe Pin */}
      <ProbePin3D probe={activeProbe} />

      {/* Interactive 3D Caliper Ruler */}
      <Ruler3D points={ruler3DPoints} />

      {/* Clipping Plane Helper */}
      {clippingEnabled && clipPlanes.length > 0 && (
        <planeHelper args={[clipPlanes[0], 220, 0x38bdf8]} />
      )}

      {/* 3D In-Scene Slice Planes */}
      <SlicePlanes3D
        crosshairWorld={crosshairWorld as [number, number, number]}
        centerWorld={centerWorld}
        extent={extent}
        showAxial={show3DAxial}
        showCoronal={show3DCoronal}
        showSagittal={show3DSagittal}
      />

      <Crosshair3D position={crosshairWorld as [number, number, number]} extent={isolated ? 60 : 150} />

      <CameraRig target={flyTarget} spin={autoOrbit} onInteract={() => setAutoOrbit(false)} />

      <GizmoHelper alignment="bottom-right" margin={[68, 68]}>
        <GizmoViewcube
          faces={['R', 'L', 'A', 'P', 'S', 'I']}
          color="#1b2430"
          strokeColor="#3a4860"
          textColor="#cbd5e1"
          hoverColor="#2563eb"
        />
      </GizmoHelper>

      <EffectComposer multisampling={4}>
        <Bloom
          intensity={0.32}
          luminanceThreshold={0.58}
          luminanceSmoothing={0.4}
          mipmapBlur
          radius={0.55}
        />
        <Vignette offset={0.32} darkness={0.5} eskil={false} />
      </EffectComposer>
    </>
  )
}

function AxisTriad() {
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" className="pointer-events-none">
      <g transform="translate(20,58)">
        <line x1="0" y1="0" x2="34" y2="10" stroke="#ff5f6d" strokeWidth="1.6" />
        <text x="38" y="14" fill="#ff5f6d" fontSize="9" fontFamily="monospace">x·R</text>
        <line x1="0" y1="0" x2="22" y2="-18" stroke="#6ee7a8" strokeWidth="1.6" />
        <text x="25" y="-19" fill="#6ee7a8" fontSize="9" fontFamily="monospace">y·A</text>
        <line x1="0" y1="0" x2="0" y2="-40" stroke="#6cb6ff" strokeWidth="1.6" />
        <text x="-4" y="-44" fill="#6cb6ff" fontSize="9" fontFamily="monospace">z·S</text>
        <circle cx="0" cy="0" r="2.2" fill="#e6edf5" />
      </g>
    </svg>
  )
}

export default function ThreeBrainTwin() {
  const bundle = useStudy()
  const { report, study } = bundle
  const {
    regions, toggleRegion, setOpacity, isolated, setIsolated,
    wireframe, setWireframe, brainVisible, toggleBrain, brainOpacity, setBrainOpacity,
    voxel, setVoxel, clippingEnabled, setClippingEnabled, clippingAxis, setClippingAxis,
    clippingOffset, setClippingOffset, tool, setTool,
    twin3DMode, setTwin3DMode, showVentricles, setShowVentricles,
    showEloquentCortex, setShowEloquentCortex, showWhiteMatterTracts, setShowWhiteMatterTracts,
    showSurgicalTrajectory, setShowSurgicalTrajectory, explosionOffset, setExplosionOffset,
    activeProbe, setActiveProbe, ruler3DPoints, pushRuler3DPoint, clearRuler3D,
  } = useStore()

  const world = voxelToWorld(study.affine, voxel[0], voxel[1], voxel[2])

  // Studio Drawer Tabs
  const [hudCollapsed, setHudCollapsed] = useState(false)
  const [legendCollapsed, setLegendCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'probe' | 'anatomy' | 'surgery' | 'cut' | 'mesh'>('probe')
  const [show3DAxial, setShow3DAxial] = useState(true)
  const [show3DCoronal, setShow3DCoronal] = useState(false)
  const [show3DSagittal, setShow3DSagittal] = useState(false)

  const primary: RegionKey = isolated ?? 'WT'
  const primaryDef = REGIONS.find((r) => r.key === primary)!

  // Handle click-to-probe on any 3D surface
  const handleProbeHit = (point: THREE.Vector3) => {
    const worldPt: Vec3 = [point.x, point.y, point.z]

    // If measuring in 3D:
    if (tool === 'measure') {
      pushRuler3DPoint(worldPt)
      return
    }

    const telemetry = evaluateTissueProbe(worldPt, bundle)
    setActiveProbe(telemetry)
    setVoxel(telemetry.voxel)
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg border border-edge"
      style={{
        background:
          'radial-gradient(120% 100% at 50% 38%, #111a28 0%, #0b1220 46%, #060a12 100%)',
      }}
    >
      {/* Three.js Canvas */}
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [40, 175, 330], up: [0, 0, 1], fov: 36, near: 1, far: 4000 }}
        onPointerMissed={() => {
          // If clicked empty space, clear isolation
          setIsolated(null)
        }}
      >
        <Scene
          show3DAxial={show3DAxial}
          show3DCoronal={show3DCoronal}
          show3DSagittal={show3DSagittal}
          onProbeHit={handleProbeHit}
        />
      </Canvas>

      {/* Top Quick-Preset Mode Bar */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full border border-edge/90 bg-panel/95 px-1.5 py-1 shadow-2xl backdrop-blur-md font-sans text-[9.5px] max-w-[calc(100%-480px)] overflow-x-auto no-scrollbar">
        {(
          [
            { id: 'cinematic', label: 'Glass Brain', icon: '💎' },
            { id: 'diagnostic', label: 'Diagnostic', icon: '🧬' },
            { id: 'surgical', label: 'Surgical Plan', icon: '🎯' },
            { id: 'exploded', label: 'Explode', icon: '💥' },
            { id: 'uncertainty', label: 'Uncertainty', icon: '📊' },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            onClick={() => setTwin3DMode(mode.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium whitespace-nowrap transition ${
              twin3DMode === mode.id
                ? 'bg-sky-500/25 text-sky-200 border border-sky-500/50 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>{mode.icon}</span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>

      {/* Collapsible Left Studio Drawer */}
      {hudCollapsed ? (
        <button
          onClick={() => setHudCollapsed(false)}
          className="group absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-edge/80 bg-panel/90 px-3 py-2 text-[11px] font-medium text-slate-200 shadow-xl backdrop-blur-md transition hover:border-sky-500/50 hover:bg-panel hover:text-white"
          title="Open 3D Studio Controls & Telemetry"
        >
          <span className="flex h-2 w-2 rounded-full bg-sky-400 group-hover:scale-125 transition-transform" />
          <span className="font-semibold text-slate-100">Studio &amp; Telemetry</span>
          <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[9px] text-sky-300">Expand ▶</span>
        </button>
      ) : (
        <div className="absolute left-3 top-3 z-10 w-[270px] max-h-[calc(100%-48px)] flex flex-col overflow-hidden rounded-lg border border-edge/80 bg-panel/90 shadow-2xl backdrop-blur-md transition-all">
          {/* Panel Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-edge/80 bg-panel-2/70 px-3 py-2">
            <div className="flex items-center gap-1.5 font-sans text-[11px] font-semibold text-slate-100">
              <span className="text-sky-400">🧠</span>
              <span>3D Twin Inspector</span>
            </div>
            <button
              onClick={() => setHudCollapsed(true)}
              className="flex items-center gap-1 rounded border border-edge/80 bg-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 transition hover:border-sky-500/50 hover:bg-sky-500/20 hover:text-sky-200"
              title="Narrow down / collapse controls"
            >
              <span>Narrow Down</span>
              <span>◀</span>
            </button>
          </div>

          {/* Segmented Tab Navigation */}
          <div className="flex shrink-0 border-b border-edge/60 bg-panel/60 p-1 text-[9.5px] font-mono">
            {(
              [
                { id: 'probe', label: 'Probe' },
                { id: 'anatomy', label: 'Anatomy' },
                { id: 'surgery', label: 'Surgery' },
                { id: 'cut', label: 'Cut' },
                { id: 'mesh', label: 'Mesh' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 rounded py-1 capitalize transition ${
                  activeTab === t.id
                    ? 'bg-sky-500/20 font-bold text-sky-200 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5 text-[10.5px]">
            {/* TAB 1: PROBE & TELEMETRY */}
            {activeTab === 'probe' && (
              <div className="space-y-2">
                {activeProbe ? (
                  <div className="rounded border border-sky-500/40 bg-sky-950/20 p-2.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-sky-500/20 pb-1.5">
                      <span className="font-semibold text-sky-200 text-[11px]">
                        {activeProbe.layerLabel}
                      </span>
                      <button
                        onClick={() => setActiveProbe(null)}
                        className="text-[9px] font-mono text-slate-400 hover:text-sky-300"
                      >
                        ✕ Close
                      </button>
                    </div>

                    <p className="text-[9.5px] text-slate-300 leading-tight">
                      {activeProbe.tissueDescription}
                    </p>

                    {/* Voxel & World Coordinates */}
                    <div className="rounded bg-panel/80 p-1.5 font-mono text-[9px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">World (RAS+):</span>
                        <span className="text-sky-300">
                          [{activeProbe.world[0].toFixed(1)}, {activeProbe.world[1].toFixed(1)}, {activeProbe.world[2].toFixed(1)}] mm
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Voxel:</span>
                        <span className="text-slate-200">
                          [{activeProbe.voxel.join(', ')}]
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Skull Depth:</span>
                        <span className="text-amber-300 font-semibold">
                          {activeProbe.depthFromSkullMm.toFixed(1)} mm
                        </span>
                      </div>
                    </div>

                    {/* Multi-modal intensities */}
                    <div>
                      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                        Multi-Modal Signal Intensities
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-center font-mono text-[9px]">
                        <div className="rounded bg-panel p-1">
                          <div className="text-slate-500">T1</div>
                          <div className="text-slate-200 font-bold">{activeProbe.signals.T1}</div>
                        </div>
                        <div className="rounded bg-panel p-1">
                          <div className="text-amber-400 font-semibold">T1Gd</div>
                          <div className="text-amber-300 font-bold">{activeProbe.signals.T1Gd}</div>
                        </div>
                        <div className="rounded bg-panel p-1">
                          <div className="text-slate-500">T2</div>
                          <div className="text-slate-200 font-bold">{activeProbe.signals.T2}</div>
                        </div>
                        <div className="rounded bg-panel p-1">
                          <div className="text-emerald-400 font-semibold">FLAIR</div>
                          <div className="text-emerald-300 font-bold">{activeProbe.signals.FLAIR}</div>
                        </div>
                      </div>
                    </div>

                    {/* Epistemic Uncertainty */}
                    <div className="rounded bg-panel/80 p-1.5 font-mono text-[9px]">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-slate-400">TTA Disagreement σ:</span>
                        <span
                          className={`rounded px-1 py-0.2 font-bold ${
                            activeProbe.epistemicUncertainty.riskCategory === 'High Disagreement'
                              ? 'bg-red-500/20 text-red-300'
                              : activeProbe.epistemicUncertainty.riskCategory === 'Transition'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {activeProbe.epistemicUncertainty.sigma.toFixed(3)} · {activeProbe.epistemicUncertainty.riskCategory}
                        </span>
                      </div>
                      <p className="text-[8.5px] text-slate-400">
                        {activeProbe.epistemicUncertainty.description}
                      </p>
                    </div>

                    {/* Closest Eloquent Structure Clearance */}
                    <div className="rounded bg-panel/80 p-1.5 font-mono text-[9px] space-y-0.5">
                      <div className="text-slate-400 font-semibold">Eloquent Proximity:</div>
                      <div className="flex justify-between items-center">
                        <span className="truncate max-w-[130px] text-slate-300">
                          {activeProbe.closestEloquent.structure.name.split('(')[0]}
                        </span>
                        <span
                          className={`font-bold ${
                            activeProbe.closestEloquent.status === 'Direct Risk'
                              ? 'text-red-400'
                              : activeProbe.closestEloquent.status === 'Caution'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {activeProbe.closestEloquent.distanceMm.toFixed(1)} mm ({activeProbe.closestEloquent.status})
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-edge/80 bg-panel-2/30 p-3 text-center space-y-1.5">
                    <div className="text-sky-400 text-base">👆</div>
                    <div className="font-semibold text-slate-200">Interactive 3D Probe</div>
                    <p className="text-[9.5px] text-slate-400 leading-relaxed">
                      Click anywhere on the 3D brain shell, tumor layers, or ventricles to inspect deep multi-modal signals, epistemic uncertainty, skull depth, and distance to eloquent areas.
                    </p>
                  </div>
                )}

                {/* 3D Caliper Tool */}
                <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-[10px]">
                    <span className="text-slate-200">3D Distance Ruler</span>
                    {ruler3DPoints.length > 0 && (
                      <button
                        onClick={clearRuler3D}
                        className="text-[9px] font-mono text-red-400 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-400">
                    {ruler3DPoints.length === 0
                      ? 'Switch to Measure tool (Shortcut: M) and click two 3D surface points.'
                      : ruler3DPoints.length === 1
                      ? 'Point A placed. Click Point B on any 3D mesh.'
                      : `Measured Distance: ${Math.hypot(
                          ruler3DPoints[1][0] - ruler3DPoints[0][0],
                          ruler3DPoints[1][1] - ruler3DPoints[0][1],
                          ruler3DPoints[1][2] - ruler3DPoints[0][2],
                        ).toFixed(1)} mm`}
                  </p>
                  <button
                    onClick={() => setTool(tool === 'measure' ? 'crosshair' : 'measure')}
                    className={`w-full rounded py-1 text-center font-mono text-[9px] font-semibold transition border ${
                      tool === 'measure'
                        ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                        : 'border-edge bg-panel text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {tool === 'measure' ? '✓ 3D Caliper Active' : 'Activate 3D Caliper Ruler'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: ANATOMICAL LANDMARKS & TRACTS */}
            {activeTab === 'anatomy' && (
              <div className="space-y-2">
                {/* Ventricles Toggle */}
                <div className="flex items-center justify-between rounded border border-edge/60 bg-panel-2/40 p-2">
                  <div>
                    <div className="font-semibold text-cyan-300 text-[10.5px]">Ventricular System (CSF)</div>
                    <div className="text-[9px] text-slate-400">Lateral & 3rd ventricle fluid cavities</div>
                  </div>
                  <button
                    onClick={() => setShowVentricles(!showVentricles)}
                    className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold transition border ${
                      showVentricles
                        ? 'border-cyan-500/60 bg-cyan-500/25 text-cyan-200'
                        : 'border-edge bg-panel text-slate-400'
                    }`}
                  >
                    {showVentricles ? 'Visible' : 'Off'}
                  </button>
                </div>

                {/* White Matter Tracts Toggle */}
                <div className="flex items-center justify-between rounded border border-edge/60 bg-panel-2/40 p-2">
                  <div>
                    <div className="font-semibold text-sky-300 text-[10.5px]">Corticospinal & Arcuate Tracts</div>
                    <div className="text-[9px] text-slate-400">DTI white-matter streamlines</div>
                  </div>
                  <button
                    onClick={() => setShowWhiteMatterTracts(!showWhiteMatterTracts)}
                    className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold transition border ${
                      showWhiteMatterTracts
                        ? 'border-sky-500/60 bg-sky-500/25 text-sky-200'
                        : 'border-edge bg-panel text-slate-400'
                    }`}
                  >
                    {showWhiteMatterTracts ? 'Visible' : 'Off'}
                  </button>
                </div>

                {/* Eloquent Cortical Zones */}
                <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300 text-[10.5px]">Eloquent Functional Zones</span>
                    <button
                      onClick={() => setShowEloquentCortex(!showEloquentCortex)}
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold transition border ${
                        showEloquentCortex
                          ? 'border-amber-500/60 bg-amber-500/25 text-amber-200'
                          : 'border-edge bg-panel text-slate-400'
                      }`}
                    >
                      {showEloquentCortex ? 'Visible' : 'Off'}
                    </button>
                  </div>
                  <div className="space-y-1 pt-1 font-mono text-[9px]">
                    {ELOQUENT_STRUCTURES.filter((s) => s.category === 'cortex').map((struct) => (
                      <div
                        key={struct.id}
                        className="flex items-center justify-between rounded px-1.5 py-0.5 hover:bg-white/5"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: struct.color }} />
                          <span className="text-slate-300">{struct.name.split('(')[0]}</span>
                        </div>
                        <span className="text-slate-500">{struct.safeMarginMm}mm</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SURGICAL CORRIDOR & TRAJECTORY */}
            {activeTab === 'surgery' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded border border-edge/60 bg-panel-2/40 p-2">
                  <div>
                    <div className="font-semibold text-sky-200 text-[10.5px]">Resection Corridor Guide</div>
                    <div className="text-[9px] text-slate-400">12mm tubular retractor simulation</div>
                  </div>
                  <button
                    onClick={() => setShowSurgicalTrajectory(!showSurgicalTrajectory)}
                    className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold transition border ${
                      showSurgicalTrajectory
                        ? 'border-sky-500/60 bg-sky-500/25 text-sky-200'
                        : 'border-edge bg-panel text-slate-400'
                    }`}
                  >
                    {showSurgicalTrajectory ? 'Active' : 'Off'}
                  </button>
                </div>

                <div className="rounded border border-edge/60 bg-panel-2/40 p-2 font-mono text-[9px] space-y-1">
                  <div className="text-slate-400 font-semibold mb-1">Pre-Operative Corridor Metrics:</div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Target:</span>
                    <span className="text-slate-200">Tumor Centroid</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Approach Corridor:</span>
                    <span className="text-sky-300">Fronto-Parietal Trans-sulcal</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Corridor Depth:</span>
                    <span className="text-amber-300 font-bold">58.0 mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">CST Clearance:</span>
                    <span className="text-emerald-400 font-bold">14.2 mm (Safe &gt; 10mm)</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: CUTAWAY & SLICES */}
            {activeTab === 'cut' && (
              <div className="space-y-2">
                {/* 3D In-Scene Slice Planes */}
                <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300">
                    <span>3D In-Scene Slices</span>
                    <button
                      onClick={() => {
                        const anyOn = show3DAxial || show3DCoronal || show3DSagittal
                        setShow3DAxial(!anyOn)
                        setShow3DCoronal(!anyOn)
                        setShow3DSagittal(!anyOn)
                      }}
                      className="text-[9px] font-mono text-sky-400 hover:underline"
                    >
                      {show3DAxial || show3DCoronal || show3DSagittal ? 'all off' : 'all on'}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 font-mono text-[9px]">
                    <button
                      onClick={() => setShow3DAxial(!show3DAxial)}
                      className={`rounded py-1 text-center transition border ${
                        show3DAxial
                          ? 'border-sky-500/60 bg-sky-500/20 text-sky-200 font-bold'
                          : 'border-edge text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Axial Z
                    </button>
                    <button
                      onClick={() => setShow3DCoronal(!show3DCoronal)}
                      className={`rounded py-1 text-center transition border ${
                        show3DCoronal
                          ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200 font-bold'
                          : 'border-edge text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Coronal Y
                    </button>
                    <button
                      onClick={() => setShow3DSagittal(!show3DSagittal)}
                      className={`rounded py-1 text-center transition border ${
                        show3DSagittal
                          ? 'border-amber-500/60 bg-amber-500/20 text-amber-200 font-bold'
                          : 'border-edge text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Sagittal X
                    </button>
                  </div>
                </div>

                {/* Orthogonal Clipping Plane */}
                <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300 text-[10.5px]">Cutaway Clipping</span>
                    <button
                      onClick={() => setClippingEnabled(!clippingEnabled)}
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-medium transition ${
                        clippingEnabled
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-panel text-slate-400 hover:text-slate-200 border border-edge'
                      }`}
                    >
                      {clippingEnabled ? 'Active' : 'Off'}
                    </button>
                  </div>

                  {clippingEnabled && (
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-1 font-mono text-[9px]">
                        {(['axial', 'coronal', 'sagittal'] as const).map((axis) => (
                          <button
                            key={axis}
                            onClick={() => setClippingAxis(axis)}
                            className={`flex-1 rounded py-0.5 text-center uppercase transition ${
                              clippingAxis === axis
                                ? 'bg-sky-500/25 font-bold text-sky-200 border border-sky-500/50'
                                : 'border border-edge text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {axis.slice(0, 3)}
                          </button>
                        ))}
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between font-mono text-[9px] text-slate-400">
                          <span>Depth</span>
                          <span className="text-sky-300">{clippingOffset.toFixed(1)} mm</span>
                        </div>
                        <input
                          type="range"
                          min={-120}
                          max={120}
                          step={1}
                          value={clippingOffset}
                          onChange={(e) => setClippingOffset(Number(e.target.value))}
                          className="w-full accent-sky-400"
                        />
                      </div>

                      <div className="flex justify-between items-center text-[9px] font-mono">
                        <button
                          onClick={() => setClippingOffset(0)}
                          className="text-slate-500 hover:text-slate-300 transition"
                        >
                          Reset (0mm)
                        </button>
                        <button
                          onClick={() => setClippingOffset(-clippingOffset)}
                          className="text-slate-500 hover:text-sky-400 transition"
                        >
                          Invert Cut
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: MESH & LAYER PEELING */}
            {activeTab === 'mesh' && (
              <div className="space-y-2">
                {/* Concentric Layer Explosion Slider */}
                <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300 text-[10.5px]">Layer Peeling / Explode</span>
                    <span className="font-mono text-[9px] text-sky-300">{explosionOffset} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={explosionOffset}
                    onChange={(e) => setExplosionOffset(Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                  <div className="flex justify-between text-[8.5px] text-slate-500">
                    <span>Nested Concentric</span>
                    <span>Peel Outward</span>
                  </div>
                </div>

                {/* Primary Region Opacity */}
                <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-1.5">
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="font-medium" style={{ color: primaryDef.colour }}>
                      {primaryDef.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {report[primary].predML.toFixed(2)} mL
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={regions[primary].opacity}
                    onChange={(e) => setOpacity(primary, Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">Brain shell</span>
                    <input
                      type="range"
                      min={0}
                      max={0.6}
                      step={0.01}
                      value={brainOpacity}
                      onChange={(e) => setBrainOpacity(Number(e.target.value))}
                      className="w-[100px] accent-sky-400"
                    />
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => setWireframe(!wireframe)}
                      className={`flex-1 rounded border px-2 py-1 text-[10px] transition ${
                        wireframe
                          ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                          : 'border-edge text-slate-400 hover:border-slate-500 hover:text-slate-200'
                      }`}
                    >
                      Lattice
                    </button>
                    <button
                      onClick={() => setIsolated(null)}
                      className="flex-1 rounded border border-edge px-2 py-1 text-[10px] text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
                    >
                      Reset view
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapsible Right Legend */}
      {legendCollapsed ? (
        <button
          onClick={() => setLegendCollapsed(false)}
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-edge/80 bg-panel/90 px-2.5 py-1.5 font-mono text-[10px] text-slate-300 shadow-xl backdrop-blur-sm transition hover:border-slate-500 hover:text-white"
          title="Show Region Legend"
        >
          <span>🏷 Regions</span>
          <span>◀</span>
        </button>
      ) : (
        <div className="absolute right-3 top-3 z-10 w-[196px] rounded-md border border-edge/80 bg-panel/90 p-2 shadow-2xl backdrop-blur-sm space-y-1">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              3D Twin Layers
            </span>
            <button
              onClick={() => setLegendCollapsed(true)}
              className="text-[9.5px] text-slate-500 hover:text-slate-300 font-mono transition"
              title="Collapse legend"
            >
              ✕
            </button>
          </div>

          {REGIONS.map((def) => {
            const ui = regions[def.key]
            return (
              <button
                key={def.key}
                onClick={() => toggleRegion(def.key)}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition ${
                  ui.visible ? 'text-slate-200' : 'text-slate-600'
                } hover:bg-white/5`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px] border"
                  style={{
                    background: ui.visible ? def.colour : 'transparent',
                    borderColor: def.colour,
                  }}
                />
                <span className="flex-1 truncate">{def.label}</span>
                <span className="font-mono text-[10px] text-slate-500">
                  {report[def.key].predML.toFixed(1)}
                </span>
              </button>
            )
          })}

          <button
            onClick={toggleBrain}
            className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition ${
              brainVisible ? 'text-slate-200' : 'text-slate-600'
            } hover:bg-white/5`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-slate-400"
              style={{ background: brainVisible ? '#cfd9e6' : 'transparent' }}
            />
            <span className="flex-1">Brain Cortex Shell</span>
          </button>

          {/* Ventricles item */}
          <button
            onClick={() => setShowVentricles(!showVentricles)}
            className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition ${
              showVentricles ? 'text-cyan-200' : 'text-slate-600'
            } hover:bg-white/5`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-cyan-400"
              style={{ background: showVentricles ? '#06b6d4' : 'transparent' }}
            />
            <span className="flex-1">Ventricles (CSF)</span>
          </button>

          {/* Tracts item */}
          <button
            onClick={() => setShowWhiteMatterTracts(!showWhiteMatterTracts)}
            className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition ${
              showWhiteMatterTracts ? 'text-sky-200' : 'text-slate-600'
            } hover:bg-white/5`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-sky-400"
              style={{ background: showWhiteMatterTracts ? '#38bdf8' : 'transparent' }}
            />
            <span className="flex-1">White-Matter Tracts</span>
          </button>
        </div>
      )}

      {/* Floating Active Isolated Banner */}
      {isolated && (
        <div className="absolute left-1/2 bottom-12 -translate-x-1/2 z-10 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[10.5px] text-sky-300 backdrop-blur-sm">
          Isolated · {primaryDef.label} — click empty space to restore full twin
        </div>
      )}

      {/* Bottom Axis Triad */}
      <div className="pointer-events-none absolute bottom-2 left-2">
        <AxisTriad />
      </div>

      {/* Interaction Hint */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] tracking-wide text-slate-500">
        click any 3D surface to deep-probe · drag to orbit · scroll to zoom
      </div>
    </div>
  )
}
