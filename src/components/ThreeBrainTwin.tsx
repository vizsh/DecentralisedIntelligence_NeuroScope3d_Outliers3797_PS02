import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { GizmoHelper, GizmoViewcube, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { meshCentroid } from '../lib/meshing'
import { REGIONS, type RegionKey } from '../lib/regions'
import type { Mesh as IsoMesh } from '../lib/surfaceNets'
import { voxelToWorld } from '../lib/volume'
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

function RegionSurface({
  mesh, lattice, hex, opacity, visible, wireOnly, order, onSelect, clipPlanes,
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
}) {
  const geometry = useGeometry(mesh)
  const latticeGeometry = useGeometry(lattice)
  const [hovered, setHovered] = useState(false)
  if (!geometry) return null
  const wireGeometry = latticeGeometry ?? geometry

  return (
    <group
      visible={visible}
      onClick={onSelect}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      {!wireOnly && (
        <mesh geometry={geometry} renderOrder={order}>
          <meshPhysicalMaterial
            color={hex}
            transparent
            opacity={opacity}
            roughness={0.38}
            metalness={0.05}
            clearcoat={0.6}
            clearcoatRoughness={0.35}
            side={THREE.DoubleSide}
            depthWrite={false}
            fog={false}
            toneMapped={false}
            emissive={hex}
            emissiveIntensity={hovered ? 0.5 : 0.18}
            clippingPlanes={clipPlanes}
            clipShadows={true}
          />
        </mesh>
      )}
      <mesh geometry={wireGeometry} renderOrder={order + 0.5}>
        <meshBasicMaterial
          color={hex}
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

/** Rim light that only fires where the surface turns away — the glass-brain look. */
function FresnelShell({ geometry, intensity, clipPlanes }: { geometry: THREE.BufferGeometry; intensity: number; clipPlanes?: THREE.Plane[] }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(0x9fe0ef) },
      uPower: { value: 3.0 },
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

function BrainShell({ mesh, lattice, opacity, visible, clipPlanes }: {
  mesh: IsoMesh | null; lattice: IsoMesh | null; opacity: number; visible: boolean; clipPlanes?: THREE.Plane[]
}) {
  const geometry = useGeometry(mesh)
  const latticeGeometry = useGeometry(lattice)
  if (!geometry) return null
  const wireGeometry = latticeGeometry ?? geometry
  return (
    // Drawn first with depthWrite off, so the tumour always reads through the shell.
    // Back faces first, then front: two passes give the specimen-in-glass depth
    // a single translucent pass cannot.
    <group visible={visible} raycast={() => null}>
      <mesh geometry={geometry} renderOrder={0}>
        <meshPhysicalMaterial
          color={0x5e8ea3}
          transparent
          opacity={opacity * 0.22}
          roughness={0.85}
          metalness={0}
          side={THREE.BackSide}
          depthWrite={false}
          clippingPlanes={clipPlanes}
          clipShadows={true}
        />
      </mesh>
      <mesh geometry={geometry} renderOrder={1}>
        <meshPhysicalMaterial
          color={0x9fd0dd}
          transparent
          opacity={opacity}
          roughness={0.55}
          metalness={0}
          clearcoat={0.6}
          clearcoatRoughness={0.4}
          side={THREE.FrontSide}
          depthWrite={false}
          clippingPlanes={clipPlanes}
          clipShadows={true}
        />
      </mesh>
      {/* Faint filament texture over the shell, the way the reference reads. */}
      <mesh geometry={wireGeometry} renderOrder={2}>
        <meshBasicMaterial
          color={0x8fd4e2}
          wireframe
          transparent
          opacity={opacity * 0.16}
          depthWrite={false}
          clippingPlanes={clipPlanes}
        />
      </mesh>
      <FresnelShell geometry={geometry} intensity={opacity * 0.9} clipPlanes={clipPlanes} />
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
      {/* Axial Plane (XY Plane at crosshair Z) */}
      {showAxial && (
        <group position={[centerWorld[0], centerWorld[1], crosshairWorld[2]]}>
          <mesh renderOrder={1}>
            <planeGeometry args={[wX * 1.15, wY * 1.15]} />
            <meshBasicMaterial
              color={0x0284c7}
              transparent
              opacity={opacity}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <lineSegments renderOrder={1.1}>
            <edgesGeometry args={[new THREE.PlaneGeometry(wX * 1.15, wY * 1.15)]} />
            <lineBasicMaterial color={0x38bdf8} transparent opacity={0.75} depthTest={false} />
          </lineSegments>
        </group>
      )}

      {/* Coronal Plane (XZ Plane at crosshair Y) */}
      {showCoronal && (
        <group position={[centerWorld[0], crosshairWorld[1], centerWorld[2]]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh renderOrder={1}>
            <planeGeometry args={[wX * 1.15, wZ * 1.15]} />
            <meshBasicMaterial
              color={0x059669}
              transparent
              opacity={opacity}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <lineSegments renderOrder={1.1}>
            <edgesGeometry args={[new THREE.PlaneGeometry(wX * 1.15, wZ * 1.15)]} />
            <lineBasicMaterial color={0x34d399} transparent opacity={0.75} depthTest={false} />
          </lineSegments>
        </group>
      )}

      {/* Sagittal Plane (YZ Plane at crosshair X) */}
      {showSagittal && (
        <group position={[crosshairWorld[0], centerWorld[1], centerWorld[2]]} rotation={[0, Math.PI / 2, 0]}>
          <mesh renderOrder={1}>
            <planeGeometry args={[wY * 1.15, wZ * 1.15]} />
            <meshBasicMaterial
              color={0xd97706}
              transparent
              opacity={opacity}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
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

interface FlyTarget { centre: THREE.Vector3; distance: number }

function CameraRig({ target, spin, onInteract }: {
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
      maxDistance={700}
      autoRotate={spin}
      autoRotateSpeed={0.45}
      onStart={onInteract}
      makeDefault
    />
  )
}

function Scene({
  show3DAxial,
  show3DCoronal,
  show3DSagittal,
}: {
  show3DAxial: boolean
  show3DCoronal: boolean
  show3DSagittal: boolean
}) {
  const { study, brainMesh, brainLattice, meshes, lattices } = useStudy()
  const { gl } = useThree()
  const {
    regions, brainVisible, brainOpacity, isolated, setIsolated,
    wireframe, voxel, maskSource, autoOrbit, setAutoOrbit,
    clippingEnabled, clippingAxis, clippingOffset,
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

  // Isolating a region drops everything outside it to a wireframe lattice.
  const order: RegionKey[] = ['WT', 'TC', 'ET']
  const isolatedRank = isolated ? order.indexOf(isolated) : -1

  return (
    <>
      <fog attach="fog" args={['#080c15', 300, 660]} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={[0xcfeaf5, 0x0e141d, 0.8]} />
      <directionalLight position={[180, 220, 280]} intensity={1.3} color={0xeaf7ff} />
      <directionalLight position={[-260, -140, 120]} intensity={0.7} color={0xa8d8ea} />
      <directionalLight position={[0, -220, -200]} intensity={0.45} color={0xffe8d8} />

      <BrainShell
        mesh={brainMesh}
        lattice={brainLattice}
        opacity={isolated ? brainOpacity * 0.45 : brainOpacity}
        visible={brainVisible}
        clipPlanes={clipPlanes}
      />

      {REGIONS.map((def, rank) => {
        const ui = regions[def.key]
        const outerThanIsolated = isolatedRank >= 0 && rank < isolatedRank
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
            onSelect={(e) => {
              e.stopPropagation()
              setAutoOrbit(false)
              setIsolated(isolated === def.key ? null : def.key)
            }}
          />
        )
      })}

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

      {/* The threshold is set above the shell's luminance, so only the regions glow. */}
      <EffectComposer multisampling={4}>
        <Bloom
          intensity={0.28}
          luminanceThreshold={0.62}
          luminanceSmoothing={0.4}
          mipmapBlur
          radius={0.5}
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
  const { report, study } = useStudy()
  const {
    regions, toggleRegion, setOpacity, isolated, setIsolated,
    wireframe, setWireframe, brainVisible, toggleBrain, brainOpacity, setBrainOpacity,
    voxel, clippingEnabled, setClippingEnabled, clippingAxis, setClippingAxis,
    clippingOffset, setClippingOffset,
  } = useStore()
  const world = voxelToWorld(study.affine, voxel[0], voxel[1], voxel[2])

  // Collapsible HUD and Slice Plane Controls
  const [hudCollapsed, setHudCollapsed] = useState(false)
  const [legendCollapsed, setLegendCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'mesh' | 'cutaway' | 'slices'>('all')
  const [show3DAxial, setShow3DAxial] = useState(true)
  const [show3DCoronal, setShow3DCoronal] = useState(false)
  const [show3DSagittal, setShow3DSagittal] = useState(false)

  const primary: RegionKey = isolated ?? 'WT'
  const primaryDef = REGIONS.find((r) => r.key === primary)!

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg border border-edge"
      style={{
        background:
          'radial-gradient(120% 100% at 50% 38%, #111a28 0%, #0b1220 46%, #060a12 100%)',
      }}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [40, 175, 330], up: [0, 0, 1], fov: 36, near: 1, far: 4000 }}
        onPointerMissed={() => setIsolated(null)}
      >
        <Scene
          show3DAxial={show3DAxial}
          show3DCoronal={show3DCoronal}
          show3DSagittal={show3DSagittal}
        />
      </Canvas>

      {/* Collapsible Left HUD: Telemetry, Slicers, Cutaway & 3D Slices */}
      {hudCollapsed ? (
        <button
          onClick={() => setHudCollapsed(false)}
          className="group absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-edge/80 bg-panel/90 px-3 py-2 text-[11px] font-medium text-slate-200 shadow-xl backdrop-blur-md transition hover:border-sky-500/50 hover:bg-panel hover:text-white"
          title="Open 3D Studio Controls & Slicers"
        >
          <span className="flex h-2 w-2 rounded-full bg-sky-400 group-hover:scale-125 transition-transform" />
          <span className="font-semibold text-slate-100">Controls &amp; Slicers</span>
          <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[9px] text-sky-300">Expand ▶</span>
        </button>
      ) : (
        <div className="absolute left-3 top-3 z-10 w-[240px] max-h-[calc(100%-48px)] flex flex-col overflow-hidden rounded-lg border border-edge/80 bg-panel/90 shadow-2xl backdrop-blur-md transition-all">
          {/* Panel Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-edge/80 bg-panel-2/70 px-3 py-2">
            <div className="flex items-center gap-1.5 font-sans text-[11px] font-semibold text-slate-100">
              <span className="text-sky-400">⚙</span>
              <span>Studio Controls</span>
            </div>
            <button
              onClick={() => setHudCollapsed(true)}
              className="flex items-center gap-1 rounded border border-edge/80 bg-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 transition hover:border-sky-500/50 hover:bg-sky-500/20 hover:text-sky-200"
              title="Narrow down / collapse controls to view brain smoothly"
            >
              <span>Narrow Down</span>
              <span>◀</span>
            </button>
          </div>

          {/* Segmented Filter Bar */}
          <div className="flex shrink-0 border-b border-edge/60 bg-panel/60 p-1 text-[9.5px] font-mono">
            {(['all', 'mesh', 'cutaway', 'slices'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded py-1 capitalize transition ${
                  activeTab === tab
                    ? 'bg-sky-500/20 font-bold text-sky-200 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'mesh' ? 'Mesh' : tab === 'cutaway' ? 'Cut' : '3D Slices'}
              </button>
            ))}
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5 text-[10.5px]">
            {/* Telemetry (visible in 'all' or 'slices') */}
            {(activeTab === 'all' || activeTab === 'slices') && (
              <div className="rounded border border-edge/60 bg-panel-2/40 p-2 font-mono text-[10px] text-slate-300">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Crosshair Position
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Voxel:</span>
                  <span className="text-slate-100 font-semibold">({voxel[0]}, {voxel[1]}, {voxel[2]})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">World:</span>
                  <span className="text-sky-300">({world[0].toFixed(1)}, {world[1].toFixed(1)}, {world[2].toFixed(1)}) mm</span>
                </div>
                <div className="mt-1 text-slate-500 text-[9px]">
                  Grid {study.dims.join('×')} · {study.spacing.map((s) => s.toFixed(2)).join('×')} mm
                </div>
              </div>
            )}

            {/* 3D In-Scene Slice Planes (visible in 'all' or 'slices') */}
            {(activeTab === 'all' || activeTab === 'slices') && (
              <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <span>3D In-Scene Slices</span>
                  <button
                    onClick={() => {
                      const anyOn = show3DAxial || show3DCoronal || show3DSagittal
                      setShow3DAxial(!anyOn)
                      setShow3DCoronal(!anyOn)
                      setShow3DSagittal(!anyOn)
                    }}
                    className="text-[9px] font-mono lowercase text-sky-400 hover:underline"
                  >
                    {show3DAxial || show3DCoronal || show3DSagittal ? 'all off' : 'all on'}
                  </button>
                </div>
                <p className="text-[9.5px] text-slate-400 leading-tight">
                  Intersect 2D MPR planes directly into the 3D brain twin:
                </p>
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
            )}

            {/* Opacity / Shell controls (visible in 'all' or 'mesh') */}
            {(activeTab === 'all' || activeTab === 'mesh') && (
              <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-2">
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
            )}

            {/* Cutaway controls (visible in 'all' or 'cutaway') */}
            {(activeTab === 'all' || activeTab === 'cutaway') && (
              <div className="rounded border border-edge/60 bg-panel-2/40 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Cutaway View
                  </span>
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
        <div className="absolute right-3 top-3 z-10 w-[188px] rounded-md border border-edge/80 bg-panel/90 p-2 shadow-2xl backdrop-blur-sm">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Regions
            </span>
            <button
              onClick={() => setLegendCollapsed(true)}
              className="text-[9.5px] text-slate-500 hover:text-slate-300 font-mono transition"
              title="Narrow down / collapse legend"
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
                className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11.5px] transition
                  ${ui.visible ? 'text-slate-200' : 'text-slate-600'} hover:bg-white/5`}
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
            className={`mt-1 flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11.5px] transition
              ${brainVisible ? 'text-slate-200' : 'text-slate-600'} hover:bg-white/5`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-slate-400"
              style={{ background: brainVisible ? '#cfd9e6' : 'transparent' }}
            />
            <span className="flex-1">Brain surface</span>
          </button>
        </div>
      )}

      {isolated && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 z-10 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[10.5px] text-sky-300 backdrop-blur-sm">
          Isolated · {primaryDef.label} — click empty space to exit
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2">
        <AxisTriad />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] tracking-wide text-slate-600">
        drag to orbit · scroll to zoom · click a region to isolate
      </div>
    </div>
  )
}
