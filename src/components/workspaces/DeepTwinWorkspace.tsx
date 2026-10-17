/**
 * DeepTwinWorkspace.tsx
 *
 * Top-level workspace page for the "Deep Neuro" tab. This file was the original
 * monolith; it now orchestrates the refactored BrainDigitalTwinViewer plus the
 * existing Deep Neuro Risk Atlas (which lives behind a toggle). This keeps the
 * existing Risk Atlas fully intact while adding the new Digital Twin experience
 * as the default view.
 */

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { GizmoHelper, GizmoViewcube, OrbitControls, Html } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import {
  Activity,
  AlertTriangle,
  Brain,
  Camera,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  GitCommit,
  Info,
  Maximize2,
  Minimize2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  DEEP_ANATOMICAL_ATLAS,
  createVascularSystemGeometries,
  createCranialNervesGeometries,
  createSubcorticalNucleiGeometries,
  createVentriclesGeometry,
  createTractStreamlines,
  evaluateTumorConnectionMatrix,
  getCompleteTumorPathology,
  type DeepAnatomicalStructure,
  type TumorConnectionRisk,
  type TumorPathologyAnalysis,
} from '../../lib/anatomicalStructures'
import { REGIONS, type RegionKey } from '../../lib/regions'
import type { Mesh as IsoMesh } from '../../lib/surfaceNets'
import { useStore } from '../../state/store'
import { useStudy } from '../../state/study'
import type { Vec3 } from '../../lib/volume'
import BrainDigitalTwinViewer from '../BrainDigitalTwinViewer'
import {
  classifyCoordinateToSegment,
  BRAIN_SEGMENTS,
  evaluateSegmentTumorInvolvement,
} from '../../lib/brainSegmentation'

// =============================================================================
// WORKSPACE TOGGLE — Digital Twin (new) vs Risk Atlas (original)
// =============================================================================

type DeepNeuroTab = 'digital-twin' | 'risk-atlas'

export default function DeepTwinWorkspace() {
  const [activeTab, setActiveTab] = useState<DeepNeuroTab>('digital-twin')

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#070a13] text-slate-200 select-none font-sans">
      {/* Tab Switcher Bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-700/60 bg-slate-900/60 px-4 py-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Deep Neuro Mode:
        </span>
        <button
          onClick={() => setActiveTab('digital-twin')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-mono text-[10.5px] font-semibold transition ${
            activeTab === 'digital-twin'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Brain className="h-3.5 w-3.5" />
          Digital Twin Viewer
        </button>
        <button
          onClick={() => setActiveTab('risk-atlas')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-mono text-[10.5px] font-semibold transition ${
            activeTab === 'risk-atlas'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Risk Atlas
        </button>
      </div>

      {/* Active Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'digital-twin' ? (
          <BrainDigitalTwinViewer />
        ) : (
          <RiskAtlasView />
        )}
      </div>
    </div>
  )
}

// =============================================================================
// RISK ATLAS VIEW — the original DeepTwinWorkspace content, preserved intact
// =============================================================================

function useIsoGeometry(mesh: IsoMesh | null) {
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

// Clinical tumor color palettes
export type TumorColorMode = 'amber' | 'violet' | 'cyan' | 'ruby'

export const TUMOR_COLOR_PALETTES: Record<
  TumorColorMode,
  {
    name: string
    shortLabel: string
    wtColor: number
    wtOpacity: number
    tcColor: number
    tcOpacity: number
    etColor: number
    etEmissive: number
    badgeBg: string
    hex: string
  }
> = {
  amber: {
    name: 'Surgical Amber-Gold (Brainlab Standard)',
    shortLabel: 'Amber-Gold',
    wtColor: 0x78350f,
    wtOpacity: 0.16,
    tcColor: 0x451a03,
    tcOpacity: 0.65,
    etColor: 0xf59e0b,
    etEmissive: 0xd97706,
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    hex: '#f59e0b',
  },
  violet: {
    name: '5-ALA Fluorescent Violet (405nm Operative)',
    shortLabel: '5-ALA Violet',
    wtColor: 0x4a044e,
    wtOpacity: 0.16,
    tcColor: 0x2e0854,
    tcOpacity: 0.65,
    etColor: 0xd946ef,
    etEmissive: 0xa21caf,
    badgeBg: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
    hex: '#d946ef',
  },
  cyan: {
    name: 'Hypermetabolic PET Teal',
    shortLabel: 'PET Teal',
    wtColor: 0x134e4a,
    wtOpacity: 0.16,
    tcColor: 0x042f2e,
    tcOpacity: 0.65,
    etColor: 0x06b6d4,
    etEmissive: 0x0891b2,
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    hex: '#06b6d4',
  },
  ruby: {
    name: 'Contrast Carmine Ruby',
    shortLabel: 'Carmine Ruby',
    wtColor: 0x334155,
    wtOpacity: 0.14,
    tcColor: 0x78350f,
    tcOpacity: 0.55,
    etColor: 0xdc2626,
    etEmissive: 0x991b1b,
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    hex: '#dc2626',
  },
}

// Risk Connection Beam
function RiskConnectionBeam({
  connection,
  isSelected,
  onSelect,
}: {
  connection: TumorConnectionRisk
  isSelected: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const lineRef = useRef<THREE.Line>(null)

  if (connection.clearanceMm > 7.0 && !isSelected) {
    return null
  }

  const curveGeom = useMemo(() => {
    const [p0, p1, p2] = connection.connectionLinePoints
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(p0[0], p0[1], p0[2]),
      new THREE.Vector3(p1[0], p1[1], p1[2]),
      new THREE.Vector3(p2[0], p2[1], p2[2]),
    )
    const pts = curve.getPoints(24)
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [connection])

  const beamColor = useMemo(() => {
    if (connection.riskTier === 'CRITICAL') return 0xef4444
    if (connection.riskTier === 'HIGH') return 0xf59e0b
    return 0x94a3b8
  }, [connection.riskTier])

  useFrame((state) => {
    if (lineRef.current && (connection.riskTier === 'CRITICAL' || isSelected)) {
      const mat = lineRef.current.material as THREE.LineBasicMaterial
      const t = state.clock.getElapsedTime()
      mat.opacity = isSelected ? 0.95 : 0.45 + Math.sin(t * 3.0) * 0.25
    }
  })

  const midPt = connection.connectionLinePoints[1]

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <primitive
        object={
          new THREE.Line(
            curveGeom,
            new THREE.LineBasicMaterial({
              color: beamColor,
              transparent: true,
              opacity: isSelected ? 0.95 : hovered ? 0.8 : 0.45,
              linewidth: isSelected ? 2.0 : 1.2,
              depthWrite: false,
            }),
          )
        }
        ref={lineRef}
      />
      <mesh position={connection.structure.centerWorld}>
        <sphereGeometry args={[isSelected ? 1.8 : hovered ? 1.5 : 1.0, 10, 10]} />
        <meshBasicMaterial
          color={beamColor}
          transparent
          opacity={isSelected ? 1.0 : 0.75}
        />
      </mesh>

      <Html position={midPt} center distanceFactor={140} zIndexRange={[1, 10]}>
        <div
          className={`pointer-events-none flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider shadow-lg ${
            connection.riskTier === 'CRITICAL'
              ? 'border-red-500/60 bg-slate-950/95 text-red-300'
              : 'border-amber-500/60 bg-slate-950/95 text-amber-300'
          }`}
        >
          <span>{connection.clearanceMm} mm</span>
          <span className="opacity-60 font-normal">[{connection.structure.shortCode}]</span>
        </div>
      </Html>
    </group>
  )
}

// Camera Controller
function CameraTargetController({
  focusTarget,
  presetView,
}: {
  focusTarget: [number, number, number] | null
  presetView: string | null
}) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)

  useEffect(() => {
    if (!controlsRef.current) return

    if (focusTarget) {
      const targetVec = new THREE.Vector3(...focusTarget)
      controlsRef.current.target.lerp(targetVec, 0.9)
      controlsRef.current.update()
    }
  }, [focusTarget])

  useEffect(() => {
    if (!controlsRef.current || !presetView) return

    if (presetView === 'free') {
      camera.position.set(-135, 95, 75)
      controlsRef.current.target.set(-10, 0, 10)
    } else if (presetView === 'sylvian') {
      camera.position.set(-160, 40, 30)
      controlsRef.current.target.set(-20, 0, 10)
    } else if (presetView === 'axial') {
      camera.position.set(0, 0, 190)
      controlsRef.current.target.set(0, 0, 10)
    } else if (presetView === 'coronal') {
      camera.position.set(0, 190, 10)
      controlsRef.current.target.set(0, 0, 10)
    } else if (presetView === 'sagittal') {
      camera.position.set(-190, 0, 10)
      controlsRef.current.target.set(0, 0, 10)
    } else if (presetView === 'skullbase') {
      camera.position.set(0, -160, -40)
      controlsRef.current.target.set(0, 0, -10)
    } else if (presetView === 'posterior') {
      camera.position.set(0, 170, -20)
      controlsRef.current.target.set(0, -18, -10)
    }
    controlsRef.current.update()
  }, [presetView, camera])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={30}
      maxDistance={420}
      enableRotate={true}
      enablePan={true}
      enableZoom={true}
    />
  )
}

// Deep Twin Scene
function DeepTwinScene({
  selectedStructure,
  onSelectStructure,
  isTumorSelected,
  onSelectTumor,
  tumorColorMode,
  cortexOpacity,
  visibility,
  connections,
  tumorCentroid,
  focusTarget,
  presetView,
}: {
  selectedStructure: DeepAnatomicalStructure | null
  onSelectStructure: (struct: DeepAnatomicalStructure | null) => void
  isTumorSelected: boolean
  onSelectTumor: (selected: boolean) => void
  tumorColorMode: TumorColorMode
  cortexOpacity: number
  visibility: {
    cortex: boolean
    arteries: boolean
    veins: boolean
    nerves: boolean
    nuclei: boolean
    ventricles: boolean
    tracts: boolean
    tumorWT: boolean
    tumorTC: boolean
    tumorET: boolean
    connectors: boolean
  }
  connections: TumorConnectionRisk[]
  tumorCentroid: [number, number, number]
  focusTarget: [number, number, number] | null
  presetView: string | null
}) {
  const { brainMesh, meshes } = useStudy()

  const brainGeom = useIsoGeometry(brainMesh)
  const wtGeom = useIsoGeometry(meshes.predicted.WT)
  const tcGeom = useIsoGeometry(meshes.predicted.TC)
  const etGeom = useIsoGeometry(meshes.predicted.ET)

  const vascularSets = useMemo(() => createVascularSystemGeometries(), [])
  const cranialNerves = useMemo(() => createCranialNervesGeometries(), [])
  const subcorticalNuclei = useMemo(() => createSubcorticalNucleiGeometries(), [])
  const ventriclesGeom = useMemo(() => createVentriclesGeometry(), [])
  const tractSets = useMemo(() => createTractStreamlines(), [])

  const activePalette = TUMOR_COLOR_PALETTES[tumorColorMode]

  return (
    <>
      <CameraTargetController focusTarget={focusTarget} presetView={presetView} />

      <ambientLight intensity={0.44} />
      <directionalLight position={[90, 100, 110]} intensity={1.15} />
      <directionalLight position={[-90, -80, -90]} intensity={0.5} />
      <pointLight
        position={[tumorCentroid[0], tumorCentroid[1] + 20, tumorCentroid[2] + 30]}
        intensity={1.3}
        color={activePalette.hex}
        distance={130}
      />

      <gridHelper
        args={[320, 32, 0x1e293b, 0x0f172a]}
        position={[0, 0, -60]}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {visibility.cortex && brainGeom && (
        <group>
          <mesh
            geometry={brainGeom}
            renderOrder={1}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              const p = e.point
              const segId = classifyCoordinateToSegment(p.x, p.y, p.z)
              const seg = BRAIN_SEGMENTS[segId]
              const assessment = evaluateSegmentTumorInvolvement(
                seg.centerWorld,
                tumorCentroid,
                24.5,
              )
              const struct: DeepAnatomicalStructure = {
                id: seg.id,
                name: seg.name,
                shortCode: seg.shortLabel,
                category: 'cortex',
                system: 'Neocortical Eloquence',
                color: seg.colorHex,
                hex: seg.colorNum,
                centerWorld: [Number(p.x.toFixed(1)), Number(p.y.toFixed(1)), Number(p.z.toFixed(1))],
                safeMarginMm: 12.0,
                criticality:
                  assessment.threatTier === 'CRITICAL'
                    ? 'critical'
                    : assessment.threatTier === 'HIGH'
                    ? 'high'
                    : 'moderate',
                functionDescription: seg.functions,
                clinicalRiskDescription: seg.clinicalRelevance,
                surgicalConsideration: `${assessment.involvementDescription} Recommendation: ${assessment.surgicalRecommendation}`,
                bloodSupplyOrPathway: `Clearance to active tumor core: ${assessment.clearanceMm} mm (${assessment.pathologicalStatus})`,
              }
              onSelectStructure(struct)
              onSelectTumor(false)
            }}
          >
            <meshPhysicalMaterial
              color={0x64748b}
              transparent
              opacity={cortexOpacity}
              roughness={0.28}
              metalness={0.06}
              transmission={Math.max(0.05, 0.92 - cortexOpacity * 0.85)}
              clearcoat={0.7}
              clearcoatRoughness={0.18}
              side={THREE.DoubleSide}
              depthWrite={cortexOpacity > 0.45}
            />
          </mesh>
          <mesh geometry={brainGeom} renderOrder={1.2}>
            <meshStandardMaterial
              wireframe
              color={0x94a3b8}
              transparent
              opacity={Math.min(0.28, cortexOpacity * 0.5 + 0.08)}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {visibility.arteries &&
        vascularSets.arteries.map((art) => (
          <group key={art.id}>
            {art.tubes.map((tube, idx) => (
              <mesh
                key={idx}
                geometry={tube}
                renderOrder={3}
                onClick={(e) => {
                  e.stopPropagation()
                  const found = DEEP_ANATOMICAL_ATLAS.find(
                    (s) => s.id === art.id || (art.id === 'mca-l' && s.id === 'mca-m2-l'),
                  )
                  if (found) {
                    onSelectStructure(found)
                    onSelectTumor(false)
                  }
                }}
              >
                <meshStandardMaterial
                  color={0x991b1b}
                  roughness={0.35}
                  metalness={0.12}
                  emissive={0x450a0a}
                  emissiveIntensity={0.18}
                />
              </mesh>
            ))}
          </group>
        ))}

      {visibility.veins &&
        vascularSets.veins.map((vein) => (
          <group key={vein.id}>
            {vein.tubes.map((tube, idx) => (
              <mesh
                key={idx}
                geometry={tube}
                renderOrder={3}
                onClick={(e) => {
                  e.stopPropagation()
                  const found = DEEP_ANATOMICAL_ATLAS.find(
                    (s) => s.id === vein.id || (vein.id === 'dural-sinuses' && s.id === 'sss'),
                  )
                  if (found) {
                    onSelectStructure(found)
                    onSelectTumor(false)
                  }
                }}
              >
                <meshStandardMaterial
                  color={0x1e3a5f}
                  roughness={0.4}
                  metalness={0.08}
                  emissive={0x0f172a}
                  emissiveIntensity={0.12}
                  transparent
                  opacity={0.85}
                />
              </mesh>
            ))}
          </group>
        ))}

      {visibility.nerves &&
        cranialNerves.map((cn) => (
          <group key={cn.id}>
            {cn.tubes.map((tube, idx) => (
              <mesh
                key={idx}
                geometry={tube}
                renderOrder={3.5}
                onClick={(e) => {
                  e.stopPropagation()
                  const found = DEEP_ANATOMICAL_ATLAS.find((s) =>
                    s.id.startsWith(
                      cn.id
                        .replace('-optic', '')
                        .replace('-trigeminal', '')
                        .replace('-oculomotor', ''),
                    ),
                  )
                  if (found) {
                    onSelectStructure(found)
                    onSelectTumor(false)
                  }
                }}
              >
                <meshStandardMaterial
                  color={0xe2e8f0}
                  roughness={0.25}
                  metalness={0.05}
                  emissive={0x94a3b8}
                  emissiveIntensity={0.12}
                />
              </mesh>
            ))}
          </group>
        ))}

      {visibility.nuclei &&
        subcorticalNuclei.map((nuc) => (
          <mesh
            key={nuc.id}
            geometry={nuc.geometry}
            renderOrder={2.5}
            onClick={(e) => {
              e.stopPropagation()
              const found = DEEP_ANATOMICAL_ATLAS.find((s) => s.id === nuc.id)
              if (found) {
                onSelectStructure(found)
                onSelectTumor(false)
              }
            }}
          >
            <meshStandardMaterial
              color={0x475569}
              transparent
              opacity={0.35}
              roughness={0.5}
              metalness={0.05}
            />
          </mesh>
        ))}

      {visibility.ventricles && (
        <mesh
          geometry={ventriclesGeom}
          renderOrder={2}
          onClick={(e) => {
            e.stopPropagation()
            const found = DEEP_ANATOMICAL_ATLAS.find((s) => s.id === 'ventricles')
            if (found) {
              onSelectStructure(found)
              onSelectTumor(false)
            }
          }}
        >
          <meshPhysicalMaterial
            color={0x64748b}
            transparent
            opacity={0.14}
            roughness={0.1}
            transmission={0.85}
            clearcoat={0.8}
            depthWrite={false}
          />
        </mesh>
      )}

      {visibility.tracts &&
        tractSets.map((tract) => (
          <group key={tract.id}>
            {tract.tubes.map((tube, idx) => (
              <mesh
                key={idx}
                geometry={tube}
                renderOrder={3.2}
                onClick={(e) => {
                  e.stopPropagation()
                  const found = DEEP_ANATOMICAL_ATLAS.find((s) => s.id === tract.id)
                  if (found) {
                    onSelectStructure(found)
                    onSelectTumor(false)
                  }
                }}
              >
                <meshStandardMaterial
                  color={0x64748b}
                  roughness={0.3}
                  metalness={0.05}
                  transparent
                  opacity={0.65}
                />
              </mesh>
            ))}
          </group>
        ))}

      {visibility.tumorWT && wtGeom && (
        <mesh
          geometry={wtGeom}
          renderOrder={2.8}
          onClick={(e) => {
            e.stopPropagation()
            onSelectStructure(null)
            onSelectTumor(true)
          }}
        >
          <meshPhysicalMaterial
            color={activePalette.wtColor}
            transparent
            opacity={activePalette.wtOpacity}
            roughness={0.35}
            depthWrite={false}
          />
        </mesh>
      )}

      {visibility.tumorTC && tcGeom && (
        <mesh
          geometry={tcGeom}
          renderOrder={3.5}
          onClick={(e) => {
            e.stopPropagation()
            onSelectStructure(null)
            onSelectTumor(true)
          }}
        >
          <meshStandardMaterial
            color={activePalette.tcColor}
            transparent
            opacity={activePalette.tcOpacity}
            roughness={0.45}
          />
        </mesh>
      )}

      {visibility.tumorET && etGeom && (
        <mesh
          geometry={etGeom}
          renderOrder={4}
          onClick={(e) => {
            e.stopPropagation()
            onSelectStructure(null)
            onSelectTumor(true)
          }}
        >
          <meshStandardMaterial
            color={activePalette.etColor}
            roughness={0.25}
            metalness={0.12}
            emissive={activePalette.etEmissive}
            emissiveIntensity={isTumorSelected ? 0.75 : 0.4}
          />
        </mesh>
      )}

      {visibility.connectors &&
        connections.map((conn) => (
          <RiskConnectionBeam
            key={conn.structure.id}
            connection={conn}
            isSelected={selectedStructure?.id === conn.structure.id}
            onSelect={() => {
              onSelectTumor(false)
              onSelectStructure(conn.structure)
            }}
          />
        ))}

      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewcube
          opacity={0.88}
          strokeColor="#334155"
          textColor="#f8fafc"
          color="#0f172a"
        />
      </GizmoHelper>

      <EffectComposer multisampling={4}>
        <Bloom
          luminanceThreshold={0.85}
          luminanceSmoothing={0.2}
          intensity={0.12}
        />
        <Vignette darkness={0.35} offset={0.3} />
      </EffectComposer>
    </>
  )
}

// =============================================================================
// RISK ATLAS VIEW (the original monolith, preserved)
// =============================================================================

function RiskAtlasView() {
  const bundle = useStudy()
  const caseId = bundle.jobId || bundle.sha256?.slice(0, 8) || 'BraTS-2024-Demo'

  const [visibility, setVisibility] = useState({
    cortex: true,
    arteries: true,
    veins: true,
    nerves: true,
    nuclei: true,
    ventricles: true,
    tracts: true,
    tumorWT: true,
    tumorTC: true,
    tumorET: true,
    connectors: true,
  })

  const [selectedStructure, setSelectedStructure] = useState<DeepAnatomicalStructure | null>(null)
  const [isTumorSelected, setIsTumorSelected] = useState(false)
  const [tumorColorMode, setTumorColorMode] = useState<TumorColorMode>('amber')
  const [cortexOpacity, setCortexOpacity] = useState<number>(0.35)

  const [focusTarget, setFocusTarget] = useState<[number, number, number] | null>(null)
  const [presetView, setPresetView] = useState<string | null>('free')
  const [filterRisk, setFilterRisk] = useState<'ALL' | 'CRITICAL' | 'HIGH'>('ALL')
  const [showLayerMenu, setShowLayerMenu] = useState(false)

  const tumorCentroid: [number, number, number] = useMemo(() => [-34, 10, 20], [])

  const pathology: TumorPathologyAnalysis = useMemo(
    () => getCompleteTumorPathology(bundle),
    [bundle],
  )

  const allConnections: TumorConnectionRisk[] = useMemo(
    () => evaluateTumorConnectionMatrix(tumorCentroid, pathology.effectiveRadiusMm),
    [tumorCentroid, pathology.effectiveRadiusMm],
  )

  const filteredConnections = useMemo(() => {
    if (filterRisk === 'CRITICAL') return allConnections.filter((c) => c.riskTier === 'CRITICAL')
    if (filterRisk === 'HIGH')
      return allConnections.filter((c) => c.riskTier === 'CRITICAL' || c.riskTier === 'HIGH')
    return allConnections
  }, [allConnections, filterRisk])

  const activeRiskRecord = useMemo(() => {
    if (!selectedStructure) return null
    const found = allConnections.find((c) => c.structure.id === selectedStructure.id)
    if (found) return found

    // Compute dynamically for cortex lobes or any structure not in the default connections
    const dx = selectedStructure.centerWorld[0] - tumorCentroid[0]
    const dy = selectedStructure.centerWorld[1] - tumorCentroid[1]
    const dz = selectedStructure.centerWorld[2] - tumorCentroid[2]
    const dist = Math.hypot(dx, dy, dz)
    const clearanceMm = Number(Math.max(0, dist - pathology.effectiveRadiusMm).toFixed(1))

    let riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'SAFE' = 'SAFE'
    let involvementType:
      | 'Circumferentially Encased (>180°)'
      | 'Adherent & Impinged'
      | 'Displaced by Edema'
      | 'Unthreatened Margin' = 'Unthreatened Margin'

    if (clearanceMm <= 2.5) {
      riskTier = 'CRITICAL'
      involvementType = 'Circumferentially Encased (>180°)'
    } else if (clearanceMm <= 6.5) {
      riskTier = 'HIGH'
      involvementType = 'Adherent & Impinged'
    } else if (clearanceMm <= 14.0) {
      riskTier = 'MODERATE'
      involvementType = 'Displaced by Edema'
    }

    return {
      structure: selectedStructure,
      distanceMm: Number(dist.toFixed(1)),
      clearanceMm,
      riskTier,
      involvementType,
      functionalRisk: selectedStructure.clinicalRiskDescription,
      surgicalCaveat: selectedStructure.surgicalConsideration,
      connectionLinePoints: [
        tumorCentroid,
        selectedStructure.centerWorld,
        selectedStructure.centerWorld,
      ] as [Vec3, Vec3, Vec3],
    }
  }, [selectedStructure, allConnections, tumorCentroid, pathology.effectiveRadiusMm])

  const handleSelect = (struct: DeepAnatomicalStructure | null) => {
    setSelectedStructure(struct)
    if (struct) {
      setIsTumorSelected(false)
      setFocusTarget(struct.centerWorld)
      setShowLayerMenu(false)
    } else {
      setFocusTarget(null)
    }
  }

  const handleSelectTumor = (selected: boolean) => {
    setIsTumorSelected(selected)
    if (selected) {
      setSelectedStructure(null)
      setFocusTarget(tumorCentroid)
      setShowLayerMenu(false)
    }
  }

  const activePalette = TUMOR_COLOR_PALETTES[tumorColorMode]

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#070a13] text-slate-200 select-none font-sans">
      {/* Top Floating Control Bar */}
      <header className="pointer-events-none absolute top-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-slate-700/60 bg-slate-900/90 px-3 py-1.5 backdrop-blur-md shadow-2xl">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-rose-500/15 text-rose-400">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-100 uppercase">
                  Deep Neuro-Twin Risk Atlas
                </span>
                <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[9px] font-medium text-rose-300">
                  PROXIMITY RADAR
                </span>
              </div>
              <span className="font-mono text-[9.5px] text-slate-400">
                Circle of Willis · Cranial Nerves · Multi-Omics
              </span>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 backdrop-blur-md shadow-lg">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
            <span className="font-mono text-[10.5px] text-amber-200">
              Critical Encasement: <strong className="text-white">MCA M2 (1.8mm)</strong> ·{' '}
              <strong className="text-white">CST (3.2mm)</strong>
            </span>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/90 px-2.5 py-1.5 backdrop-blur-md shadow-2xl">
            <Brain className="h-3.5 w-3.5 text-slate-300" />
            <span className="font-mono text-[9.5px] text-slate-300 font-semibold whitespace-nowrap">
              Brain Outline:
            </span>
            <input
              type="range"
              min="0.08"
              max="0.80"
              step="0.04"
              value={cortexOpacity}
              onChange={(e) => setCortexOpacity(parseFloat(e.target.value))}
              className="h-1.5 w-16 cursor-pointer accent-sky-400 bg-slate-700 rounded-lg"
              title={`Brain Outline Opacity: ${Math.round(cortexOpacity * 100)}%`}
            />
            <span className="font-mono text-[9.5px] font-bold text-sky-400 w-7">
              {Math.round(cortexOpacity * 100)}%
            </span>

            <div className="flex items-center gap-0.5 border-l border-slate-700/80 pl-1 font-mono text-[9px]">
              {[
                { label: 'Ghost', val: 0.12 },
                { label: 'Subtle', val: 0.35 },
                { label: 'Solid', val: 0.7 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setCortexOpacity(preset.val)}
                  className={`rounded px-1.5 py-0.5 transition-all ${
                    Math.abs(cortexOpacity - preset.val) < 0.08
                      ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900/90 px-2.5 py-1.5 backdrop-blur-md shadow-2xl">
            <span className="font-mono text-[9.5px] text-slate-400 uppercase font-semibold">
              Tumor:
            </span>
            {(['amber', 'violet', 'cyan', 'ruby'] as TumorColorMode[]).map((mode) => {
              const pal = TUMOR_COLOR_PALETTES[mode]
              const isCur = tumorColorMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setTumorColorMode(mode)}
                  title={pal.name}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9.5px] transition-all ${
                    isCur
                      ? `${pal.badgeBg} font-bold shadow-sm`
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pal.hex }} />
                  <span>{pal.shortLabel}</span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900/90 p-1 backdrop-blur-md shadow-2xl">
            <span className="px-1.5 font-mono text-[9px] font-medium text-slate-400 uppercase tracking-wider">
              View:
            </span>
            {[
              { key: 'free', label: 'Free 360°' },
              { key: 'sylvian', label: 'Sylvian (L-MCA)' },
              { key: 'axial', label: 'Axial' },
              { key: 'coronal', label: 'Coronal' },
              { key: 'sagittal', label: 'Sagittal' },
              { key: 'skullbase', label: 'Skull Base' },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => setPresetView(p.key)}
                className={`rounded px-2 py-1 font-mono text-[10px] transition-all ${
                  presetView === p.key
                    ? 'bg-sky-500 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Full-Canvas 3D Viewport */}
      <div className="relative h-full w-full flex-1">
        <Canvas
          camera={{ position: [-135, 95, 75], fov: 42 }}
          gl={{ antialias: true, alpha: false }}
          className="h-full w-full"
        >
          <DeepTwinScene
            selectedStructure={selectedStructure}
            onSelectStructure={handleSelect}
            isTumorSelected={isTumorSelected}
            onSelectTumor={handleSelectTumor}
            tumorColorMode={tumorColorMode}
            cortexOpacity={cortexOpacity}
            visibility={visibility}
            connections={filteredConnections}
            tumorCentroid={tumorCentroid}
            focusTarget={focusTarget}
            presetView={presetView}
          />
        </Canvas>
      </div>

      {/* Bottom Floating Minimal Dock */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
        {showLayerMenu && (
          <div className="pointer-events-auto mb-1 flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/95 p-2.5 backdrop-blur-xl shadow-2xl max-w-[92vw]">
            <span className="mr-1 font-mono text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider">
              Anatomical Layers:
            </span>

            {[
              { key: 'cortex', label: 'Cortex Outline', color: 'text-slate-300' },
              { key: 'arteries', label: 'Circle of Willis (Arteries)', color: 'text-red-400' },
              { key: 'veins', label: 'Dural Sinuses (Veins)', color: 'text-slate-300' },
              { key: 'nerves', label: 'Cranial Nerves (CN II/V)', color: 'text-slate-200' },
              { key: 'tracts', label: 'Tracts (CST/Arcuate)', color: 'text-slate-300' },
              { key: 'nuclei', label: 'Deep Nuclei (Thalamus)', color: 'text-slate-400' },
              { key: 'ventricles', label: 'Ventricles (CSF)', color: 'text-slate-300' },
              { key: 'tumorET', label: 'Active ET Malignancy', color: 'text-amber-400 font-semibold' },
              { key: 'connectors', label: 'Risk Calipers', color: 'text-amber-400 font-semibold' },
            ].map((layer) => {
              const isActive = visibility[layer.key as keyof typeof visibility]
              return (
                <button
                  key={layer.key}
                  onClick={() =>
                    setVisibility((prev) => ({
                      ...prev,
                      [layer.key]: !prev[layer.key as keyof typeof visibility],
                    }))
                  }
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10px] transition-all ${
                    isActive
                      ? 'border border-slate-600/80 bg-slate-800 text-slate-100 shadow-sm'
                      : 'border border-transparent bg-slate-900/60 text-slate-500 line-through opacity-60'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-sky-400' : 'bg-slate-600'}`}
                  />
                  <span className={layer.color}>{layer.label}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/90 px-3.5 py-1.5 backdrop-blur-lg shadow-2xl">
          <button
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] transition-all ${
              showLayerMenu
                ? 'bg-sky-500/20 border border-sky-500/40 text-sky-200'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Eye className="h-3.5 w-3.5 text-sky-400" />
            <span>
              Layers ({Object.values(visibility).filter(Boolean).length}/
              {Object.keys(visibility).length})
            </span>
          </button>

          <div className="h-3 w-px bg-slate-700" />

          <button
            onClick={() => handleSelectTumor(true)}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1 font-mono text-[10.5px] font-medium transition-all shadow-sm ${
              isTumorSelected && !selectedStructure
                ? 'bg-amber-500/30 border-amber-500 text-white'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25'
            }`}
          >
            <span
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ backgroundColor: activePalette.hex }}
            />
            Inspect Tumor Dossier
          </button>

          <div className="h-3 w-px bg-slate-700" />

          <button
            onClick={() => {
              const mca = DEEP_ANATOMICAL_ATLAS.find((s) => s.id === 'mca-m2-l')
              if (mca) handleSelect(mca)
            }}
            className="flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/20 px-3 py-1 font-mono text-[10px] font-medium text-rose-200 hover:bg-rose-500/30 transition-all shadow-sm"
          >
            <Crosshair className="h-3 w-3 text-rose-400" />
            MCA M2 Encasement
          </button>

          <button
            onClick={() => {
              handleSelect(null)
              setIsTumorSelected(false)
              setPresetView('free')
            }}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Reset 3D Camera"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Sliding Inspection Drawer */}
      {(selectedStructure || isTumorSelected) && (
        <aside className="pointer-events-auto absolute top-3 right-3 bottom-3 z-50 flex w-96 flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/98 shadow-2xl backdrop-blur-2xl transition-all duration-300 ease-out">
          {isTumorSelected && !selectedStructure ? (
            <>
              <div className="flex items-start justify-between border-b border-slate-800/80 p-4 bg-slate-950/60">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full animate-pulse shadow-md"
                      style={{ backgroundColor: activePalette.hex }}
                    />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                      PRIMARY DIGITAL TWIN PATHOLOGY
                    </span>
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.2 font-mono text-[9px] font-medium text-rose-300">
                      WHO Grade IV
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold leading-tight text-white">
                    Glioblastoma Multiforme (GBM)
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[10px] text-slate-400">
                      Centroid RAS+ [{tumorCentroid.join(', ')}] mm
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[9px] text-slate-300">
                      Vol: {pathology.compartmentVolumesMl.wholeTumor} mL
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsTumorSelected(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                  title="Close inspection drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[12px] scrollbar-thin">
                {/* Tumor Color Shading */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Tumor Visualization Shading:
                    </span>
                    <span className="font-mono text-[9.5px] text-slate-300 font-medium">
                      {activePalette.shortLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                    {(['amber', 'violet', 'cyan', 'ruby'] as TumorColorMode[]).map((mode) => {
                      const pal = TUMOR_COLOR_PALETTES[mode]
                      const isCur = tumorColorMode === mode
                      return (
                        <button
                          key={mode}
                          onClick={() => setTumorColorMode(mode)}
                          className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all ${
                            isCur
                              ? 'bg-slate-800 border border-slate-600 text-white shadow-sm'
                              : 'bg-slate-900/60 border border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                          }`}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: pal.hex }}
                          />
                          <span className="truncate">{pal.shortLabel}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Clinical Problem */}
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold text-rose-300 uppercase tracking-wider">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                    What is the Clinical Problem?
                  </div>
                  <div className="space-y-1.5 text-[11.5px] leading-relaxed text-slate-200">
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-rose-400 font-bold">•</span>
                      <span>
                        <strong className="text-white font-semibold">
                          Critical Vascular Encasement:
                        </strong>{' '}
                        Circumferential encasement (&gt;180°) of the Left Middle Cerebral Artery
                        (MCA M2 superior trunk) at 0.0 mm clearance.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-rose-400 font-bold">•</span>
                      <span>
                        <strong className="text-white font-semibold">
                          Mass Effect &amp; Herniation:
                        </strong>{' '}
                        4.2 mm subfalcine midline shift compressing the left lateral ventricle frontal horn.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-rose-400 font-bold">•</span>
                      <span>
                        <strong className="text-white font-semibold">
                          Motor Tract Abutment:
                        </strong>{' '}
                        Margin compression of the descending Corticospinal Tract (CST) at 3.2 mm distance.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tumor Compartment Volumes */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                  <div className="font-mono text-[10.5px] font-semibold text-white uppercase tracking-wider">
                    Segmented Compartment Volumetrics:
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center font-mono">
                    <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                      <div className="text-[9.5px] text-slate-400">Whole Tumor (WT)</div>
                      <div className="text-[14px] font-bold text-amber-400">
                        {pathology.compartmentVolumesMl.wholeTumor} mL
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                      <div className="text-[9.5px] text-slate-400">Active Core (ET)</div>
                      <div className="text-[14px] font-bold text-rose-400">
                        {pathology.compartmentVolumesMl.enhancingMalignancy} mL
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                      <div className="text-[9.5px] text-slate-400">Necrotic Core (TC)</div>
                      <div className="text-[14px] font-bold text-amber-200">
                        {pathology.compartmentVolumesMl.centralNecrosis} mL
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                      <div className="text-[9.5px] text-slate-400">Peritumoral Edema</div>
                      <div className="text-[14px] font-bold text-slate-300">
                        {Number(
                          (
                            pathology.compartmentVolumesMl.wholeTumor -
                            pathology.compartmentVolumesMl.tumorCore
                          ).toFixed(1),
                        )}{' '}
                        mL
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/80 p-3 bg-slate-950/60 flex items-center justify-between font-mono text-[10px]">
                <span className="text-slate-400">Click 3D space to dismiss</span>
                <button
                  onClick={() => setIsTumorSelected(false)}
                  className="rounded bg-slate-800 px-3 py-1 font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          ) : selectedStructure ? (
            <>
              <div className="flex items-start justify-between border-b border-slate-800/80 p-4 bg-slate-950/40">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setSelectedStructure(null)
                      setIsTumorSelected(true)
                      setFocusTarget(tumorCentroid)
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono text-sky-400 hover:text-sky-300 mb-1"
                  >
                    ← Back to Tumor Dossier
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: selectedStructure.color }}
                    />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {selectedStructure.system}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold leading-tight text-white">
                    {selectedStructure.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[10px] text-slate-400">
                      RAS+ [{selectedStructure.centerWorld.join(', ')}]
                    </span>
                    {selectedStructure.vesselOrAxonCaliberMm && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[9px] text-slate-300">
                        Ø {selectedStructure.vesselOrAxonCaliberMm} mm
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleSelect(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                  title="Close inspection drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[12px] scrollbar-thin">
                {/* PROMINENT TUMOR INVOLVEMENT TELEMETRY BANNER */}
                {activeRiskRecord && (
                  <div
                    className={`rounded-xl border p-3.5 shadow-lg ${
                      activeRiskRecord.clearanceMm <= 14.0
                        ? 'border-rose-500/60 bg-rose-950/40 text-rose-100 shadow-rose-950/30'
                        : 'border-emerald-500/60 bg-emerald-950/40 text-emerald-100 shadow-emerald-950/30'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        {activeRiskRecord.clearanceMm <= 14.0 ? (
                          <AlertTriangle className="h-4 w-4 text-rose-400 animate-pulse" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        )}
                        <span>
                          {activeRiskRecord.clearanceMm <= 14.0
                            ? '⚠️ DIRECTLY AFFECTED BY TUMOR'
                            : '✓ UNINVOLVED BY TUMOR'}
                        </span>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-[9.5px] font-bold ${
                          activeRiskRecord.riskTier === 'CRITICAL'
                            ? 'bg-rose-500/30 text-rose-200 border border-rose-500/40'
                            : activeRiskRecord.riskTier === 'HIGH'
                            ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                            : activeRiskRecord.riskTier === 'MODERATE'
                            ? 'bg-sky-500/30 text-sky-200 border border-sky-500/40'
                            : 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/40'
                        }`}
                      >
                        {activeRiskRecord.riskTier} RISK
                      </span>
                    </div>

                    <div className="mt-2.5 space-y-1.5 border-t border-slate-700/60 pt-2 font-mono text-[10.5px]">
                      <div className="flex justify-between text-slate-300">
                        <span>Clearance to Active Tumor Margin:</span>
                        <strong
                          className={
                            activeRiskRecord.clearanceMm <= 14.0
                              ? 'text-rose-300 font-bold'
                              : 'text-emerald-300 font-bold'
                          }
                        >
                          {activeRiskRecord.clearanceMm} mm
                        </strong>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Distance to Tumor Centroid:</span>
                        <span>{activeRiskRecord.distanceMm} mm</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Pathological Involvement:</span>
                        <span className="font-semibold text-white">
                          {activeRiskRecord.involvementType}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Neuro-Physiological Function
                  </div>
                  <p className="leading-relaxed text-slate-200">
                    {selectedStructure.functionDescription}
                  </p>
                </div>

                <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-3">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">
                    <AlertTriangle className="h-3 w-3" />
                    Neurological Deficit If Compromised
                  </div>
                  <p className="leading-relaxed text-slate-300">
                    {selectedStructure.clinicalRiskDescription}
                  </p>
                </div>

                <div className="rounded-lg border border-sky-500/20 bg-sky-950/20 p-3">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-sky-400 uppercase tracking-wider mb-1">
                    <Zap className="h-3 w-3" />
                    Surgical Corridor &amp; Monitoring Protocol
                  </div>
                  <p className="leading-relaxed text-slate-300">
                    {selectedStructure.surgicalConsideration}
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Threatened Anatomical Network:
                  </div>
                  <div className="space-y-1">
                    {allConnections.slice(0, 5).map((conn) => (
                      <button
                        key={conn.structure.id}
                        onClick={() => handleSelect(conn.structure)}
                        className={`flex w-full items-center justify-between rounded-md p-2 font-mono text-[10.5px] transition-all ${
                          selectedStructure.id === conn.structure.id
                            ? 'bg-sky-500/20 border border-sky-500/40 text-white'
                            : 'bg-slate-950/40 border border-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: conn.structure.color }}
                          />
                          <span>{conn.structure.shortCode}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9.5px] font-semibold ${
                              conn.riskTier === 'CRITICAL'
                                ? 'text-red-400'
                                : conn.riskTier === 'HIGH'
                                ? 'text-amber-400'
                                : 'text-sky-400'
                            }`}
                          >
                            {conn.clearanceMm} mm
                          </span>
                          <ChevronRight className="h-3 w-3" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/80 p-3 bg-slate-950/60 flex items-center justify-between font-mono text-[10px]">
                <span className="text-slate-400">Click 3D space to dismiss</span>
                <button
                  onClick={() => handleSelect(null)}
                  className="rounded bg-slate-800 px-3 py-1 font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          ) : null}
        </aside>
      )}
    </div>
  )
}
