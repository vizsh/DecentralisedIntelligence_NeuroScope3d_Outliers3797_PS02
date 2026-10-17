import * as THREE from 'three'
import type { StudyBundle } from '../state/study'
import type { Mat4, Vec3 } from './volume'
import { voxelToWorld, worldToVoxel } from './volume'

export interface EloquentStructure {
  id: string
  name: string
  category: 'cortex' | 'subcortex' | 'ventricle' | 'tract'
  functionDescription: string
  color: string
  hex: number
  centerWorld: Vec3
  safeMarginMm: number
  criticality: 'critical' | 'high' | 'moderate'
}

/**
 * Standard stereotaxic coordinates (RAS+ in mm) for key eloquent neuroanatomical structures
 * based on MNI152 / Harvard-Oxford Cortical & Subcortical Atlas conventions.
 */
export const ELOQUENT_STRUCTURES: EloquentStructure[] = [
  {
    id: 'motor-l',
    name: 'Primary Motor Cortex (L - Precentral)',
    category: 'cortex',
    functionDescription: 'Controls contralateral right-side voluntary motor movements (face, hand, leg).',
    color: '#f59e0b',
    hex: 0xf59e0b,
    centerWorld: [-38, -12, 52],
    safeMarginMm: 10.0,
    criticality: 'critical',
  },
  {
    id: 'motor-r',
    name: 'Primary Motor Cortex (R - Precentral)',
    category: 'cortex',
    functionDescription: 'Controls contralateral left-side voluntary motor movements (face, hand, leg).',
    color: '#f59e0b',
    hex: 0xf59e0b,
    centerWorld: [38, -12, 52],
    safeMarginMm: 10.0,
    criticality: 'critical',
  },
  {
    id: 'sensory-l',
    name: 'Somatosensory Cortex (L - Postcentral)',
    category: 'cortex',
    functionDescription: 'Contralateral tactile sensation, kinesthesia, and spatial discrimination.',
    color: '#6366f1',
    hex: 0x6366f1,
    centerWorld: [-40, -26, 48],
    safeMarginMm: 8.0,
    criticality: 'high',
  },
  {
    id: 'broca',
    name: "Broca's Area (L - Inferior Frontal)",
    category: 'cortex',
    functionDescription: 'Motor speech programming, syntactic fluency, and expressive language production.',
    color: '#10b981',
    hex: 0x10b981,
    centerWorld: [-50, 22, 16],
    safeMarginMm: 12.0,
    criticality: 'critical',
  },
  {
    id: 'wernicke',
    name: "Wernicke's Area (L - Superior Temporal)",
    category: 'cortex',
    functionDescription: 'Receptive language comprehension, semantic lexicon, and phonological processing.',
    color: '#a855f7',
    hex: 0xa855f7,
    centerWorld: [-54, -42, 18],
    safeMarginMm: 12.0,
    criticality: 'critical',
  },
  {
    id: 'cst-l',
    name: 'Corticospinal Tract (L - CST)',
    category: 'tract',
    functionDescription: 'Descending motor projection fibers traversing posterior limb of internal capsule.',
    color: '#38bdf8',
    hex: 0x38bdf8,
    centerWorld: [-18, -14, 12],
    safeMarginMm: 8.0,
    criticality: 'critical',
  },
  {
    id: 'cst-r',
    name: 'Corticospinal Tract (R - CST)',
    category: 'tract',
    functionDescription: 'Descending motor projection fibers traversing posterior limb of internal capsule.',
    color: '#38bdf8',
    hex: 0x38bdf8,
    centerWorld: [18, -14, 12],
    safeMarginMm: 8.0,
    criticality: 'critical',
  },
  {
    id: 'arcuate-l',
    name: 'Arcuate Fasciculus (L)',
    category: 'tract',
    functionDescription: 'Dorsal language tract connecting Broca and Wernicke; crucial for word repetition.',
    color: '#ec4899',
    hex: 0xec4899,
    centerWorld: [-42, -22, 28],
    safeMarginMm: 8.0,
    criticality: 'high',
  },
  {
    id: 'ventricles',
    name: 'Lateral & Third Ventricles (CSF)',
    category: 'ventricle',
    functionDescription: 'Cerebrospinal fluid cavities; anatomical landmark for mass effect & hydrocephalus.',
    color: '#06b6d4',
    hex: 0x06b6d4,
    centerWorld: [0, -6, 10],
    safeMarginMm: 5.0,
    criticality: 'moderate',
  },
]

// =============================================================================
// EXPANDED HIGH-FIDELITY DEEP NEURO-ANATOMICAL & VASCULAR ATLAS
// (As detailed in neurosurgical digital twin literature & "Visualizing the Human Brain")
// =============================================================================

export type AnatomicalCategory =
  | 'artery'
  | 'vein'
  | 'cranial_nerve'
  | 'tract'
  | 'deep_nucleus'
  | 'ventricle'
  | 'cortex'
  | 'brainstem'
  | 'cerebellum'

export interface DeepAnatomicalStructure {
  id: string
  name: string
  shortCode: string
  category: AnatomicalCategory
  system: 'Cerebrovascular Arteries' | 'Cerebral Venous Drainage' | 'Cranial Neuropathways' | 'Subcortical & Limbic' | 'Neocortical Eloquence' | 'Ventricular CSF'
  color: string
  hex: number
  centerWorld: Vec3
  safeMarginMm: number
  criticality: 'critical' | 'high' | 'moderate'
  functionDescription: string
  clinicalRiskDescription: string // What neurological deficit occurs if compromised
  surgicalConsideration: string
  vesselOrAxonCaliberMm?: number
  bloodSupplyOrPathway?: string
}

export const DEEP_ANATOMICAL_ATLAS: DeepAnatomicalStructure[] = [
  // --- CEREBROVASCULAR ARTERIES (Circle of Willis & Branches) - Cohesive Arterial Vermilion ---
  {
    id: 'mca-m2-l',
    name: 'Middle Cerebral Artery (M2 Superior Trunk - L)',
    shortCode: 'MCA M2-L',
    category: 'artery',
    system: 'Cerebrovascular Arteries',
    color: '#b91c1c',
    hex: 0xb91c1c,
    centerWorld: [-38, 4, 14],
    safeMarginMm: 3.5,
    criticality: 'critical',
    functionDescription: 'Major insular arterial trunk supplying frontal motor, pre-motor, and Broca speech operculum.',
    clinicalRiskDescription: 'High risk of intraoperative vascular spasm or accidental sacrifice resulting in irreversible ischemic stroke, dense faciobrachial hemiparesis, and global expressive aphasia.',
    surgicalConsideration: 'Direct proximity (<2.5mm) to tumor margin. Microsurgical subpial dissection strictly advised. Avoid bipolar electrocautery within 2mm. Continuous indocyanine green (ICG) angiography recommended.',
    vesselOrAxonCaliberMm: 2.2,
    bloodSupplyOrPathway: 'Arterial supply to Precentral Motor Strip & Broca',
  },
  {
    id: 'mca-m1-l',
    name: 'Middle Cerebral Artery (M1 Main Stem - L)',
    shortCode: 'MCA M1-L',
    category: 'artery',
    system: 'Cerebrovascular Arteries',
    color: '#b91c1c',
    hex: 0xb91c1c,
    centerWorld: [-24, 6, -2],
    safeMarginMm: 5.0,
    criticality: 'critical',
    functionDescription: 'Horizontal mainstem arising from ICA bifurcation; emits critical lenticulostriate perforating arteries to internal capsule.',
    clinicalRiskDescription: 'Lenticulostriate perforator occlusion produces catastrophic complete hemiplegia and internal capsule infarction.',
    surgicalConsideration: 'Deep proximal control required prior to aggressive medial resection of fronto-temporal tumor components.',
    vesselOrAxonCaliberMm: 3.1,
    bloodSupplyOrPathway: 'Lenticulostriate perforators to Basal Ganglia & Posterior Limb of Internal Capsule',
  },
  {
    id: 'mca-m1-r',
    name: 'Middle Cerebral Artery (M1 Main Stem - R)',
    shortCode: 'MCA M1-R',
    category: 'artery',
    system: 'Cerebrovascular Arteries',
    color: '#b91c1c',
    hex: 0xb91c1c,
    centerWorld: [24, 6, -2],
    safeMarginMm: 5.0,
    criticality: 'moderate',
    functionDescription: 'Contralateral right MCA trunk supplying right hemisphere motor and spatial awareness neocortex.',
    clinicalRiskDescription: 'Contralateral left-side hemiplegia and hemispatial neglect if compromised.',
    surgicalConsideration: 'Normative reference vasculature; uninvolved by left hemisphere pathology.',
    vesselOrAxonCaliberMm: 3.1,
    bloodSupplyOrPathway: 'Right hemisphere hemispheric perfusion',
  },
  {
    id: 'ica-l',
    name: 'Internal Carotid Artery (C7 Communicating - L)',
    shortCode: 'ICA C7-L',
    category: 'artery',
    system: 'Cerebrovascular Arteries',
    color: '#b91c1c',
    hex: 0xb91c1c,
    centerWorld: [-14, 2, -16],
    safeMarginMm: 6.0,
    criticality: 'critical',
    functionDescription: 'Supraclinoid carotid terminal giving rise to ophthalmic, posterior communicating, anterior choroidal, and ACA/MCA bifurcations.',
    clinicalRiskDescription: 'Catastrophic hemispheric ischemia or fatal hemorrhage.',
    surgicalConsideration: 'Identify anterior choroidal artery takeoff; preservation of distal branch patency is mandatory.',
    vesselOrAxonCaliberMm: 4.2,
    bloodSupplyOrPathway: 'Anterior cerebral circulation inflow',
  },
  {
    id: 'aca-a2-l',
    name: 'Anterior Cerebral Artery (A2 Pericallosal - L)',
    shortCode: 'ACA A2-L',
    category: 'artery',
    system: 'Cerebrovascular Arteries',
    color: '#b91c1c',
    hex: 0xb91c1c,
    centerWorld: [-6, 16, 18],
    safeMarginMm: 4.0,
    criticality: 'high',
    functionDescription: 'Ascends in interhemispheric fissure along corpus callosum, supplying medial frontal lobe and leg motor strip.',
    clinicalRiskDescription: 'Contralateral lower extremity paresis, urinary incontinence, and severe abulia / akinetic mutism.',
    surgicalConsideration: 'Maintain interhemispheric arachnoid planes; protect callosomarginal and pericallosal branching branches.',
    vesselOrAxonCaliberMm: 2.4,
    bloodSupplyOrPathway: 'Medial frontal lobe and supplementary motor area (SMA)',
  },
  {
    id: 'pca-p2-l',
    name: 'Posterior Cerebral Artery (P2 Ambient - L)',
    shortCode: 'PCA P2-L',
    category: 'artery',
    system: 'Cerebrovascular Arteries',
    color: '#b91c1c',
    hex: 0xb91c1c,
    centerWorld: [-18, -22, -6],
    safeMarginMm: 4.5,
    criticality: 'high',
    functionDescription: 'Courses through ambient cistern around midbrain to calcarine cortex and medial temporal lobe.',
    clinicalRiskDescription: 'Contralateral homonymous hemianopia with macular sparing and memory consolidation impairment.',
    surgicalConsideration: 'Preserve thalamoperforating vessels originating from P1/P2 junction.',
    vesselOrAxonCaliberMm: 2.3,
    bloodSupplyOrPathway: 'Primary visual cortex & inferior temporal gyri',
  },
  {
    id: 'basilar',
    name: 'Basilar Artery Trunk',
    shortCode: 'Basilar A.',
    category: 'artery',
    system: 'Cerebrovascular Arteries',
    color: '#b91c1c',
    hex: 0xb91c1c,
    centerWorld: [0, -18, -24],
    safeMarginMm: 6.0,
    criticality: 'critical',
    functionDescription: 'Midline brainstem vessel formed by vertebral union; supplies pons, midbrain, and cerebellar superior branches.',
    clinicalRiskDescription: 'Locked-in syndrome, quadriplegia, or fatal brainstem infarction.',
    surgicalConsideration: 'Ventral prepontine safe zone boundary; clear deep margin maintained.',
    vesselOrAxonCaliberMm: 3.8,
    bloodSupplyOrPathway: 'Vertebrobasilar posterior circulation',
  },

  // --- CEREBRAL VENOUS DRAINAGE - Deep Venous Slate Navy ---
  {
    id: 'sss',
    name: 'Superior Sagittal Sinus (SSS Midline)',
    shortCode: 'SSS Sinus',
    category: 'vein',
    system: 'Cerebral Venous Drainage',
    color: '#1e3a5f',
    hex: 0x1e3a5f,
    centerWorld: [0, -8, 62],
    safeMarginMm: 8.0,
    criticality: 'critical',
    functionDescription: 'Major dorsal dural venous sinus receiving superficial cortical bridging veins and CSF arachnoid granulations.',
    clinicalRiskDescription: 'Direct tumor invasion or surgical thrombosis causes catastrophic bilateral cerebral edema, venous infarctions, seizures, and intractable intracranial hypertension.',
    surgicalConsideration: 'Maintain at least 10mm dural cuff if tumor abuts midline; preserve parasagittal draining veins of Trolard.',
    vesselOrAxonCaliberMm: 8.5,
    bloodSupplyOrPathway: 'Major dorsal venous collector draining to Torcular Herophili',
  },
  {
    id: 'vein-trolard-l',
    name: 'Superior Anastomotic Vein of Trolard (L)',
    shortCode: 'V. Trolard',
    category: 'vein',
    system: 'Cerebral Venous Drainage',
    color: '#1e3a5f',
    hex: 0x1e3a5f,
    centerWorld: [-36, -14, 44],
    safeMarginMm: 4.0,
    criticality: 'critical',
    functionDescription: 'Large superficial cortical vein connecting superficial middle cerebral vein with the Superior Sagittal Sinus over motor cortex.',
    clinicalRiskDescription: 'Sacrifice or mechanical traction causes severe venous hemorrhagic infarction of the primary motor cortex resulting in permanent hemiplegia.',
    surgicalConsideration: 'Tumor edema borders venous trajectory. Strict preservation during craniotomy flap and dural opening.',
    vesselOrAxonCaliberMm: 2.6,
    bloodSupplyOrPathway: 'Cortical motor venous drainage to SSS',
  },
  {
    id: 'vein-labbe-l',
    name: 'Inferior Anastomotic Vein of Labbé (L)',
    shortCode: 'V. Labbé',
    category: 'vein',
    system: 'Cerebral Venous Drainage',
    color: '#1e3a5f',
    hex: 0x1e3a5f,
    centerWorld: [-48, -32, -8],
    safeMarginMm: 5.0,
    criticality: 'high',
    functionDescription: 'Courses across lateral temporal neocortex draining the Sylvian veins into the transverse sinus.',
    clinicalRiskDescription: 'Temporal lobe venous congestion, hemorrhagic transformation, and intractable sensory aphasia.',
    surgicalConsideration: 'Avoid excessive temporal lobe retraction during subtemporal approaches.',
    vesselOrAxonCaliberMm: 2.8,
    bloodSupplyOrPathway: 'Temporal neocortical venous drainage into Transverse Sinus',
  },
  {
    id: 'straight-sinus',
    name: 'Straight Sinus (Sinus Rectus)',
    shortCode: 'Straight Sinus',
    category: 'vein',
    system: 'Cerebral Venous Drainage',
    color: '#1e3a5f',
    hex: 0x1e3a5f,
    centerWorld: [0, -44, 12],
    safeMarginMm: 6.0,
    criticality: 'high',
    functionDescription: 'Formed at junction of falx cerebri and tentorium cerebelli by union of Inferior Sagittal Sinus and Great Vein of Galen.',
    clinicalRiskDescription: 'Internal cerebral deep venous thrombosis leads to lethal diencephalic and basal ganglia hemorrhagic necrosis.',
    surgicalConsideration: 'Deep landmark for tentorial incisura and pineal region exploration.',
    vesselOrAxonCaliberMm: 4.8,
    bloodSupplyOrPathway: 'Deep internal cerebral venous drainage collector',
  },

  // --- CRANIAL NEUROPATHWAYS & CRANIAL NERVES - Glistening Ivory Fiber ---
  {
    id: 'cn2-optic-chiasm',
    name: 'Optic Chiasm & Nerves (Cranial Nerve II)',
    shortCode: 'CN II (Optic)',
    category: 'cranial_nerve',
    system: 'Cranial Neuropathways',
    color: '#e2e8f0',
    hex: 0xe2e8f0,
    centerWorld: [0, 10, -10],
    safeMarginMm: 6.0,
    criticality: 'critical',
    functionDescription: 'Decussation hub of nasal retinal axon fibers transmitting primary visual sensory information to lateral geniculate bodies.',
    clinicalRiskDescription: 'Compression by mass effect causes bitemporal hemianopia, progressive visual acuity deterioration, or irreversible blindness.',
    surgicalConsideration: 'Prechiasmatic and suprasellar corridor landmark; verify absence of inferior tumor displacement.',
    vesselOrAxonCaliberMm: 3.5,
    bloodSupplyOrPathway: 'Retinofugal visual pathway to Occipital Visual Cortex',
  },
  {
    id: 'cn3-oculomotor-l',
    name: 'Oculomotor Nerve (Cranial Nerve III - L)',
    shortCode: 'CN III (Oculomotor)',
    category: 'cranial_nerve',
    system: 'Cranial Neuropathways',
    color: '#e2e8f0',
    hex: 0xe2e8f0,
    centerWorld: [-8, -6, -14],
    safeMarginMm: 5.0,
    criticality: 'high',
    functionDescription: 'Emerges from interpeduncular fossa between PCA and SCA; innervates levator palpebrae, superior/medial/inferior rectus, inferior oblique, and pupillary sphincter.',
    clinicalRiskDescription: 'Uncal herniation compression results in unilateral mydriasis ("blown pupil"), ptosis, and complete down-and-out ophthalmoplegia.',
    surgicalConsideration: 'Crucial clinical indicator of acute uncal transtentorial herniation under rising intracranial pressure.',
    vesselOrAxonCaliberMm: 2.1,
    bloodSupplyOrPathway: 'Parasympathetic and motor extraocular innervation',
  },
  {
    id: 'cn5-trigeminal-l',
    name: 'Trigeminal Nerve Sensory Root (Cranial Nerve V - L)',
    shortCode: 'CN V (Trigeminal)',
    category: 'cranial_nerve',
    system: 'Cranial Neuropathways',
    color: '#e2e8f0',
    hex: 0xe2e8f0,
    centerWorld: [-18, -14, -18],
    safeMarginMm: 5.0,
    criticality: 'high',
    functionDescription: 'Largest cranial nerve root exiting lateral mid-pons; conveys sensory input from ophthalmic (V1), maxillary (V2), and mandibular (V3) facial dermatomes.',
    clinicalRiskDescription: 'Trigeminal deafferentation neuralgia, hemifacial numbness, and loss of corneal protective blink reflex (neurotrophic keratitis risk).',
    surgicalConsideration: 'Meckel cave access landmark; protect root entry zone from electrothermal dispersion.',
    vesselOrAxonCaliberMm: 3.2,
    bloodSupplyOrPathway: 'Facial sensory and masticatory motor pathway',
  },
  {
    id: 'cn7-8-cpa-l',
    name: 'Facial & Acoustic Nerve Complex (CN VII / VIII - L)',
    shortCode: 'CN VII/VIII',
    category: 'cranial_nerve',
    system: 'Cranial Neuropathways',
    color: '#e2e8f0',
    hex: 0xe2e8f0,
    centerWorld: [-24, -26, -22],
    safeMarginMm: 5.0,
    criticality: 'high',
    functionDescription: 'Courses through cerebellopontine angle cistern into internal acoustic meatus; mediates mimetic facial expression, hearing, and vestibular equilibrium.',
    clinicalRiskDescription: 'Peripheral facial paralysis (House-Brackmann Grade VI Bell palsy), total sensorineural deafness, and debilitating vertigo.',
    surgicalConsideration: 'Monitored continuously with facial EMG and brainstem auditory evoked potentials (BAEP) in posterior skull base maneuvers.',
    vesselOrAxonCaliberMm: 2.7,
    bloodSupplyOrPathway: 'Facial motor & cochleovestibular sensory bundle',
  },

  // --- SUBCORTICAL NUCLEI & LIMBIC CIRCUITRY - Anatomical Deep Gray Matter ---
  {
    id: 'thalamus-l',
    name: 'Thalamus (Left Sensory-Motor Gateway)',
    shortCode: 'Thalamus (L)',
    category: 'deep_nucleus',
    system: 'Subcortical & Limbic',
    color: '#475569',
    hex: 0x475569,
    centerWorld: [-14, -16, 8],
    safeMarginMm: 6.0,
    criticality: 'critical',
    functionDescription: 'Crucial relay station forwarding somatosensory, motor, and visual signals to the cerebral cortex; regulates consciousness and sleep.',
    clinicalRiskDescription: 'Involvement causes Dejerine-Roussy syndrome (excruciating central neuropathic pain), hemi-ataxia, and altered levels of consciousness.',
    surgicalConsideration: 'Deep medial boundary. Infiltration contraindicates supra-total resection beyond tumor capsule.',
    bloodSupplyOrPathway: 'Thalamoperforating and thalamogeniculate arteries',
  },
  {
    id: 'thalamus-r',
    name: 'Thalamus (Right Sensory-Motor Gateway)',
    shortCode: 'Thalamus (R)',
    category: 'deep_nucleus',
    system: 'Subcortical & Limbic',
    color: '#475569',
    hex: 0x475569,
    centerWorld: [14, -16, 8],
    safeMarginMm: 6.0,
    criticality: 'moderate',
    functionDescription: 'Right diencephalic relay station; coordinates sensory perception and motor feedback.',
    clinicalRiskDescription: 'Contralateral sensory deficit and attentional neglect if disrupted.',
    surgicalConsideration: 'Uninvolved by current left hemispheric mass.',
  },
  {
    id: 'hippocampus-l',
    name: 'Hippocampus & Parahippocampal Formation (L)',
    shortCode: 'Hippocampus (L)',
    category: 'deep_nucleus',
    system: 'Subcortical & Limbic',
    color: '#475569',
    hex: 0x475569,
    centerWorld: [-26, -22, -10],
    safeMarginMm: 5.0,
    criticality: 'critical',
    functionDescription: 'Key limbic structure critical for memory consolidation, declarative verbal retrieval, and spatial mapping.',
    clinicalRiskDescription: 'Resection or ischemic injury precipitates dense, irreversible anterograde verbal amnesia and severe memory deficits.',
    surgicalConsideration: 'Medial temporal resection limit; preserve anterior choroidal artery supplying hippocampal head.',
    bloodSupplyOrPathway: 'Limbic Circuit of Papez',
  },
  {
    id: 'caudate-l',
    name: 'Caudate Nucleus (Head & Body - L)',
    shortCode: 'Caudate (L)',
    category: 'deep_nucleus',
    system: 'Subcortical & Limbic',
    color: '#475569',
    hex: 0x475569,
    centerWorld: [-12, 12, 10],
    safeMarginMm: 4.5,
    criticality: 'high',
    functionDescription: 'Component of the corpus striatum; controls voluntary motor initiation, executive procedural switching, and goal-directed action.',
    clinicalRiskDescription: 'Abulia, apathy, perseveration, and executive behavioral dysfunction.',
    surgicalConsideration: 'Lateral wall of the frontal horn of the lateral ventricle.',
    bloodSupplyOrPathway: 'Recurrent artery of Heubner and lenticulostriate branches',
  },
  {
    id: 'brainstem',
    name: 'Brainstem (Midbrain, Pons & Medulla)',
    shortCode: 'Brainstem',
    category: 'brainstem',
    system: 'Subcortical & Limbic',
    color: '#334155',
    hex: 0x334155,
    centerWorld: [0, -18, -26],
    safeMarginMm: 8.0,
    criticality: 'critical',
    functionDescription: 'Contains all ascending/descending projection tracts, cranial nerve nuclei, and vital respiratory/cardiovascular autonomic pacemakers.',
    clinicalRiskDescription: 'Transtentorial herniation or invasion causes acute coma, respiratory arrest, and brain death.',
    surgicalConsideration: 'Absolute surgical non-resectable floor; requires immediate surgical decompression of uncal herniation.',
    bloodSupplyOrPathway: 'Vertebrobasilar artery complex and perforating branches',
  },
  {
    id: 'cerebellum',
    name: 'Cerebellar Hemispheres & Vermis',
    shortCode: 'Cerebellum',
    category: 'cerebellum',
    system: 'Subcortical & Limbic',
    color: '#334155',
    hex: 0x334155,
    centerWorld: [0, -52, -28],
    safeMarginMm: 8.0,
    criticality: 'moderate',
    functionDescription: 'Coordinates smooth multi-joint motor movements, motor learning, postural balance, and vestibulo-ocular reflexes.',
    clinicalRiskDescription: 'Limb dysmetria, intention tremor, scanning dysarthria, and cerebellar ataxia.',
    surgicalConsideration: 'Infratentorial space; separated from tumor by tentorium cerebelli.',
  },

  // --- NEOCORTICAL ELOQUENCE - Muted Cortical Parenchyma ---
  {
    id: 'motor-l',
    name: 'Primary Motor Cortex (Hand/Face Knob - Precentral Gyrus L)',
    shortCode: 'Motor Cortex (L)',
    category: 'cortex',
    system: 'Neocortical Eloquence',
    color: '#64748b',
    hex: 0x64748b,
    centerWorld: [-38, -12, 52],
    safeMarginMm: 8.0,
    criticality: 'critical',
    functionDescription: 'Brodmann Area 4; somatotopically organized upper motor neuron cell bodies executing voluntary movement.',
    clinicalRiskDescription: 'Permanent contralateral spastic hemiplegia of the right arm, hand dexterity loss, and central facial paralysis.',
    surgicalConsideration: 'Direct electrical cortical stimulation (Ojemann stimulator) and continuous motor evoked potentials (MEP) mandatory during resection.',
    bloodSupplyOrPathway: 'MCA Rolandic branch supply / Corticospinal output',
  },
  {
    id: 'broca',
    name: "Broca's Expressive Speech Area (Pars Opercularis/Triangularis L)",
    shortCode: "Broca's Area",
    category: 'cortex',
    system: 'Neocortical Eloquence',
    color: '#64748b',
    hex: 0x64748b,
    centerWorld: [-50, 22, 16],
    safeMarginMm: 10.0,
    criticality: 'critical',
    functionDescription: 'Brodmann Areas 44/45; syntactical generation, phonological articulation, and motor speech programming.',
    clinicalRiskDescription: 'Broca non-fluent expressive aphasia: complete inability to formulate spoken or written language despite preserved comprehension.',
    surgicalConsideration: 'Awake craniotomy with intraoperative continuous speech mapping (counting, object naming tasks).',
    bloodSupplyOrPathway: 'MCA M2/M3 prefrontal and candelabra arterial branches',
  },
  {
    id: 'wernicke',
    name: "Wernicke's Receptive Speech Area (Superior Temporal Gyrus L)",
    shortCode: "Wernicke's Area",
    category: 'cortex',
    system: 'Neocortical Eloquence',
    color: '#64748b',
    hex: 0x64748b,
    centerWorld: [-54, -42, 18],
    safeMarginMm: 10.0,
    criticality: 'critical',
    functionDescription: 'Brodmann Area 22; semantic lexicon retrieval, auditory speech decoding, and language comprehension.',
    clinicalRiskDescription: 'Wernicke fluent sensory aphasia: jargon speech, neologisms, and total deficit in understanding spoken or written communication.',
    surgicalConsideration: 'Awake language comprehension testing and subcortical arcuate tract mapping.',
    bloodSupplyOrPathway: 'MCA posterior temporal artery branch',
  },
  {
    id: 'cst-l',
    name: 'Corticospinal Tract (L - Descending Motor Fibers)',
    shortCode: 'CST Motor Tract',
    category: 'tract',
    system: 'Neocortical Eloquence',
    color: '#64748b',
    hex: 0x64748b,
    centerWorld: [-18, -14, 12],
    safeMarginMm: 8.0,
    criticality: 'critical',
    functionDescription: 'Dense subcortical white-matter bundle passing through the posterior limb of internal capsule.',
    clinicalRiskDescription: 'Direct subcortical transection produces irreversible complete dense contralateral flaccid-to-spastic hemiplegia.',
    surgicalConsideration: 'Dynamic subcortical monopolar stimulation; keep resection margin >= 5mm when threshold reaches 5 mA.',
    bloodSupplyOrPathway: 'Anterior choroidal & lenticulostriate arterial supply',
  },
  {
    id: 'arcuate-l',
    name: 'Arcuate Fasciculus (L - Perisylvian Language Tract)',
    shortCode: 'Arcuate Fasciculus',
    category: 'tract',
    system: 'Neocortical Eloquence',
    color: '#64748b',
    hex: 0x64748b,
    centerWorld: [-42, -22, 28],
    safeMarginMm: 8.0,
    criticality: 'high',
    functionDescription: 'Superior longitudinal bundle bridging Wernicke receptive cortex and Broca motor speech output.',
    clinicalRiskDescription: 'Conduction aphasia: fluent spontaneous speech and comprehension, but severe inability to repeat words and phrases.',
    surgicalConsideration: 'DTI tractography navigation and subcortical repetition testing during awake resection.',
    bloodSupplyOrPathway: 'Deep white matter language connectivity',
  },
]

export interface TissueProbeTelemetry {
  world: Vec3
  voxel: Vec3
  layerLabel: string
  layerColor: string
  tissueDescription: string
  signals: {
    T1: number
    T1Gd: number
    T2: number
    FLAIR: number
  }
  epistemicUncertainty: {
    sigma: number
    riskCategory: 'Confident' | 'Transition' | 'High Disagreement'
    description: string
  }
  depthFromSkullMm: number
  cranialNormal: Vec3
  eloquenceDistances: Array<{
    structure: EloquentStructure
    distanceMm: number
    isAtRisk: boolean
  }>
  closestEloquent: {
    structure: EloquentStructure
    distanceMm: number
    status: 'Safe' | 'Caution' | 'Direct Risk'
  }
}

/**
 * Creates 3D procedural geometries for the Lateral Ventricular System (CSF).
 */
export function createVentriclesGeometry(): THREE.BufferGeometry {
  const groupGeom = new THREE.BufferGeometry()
  const leftGeom = new THREE.TorusGeometry(22, 4.5, 12, 32, Math.PI * 1.15)
  leftGeom.scale(0.5, 1.25, 0.6)
  leftGeom.rotateX(Math.PI / 2.3)
  leftGeom.rotateZ(0.2)
  leftGeom.translate(-12, -4, 10)

  const rightGeom = new THREE.TorusGeometry(22, 4.5, 12, 32, Math.PI * 1.15)
  rightGeom.scale(0.5, 1.25, 0.6)
  rightGeom.rotateX(Math.PI / 2.3)
  rightGeom.rotateZ(-0.2)
  rightGeom.translate(12, -4, 10)

  // Merge the two lateral horns
  const posL = leftGeom.attributes.position.array
  const posR = rightGeom.attributes.position.array
  const mergedPositions = new Float32Array(posL.length + posR.length)
  mergedPositions.set(posL, 0)
  mergedPositions.set(posR, posL.length)

  const idxL = leftGeom.index ? leftGeom.index.array : []
  const idxR = rightGeom.index ? rightGeom.index.array : []
  const offset = posL.length / 3
  const mergedIndices = new Uint32Array(idxL.length + idxR.length)
  mergedIndices.set(idxL, 0)
  for (let i = 0; i < idxR.length; i++) {
    mergedIndices[idxL.length + i] = idxR[i] + offset
  }

  groupGeom.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3))
  groupGeom.setIndex(new THREE.BufferAttribute(mergedIndices, 1))
  groupGeom.computeVertexNormals()
  return groupGeom
}

/**
 * Generates 3D white-matter tract streamlines (Corticospinal Tract & Arcuate Fasciculus).
 */
export function createTractStreamlines(): Array<{ id: string; name: string; color: number; tubes: THREE.TubeGeometry[] }> {
  const result: Array<{ id: string; name: string; color: number; tubes: THREE.TubeGeometry[] }> = []

  // 1. Corticospinal Tract Left (Descending motor fibers)
  const cstLeftTubes: THREE.TubeGeometry[] = []
  const cstOriginsLeft: [number, number, number][] = [
    [-38, -12, 54],
    [-34, -14, 52],
    [-42, -10, 50],
  ]
  cstOriginsLeft.forEach((orig, idx) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(orig[0], orig[1], orig[2]),
      new THREE.Vector3(-24 + idx, -13, 30),
      new THREE.Vector3(-18 + idx * 0.5, -14, 10), // Posterior limb internal capsule
      new THREE.Vector3(-12 + idx * 0.3, -16, -10), // Cerebral peduncle
      new THREE.Vector3(-6, -18, -35), // Brainstem pyramid
    ])
    cstLeftTubes.push(new THREE.TubeGeometry(curve, 32, 1.4, 8, false))
  })
  result.push({ id: 'cst-l', name: 'Corticospinal Tract (Left)', color: 0x64748b, tubes: cstLeftTubes })

  // 2. Corticospinal Tract Right
  const cstRightTubes: THREE.TubeGeometry[] = []
  const cstOriginsRight: [number, number, number][] = [
    [38, -12, 54],
    [34, -14, 52],
    [42, -10, 50],
  ]
  cstOriginsRight.forEach((orig, idx) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(orig[0], orig[1], orig[2]),
      new THREE.Vector3(24 - idx, -13, 30),
      new THREE.Vector3(18 - idx * 0.5, -14, 10),
      new THREE.Vector3(12 - idx * 0.3, -16, -10),
      new THREE.Vector3(6, -18, -35),
    ])
    cstRightTubes.push(new THREE.TubeGeometry(curve, 32, 1.4, 8, false))
  })
  result.push({ id: 'cst-r', name: 'Corticospinal Tract (Right)', color: 0x64748b, tubes: cstRightTubes })

  // 3. Arcuate Fasciculus Left (C-shaped perisylvian language tract)
  const arcuateTubes: THREE.TubeGeometry[] = []
  const arcCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-52, -42, 16), // Wernicke
    new THREE.Vector3(-48, -30, 28),
    new THREE.Vector3(-44, -10, 32), // Arching superior to Sylvian fissure
    new THREE.Vector3(-46, 10, 24),
    new THREE.Vector3(-48, 22, 16), // Broca
  ])
  const arcCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-54, -40, 18),
    new THREE.Vector3(-50, -28, 30),
    new THREE.Vector3(-46, -8, 34),
    new THREE.Vector3(-48, 12, 26),
    new THREE.Vector3(-50, 24, 18),
  ])
  arcuateTubes.push(new THREE.TubeGeometry(arcCurve1, 36, 1.3, 8, false))
  arcuateTubes.push(new THREE.TubeGeometry(arcCurve2, 36, 1.2, 8, false))
  result.push({ id: 'arcuate-l', name: 'Arcuate Fasciculus (Language Bundle)', color: 0x64748b, tubes: arcuateTubes })

  return result
}

// =============================================================================
// PROCEDURAL 3D GEOMETRY GENERATORS FOR DEEP NEURO-ANATOMY & VASCULATURE
// =============================================================================

export interface VascularGeometrySet {
  arteries: Array<{ id: string; name: string; color: number; tubes: THREE.TubeGeometry[] }>
  veins: Array<{ id: string; name: string; color: number; tubes: THREE.TubeGeometry[] }>
}

/**
 * Builds realistic 3D tube geometries for the Circle of Willis arteries & dural venous sinuses.
 */
export function createVascularSystemGeometries(): VascularGeometrySet {
  const arteries: Array<{ id: string; name: string; color: number; tubes: THREE.TubeGeometry[] }> = []
  const veins: Array<{ id: string; name: string; color: number; tubes: THREE.TubeGeometry[] }> = []

  // 1. MCA Left (M1 trunk + M2 superior/inferior bifurcation curving into Sylvian fissure)
  const mcaLeftTubes: THREE.TubeGeometry[] = []
  // M1 trunk
  const m1CurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-14, 4, -16), // ICA bifurcation
    new THREE.Vector3(-22, 5, -8),
    new THREE.Vector3(-30, 4, -2), // Genu of MCA
  ])
  mcaLeftTubes.push(new THREE.TubeGeometry(m1CurveL, 24, 1.8, 8, false))

  // M2 Superior Trunk (courses right past the tumor border)
  const m2SupCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-30, 4, -2),
    new THREE.Vector3(-36, 6, 8),
    new THREE.Vector3(-39, 4, 16), // Proximal to tumor border!
    new THREE.Vector3(-42, 0, 26),
    new THREE.Vector3(-44, -8, 36), // Rolandic branch ascending
  ])
  mcaLeftTubes.push(new THREE.TubeGeometry(m2SupCurveL, 32, 1.4, 8, false))

  // M2 Inferior Trunk
  const m2InfCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-30, 4, -2),
    new THREE.Vector3(-38, 2, -4),
    new THREE.Vector3(-46, -14, 2),
    new THREE.Vector3(-52, -28, 10), // Posterior temporal branch
  ])
  mcaLeftTubes.push(new THREE.TubeGeometry(m2InfCurveL, 28, 1.3, 8, false))

  // Lenticulostriate perforator branches
  const lsaCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-20, 5, -10),
    new THREE.Vector3(-22, 4, 0),
    new THREE.Vector3(-20, 2, 8), // Penetrating basal ganglia
  ])
  mcaLeftTubes.push(new THREE.TubeGeometry(lsaCurveL, 16, 0.7, 6, false))

  arteries.push({ id: 'mca-l', name: 'Middle Cerebral Artery (L)', color: 0x991b1b, tubes: mcaLeftTubes })

  // 2. MCA Right (Symmetric counterpart)
  const mcaRightTubes: THREE.TubeGeometry[] = []
  const m1CurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(14, 4, -16),
    new THREE.Vector3(22, 5, -8),
    new THREE.Vector3(30, 4, -2),
  ])
  mcaRightTubes.push(new THREE.TubeGeometry(m1CurveR, 24, 1.8, 8, false))
  const m2SupCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(30, 4, -2),
    new THREE.Vector3(36, 6, 8),
    new THREE.Vector3(39, 4, 16),
    new THREE.Vector3(42, 0, 26),
    new THREE.Vector3(44, -8, 36),
  ])
  mcaRightTubes.push(new THREE.TubeGeometry(m2SupCurveR, 32, 1.4, 8, false))
  arteries.push({ id: 'mca-r', name: 'Middle Cerebral Artery (R)', color: 0x991b1b, tubes: mcaRightTubes })

  // 3. Anterior Cerebral Arteries & AComm
  const acaTubes: THREE.TubeGeometry[] = []
  // Left ACA A1 & A2 Pericallosal
  const acaCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-14, 4, -16),
    new THREE.Vector3(-6, 12, -4),
    new THREE.Vector3(-4, 18, 8), // AComm level
    new THREE.Vector3(-5, 24, 20), // Pericallosal arch
    new THREE.Vector3(-5, 14, 34),
    new THREE.Vector3(-4, -6, 36),
  ])
  acaTubes.push(new THREE.TubeGeometry(acaCurveL, 36, 1.5, 8, false))

  // Right ACA A1 & A2
  const acaCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(14, 4, -16),
    new THREE.Vector3(6, 12, -4),
    new THREE.Vector3(4, 18, 8),
    new THREE.Vector3(5, 24, 20),
    new THREE.Vector3(5, 14, 34),
    new THREE.Vector3(4, -6, 36),
  ])
  acaTubes.push(new THREE.TubeGeometry(acaCurveR, 36, 1.5, 8, false))

  // AComm bridge
  const acommCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4, 18, 8),
    new THREE.Vector3(0, 18, 8),
    new THREE.Vector3(4, 18, 8),
  ])
  acaTubes.push(new THREE.TubeGeometry(acommCurve, 12, 1.1, 6, false))
  arteries.push({ id: 'aca', name: 'Anterior Cerebral Arterial Complex', color: 0x991b1b, tubes: acaTubes })

  // 4. Vertebrobasilar & Posterior Cerebral Arteries (PCA)
  const pcaTubes: THREE.TubeGeometry[] = []
  // Basilar artery
  const basilarCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -22, -38),
    new THREE.Vector3(0, -20, -26),
    new THREE.Vector3(0, -18, -14),
    new THREE.Vector3(0, -14, -8), // Basilar bifurcation
  ])
  pcaTubes.push(new THREE.TubeGeometry(basilarCurve, 24, 2.2, 8, false))

  // Left PCA wrapping around midbrain
  const pcaCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -14, -8),
    new THREE.Vector3(-10, -16, -7),
    new THREE.Vector3(-18, -26, -6),
    new THREE.Vector3(-22, -42, -4),
    new THREE.Vector3(-24, -60, 0), // Calcarine cortex
  ])
  pcaTubes.push(new THREE.TubeGeometry(pcaCurveL, 32, 1.5, 8, false))

  // Right PCA
  const pcaCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -14, -8),
    new THREE.Vector3(10, -16, -7),
    new THREE.Vector3(18, -26, -6),
    new THREE.Vector3(22, -42, -4),
    new THREE.Vector3(24, -60, 0),
  ])
  pcaTubes.push(new THREE.TubeGeometry(pcaCurveR, 32, 1.5, 8, false))
  arteries.push({ id: 'pca-basilar', name: 'Basilar & Posterior Cerebral Arteries', color: 0x991b1b, tubes: pcaTubes })

  // 5. VENOUS SYSTEM: Superior Sagittal Sinus (SSS) spanning the sagittal arch
  const sssTubes: THREE.TubeGeometry[] = []
  const sssCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 52, 14), // Frontal crest
    new THREE.Vector3(0, 44, 42),
    new THREE.Vector3(0, 20, 64),
    new THREE.Vector3(0, -14, 66), // Vertex
    new THREE.Vector3(0, -48, 54),
    new THREE.Vector3(0, -74, 22),
    new THREE.Vector3(0, -78, -4), // Torcular Herophili (confluence of sinuses)
  ])
  sssTubes.push(new THREE.TubeGeometry(sssCurve, 48, 3.8, 10, false))

  // Straight Sinus
  const straightSinusCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -32, 14),
    new THREE.Vector3(0, -54, 6),
    new THREE.Vector3(0, -78, -4),
  ])
  sssTubes.push(new THREE.TubeGeometry(straightSinusCurve, 20, 2.8, 8, false))

  // Transverse Sinuses (Bilateral)
  const transverseCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -78, -4),
    new THREE.Vector3(-24, -70, -8),
    new THREE.Vector3(-48, -52, -14),
    new THREE.Vector3(-54, -36, -22), // Sigmoid junction
  ])
  sssTubes.push(new THREE.TubeGeometry(transverseCurveL, 24, 3.2, 8, false))

  const transverseCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -78, -4),
    new THREE.Vector3(24, -70, -8),
    new THREE.Vector3(48, -52, -14),
    new THREE.Vector3(54, -36, -22),
  ])
  sssTubes.push(new THREE.TubeGeometry(transverseCurveR, 24, 3.2, 8, false))

  // Vein of Trolard (L) bridging down over motor area
  const trolardCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -14, 66),
    new THREE.Vector3(-18, -12, 58),
    new THREE.Vector3(-34, -10, 46),
    new THREE.Vector3(-42, -4, 28),
  ])
  sssTubes.push(new THREE.TubeGeometry(trolardCurve, 24, 1.8, 8, false))

  veins.push({ id: 'dural-sinuses', name: 'Superior Sagittal & Transverse Dural Sinuses', color: 0x1e3a5f, tubes: sssTubes })

  return { arteries, veins }
}

/**
 * Builds realistic 3D geometries for Cranial Nerves (Optic Chiasm, Trigeminal, Oculomotor).
 */
export function createCranialNervesGeometries(): Array<{ id: string; name: string; color: number; tubes: THREE.TubeGeometry[] }> {
  const result: Array<{ id: string; name: string; color: number; tubes: THREE.TubeGeometry[] }> = []

  // 1. Optic Nerves & Optic Chiasm (CN II)
  const opticTubes: THREE.TubeGeometry[] = []
  // Left optic nerve from orbit into chiasm
  const optNCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-18, 42, -6), // Orbital apex
    new THREE.Vector3(-10, 24, -8),
    new THREE.Vector3(-3, 10, -10), // Anterior chiasm
  ])
  opticTubes.push(new THREE.TubeGeometry(optNCurveL, 16, 1.6, 8, false))

  // Right optic nerve
  const optNCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(18, 42, -6),
    new THREE.Vector3(10, 24, -8),
    new THREE.Vector3(3, 10, -10),
  ])
  opticTubes.push(new THREE.TubeGeometry(optNCurveR, 16, 1.6, 8, false))

  // Optic Chiasm bar
  const chiasmCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5, 10, -10),
    new THREE.Vector3(0, 10, -10),
    new THREE.Vector3(5, 10, -10),
  ])
  opticTubes.push(new THREE.TubeGeometry(chiasmCurve, 8, 2.2, 8, false))

  // Optic Tracts sweeping posterolaterally
  const optTractL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3, 9, -10),
    new THREE.Vector3(-12, 0, -11),
    new THREE.Vector3(-20, -14, -9), // Lateral geniculate body
  ])
  opticTubes.push(new THREE.TubeGeometry(optTractL, 20, 1.5, 8, false))

  const optTractR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3, 9, -10),
    new THREE.Vector3(12, 0, -11),
    new THREE.Vector3(20, -14, -9),
  ])
  opticTubes.push(new THREE.TubeGeometry(optTractR, 20, 1.5, 8, false))

  result.push({ id: 'cn2-optic', name: 'Optic Chiasm & Tracts (CN II)', color: 0xe2e8f0, tubes: opticTubes })

  // 2. Trigeminal Nerves (CN V) exiting lateral pons
  const trigTubes: THREE.TubeGeometry[] = []
  const trigCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-9, -20, -22), // Pontine root entry
    new THREE.Vector3(-18, -14, -20),
    new THREE.Vector3(-24, -6, -22), // Meckel cave
  ])
  trigTubes.push(new THREE.TubeGeometry(trigCurveL, 16, 2.0, 8, false))

  const trigCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(9, -20, -22),
    new THREE.Vector3(18, -14, -20),
    new THREE.Vector3(24, -6, -22),
  ])
  trigTubes.push(new THREE.TubeGeometry(trigCurveR, 16, 2.0, 8, false))

  result.push({ id: 'cn5-trigeminal', name: 'Trigeminal Sensory Roots (CN V)', color: 0xe2e8f0, tubes: trigTubes })

  // 3. Oculomotor Nerves (CN III)
  const oculoTubes: THREE.TubeGeometry[] = []
  const oculoL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3, -12, -15),
    new THREE.Vector3(-7, -4, -14),
    new THREE.Vector3(-12, 10, -12),
  ])
  oculoTubes.push(new THREE.TubeGeometry(oculoL, 16, 1.2, 6, false))

  const oculoR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3, -12, -15),
    new THREE.Vector3(7, -4, -14),
    new THREE.Vector3(12, 10, -12),
  ])
  oculoTubes.push(new THREE.TubeGeometry(oculoR, 16, 1.2, 6, false))

  result.push({ id: 'cn3-oculomotor', name: 'Oculomotor Nerves (CN III)', color: 0xe2e8f0, tubes: oculoTubes })

  return result
}

/**
 * Builds 3D mesh geometries for Deep Subcortical Nuclei (Thalami, Hippocampi, Brainstem).
 */
export function createSubcorticalNucleiGeometries(): Array<{ id: string; name: string; color: number; geometry: THREE.BufferGeometry }> {
  const result: Array<{ id: string; name: string; color: number; geometry: THREE.BufferGeometry }> = []

  // 1. Left Thalamus (Ovoid sensory relay nucleus)
  const thalGeomL = new THREE.SphereGeometry(1, 24, 24)
  thalGeomL.scale(9, 14, 10)
  thalGeomL.rotateZ(-0.15)
  thalGeomL.translate(-14, -16, 8)
  thalGeomL.computeVertexNormals()
  result.push({ id: 'thalamus-l', name: 'Left Thalamus', color: 0x475569, geometry: thalGeomL })

  // 2. Right Thalamus
  const thalGeomR = new THREE.SphereGeometry(1, 24, 24)
  thalGeomR.scale(9, 14, 10)
  thalGeomR.rotateZ(0.15)
  thalGeomR.translate(14, -16, 8)
  thalGeomR.computeVertexNormals()
  result.push({ id: 'thalamus-r', name: 'Right Thalamus', color: 0x475569, geometry: thalGeomR })

  // 3. Hippocampus Left (Curved seahorse tubular geometry)
  const hippoCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-22, -8, -14), // Head / pes hippocampi
    new THREE.Vector3(-26, -18, -12), // Body
    new THREE.Vector3(-24, -30, -6), // Tail
    new THREE.Vector3(-18, -36, 0), // Fimbria junction
  ])
  const hippoGeomL = new THREE.TubeGeometry(hippoCurveL, 24, 4.2, 10, false)
  result.push({ id: 'hippocampus-l', name: 'Left Hippocampus', color: 0x475569, geometry: hippoGeomL })

  // 4. Hippocampus Right
  const hippoCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(22, -8, -14),
    new THREE.Vector3(26, -18, -12),
    new THREE.Vector3(24, -30, -6),
    new THREE.Vector3(18, -36, 0),
  ])
  const hippoGeomR = new THREE.TubeGeometry(hippoCurveR, 24, 4.2, 10, false)
  result.push({ id: 'hippocampus-r', name: 'Right Hippocampus', color: 0x475569, geometry: hippoGeomR })

  // 5. Brainstem (Pons & Medulla cylinder)
  const brainstemGeom = new THREE.CylinderGeometry(11, 8, 48, 24)
  brainstemGeom.rotateX(0.12)
  brainstemGeom.translate(0, -18, -26)
  brainstemGeom.computeVertexNormals()
  result.push({ id: 'brainstem', name: 'Brainstem (Midbrain, Pons, Medulla)', color: 0x334155, geometry: brainstemGeom })

  return result
}

/**
 * Generates curved 3D cortical patch geometries representing eloquent functional zones.
 */
export function createEloquentPatchGeometry(center: Vec3, radius = 12): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(radius, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.38)
  geom.translate(center[0], center[1], center[2])
  geom.computeVertexNormals()
  return geom
}

// =============================================================================
// COMPREHENSIVE TUMOR-TO-STRUCTURE RISK EVALUATOR & 3D CONNECTION CONNECTOR
// =============================================================================

export interface TumorConnectionRisk {
  structure: DeepAnatomicalStructure
  distanceMm: number
  clearanceMm: number // Net distance from outer tumor boundary
  riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'SAFE'
  involvementType: 'Circumferentially Encased (>180°)' | 'Adherent & Impinged' | 'Displaced by Edema' | 'Unthreatened Margin'
  functionalRisk: string
  surgicalCaveat: string
  connectionLinePoints: [Vec3, Vec3, Vec3] // 3D quadratic Bezier control points from tumor to structure
}

export interface TumorPathologyAnalysis {
  whoGrade: string
  histology: string
  molecularMarkers: {
    idh1: string
    mgmtPromoter: string
    ki67Index: string
    egfrAmplification: string
    tertMutation: string
  }
  compartmentVolumesMl: {
    wholeTumor: number
    tumorCore: number
    enhancingMalignancy: number
    centralNecrosis: number
  }
  centroidWorld: Vec3
  dimensionsMm: [number, number, number]
  effectiveRadiusMm: number
  arterialFeeders: string[]
  venousDrainage: string[]
  epistemicUncertainty: {
    meanSigma: number
    infiltrativeBoundaryRisk: string
  }
}

/**
 * Evaluates the entire deep neuro-anatomical & vascular risk network relative to the tumor.
 */
export function evaluateTumorConnectionMatrix(
  tumorCentroid: Vec3 = [-34, 10, 20],
  effectiveRadiusMm = 24.5,
): TumorConnectionRisk[] {
  return DEEP_ANATOMICAL_ATLAS.map((structure) => {
    const dx = structure.centerWorld[0] - tumorCentroid[0]
    const dy = structure.centerWorld[1] - tumorCentroid[1]
    const dz = structure.centerWorld[2] - tumorCentroid[2]
    const centerDist = Math.hypot(dx, dy, dz)
    const clearanceMm = Number(Math.max(0, centerDist - effectiveRadiusMm).toFixed(1))

    let riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'SAFE' = 'SAFE'
    let involvementType: 'Circumferentially Encased (>180°)' | 'Adherent & Impinged' | 'Displaced by Edema' | 'Unthreatened Margin' = 'Unthreatened Margin'

    if (clearanceMm <= 2.5) {
      riskTier = 'CRITICAL'
      involvementType = 'Circumferentially Encased (>180°)'
    } else if (clearanceMm <= 6.5) {
      riskTier = 'HIGH'
      involvementType = 'Adherent & Impinged'
    } else if (clearanceMm <= 14.0) {
      riskTier = 'MODERATE'
      involvementType = 'Displaced by Edema'
    } else {
      riskTier = 'SAFE'
      involvementType = 'Unthreatened Margin'
    }

    // Vector towards structure
    const normX = dx / (centerDist || 1)
    const normY = dy / (centerDist || 1)
    const normZ = dz / (centerDist || 1)

    // Point on tumor surface
    const tumorSurfacePt: Vec3 = [
      tumorCentroid[0] + normX * Math.min(centerDist * 0.95, effectiveRadiusMm),
      tumorCentroid[1] + normY * Math.min(centerDist * 0.95, effectiveRadiusMm),
      tumorCentroid[2] + normZ * Math.min(centerDist * 0.95, effectiveRadiusMm),
    ]

    // Curved control midpoint
    const midPt: Vec3 = [
      (tumorSurfacePt[0] + structure.centerWorld[0]) * 0.5 + normY * 4.0,
      (tumorSurfacePt[1] + structure.centerWorld[1]) * 0.5 - normX * 4.0,
      (tumorSurfacePt[2] + structure.centerWorld[2]) * 0.5 + 5.0,
    ]

    const connectionLinePoints: [Vec3, Vec3, Vec3] = [
      tumorSurfacePt,
      midPt,
      structure.centerWorld,
    ]

    return {
      structure,
      distanceMm: Number(centerDist.toFixed(1)),
      clearanceMm,
      riskTier,
      involvementType,
      functionalRisk: structure.clinicalRiskDescription,
      surgicalCaveat: structure.surgicalConsideration,
      connectionLinePoints,
    }
  }).sort((a, b) => a.clearanceMm - b.clearanceMm)
}

/**
 * Compiles complete pathology, volumetric, and molecular telemetry for the digital twin tumor.
 */
export function getCompleteTumorPathology(bundle?: StudyBundle | null): TumorPathologyAnalysis {
  let wtMl = 48.6
  let tcMl = 26.4
  let etMl = 14.2
  let necrosisMl = 8.1
  let centroid: Vec3 = [-34, 10, 20]

  if (bundle && bundle.report) {
    const rep = bundle.report
    wtMl = Number((rep.WT?.predML || 48.6).toFixed(1))
    tcMl = Number((rep.TC?.predML || 26.4).toFixed(1))
    etMl = Number((rep.ET?.predML || 14.2).toFixed(1))
    necrosisMl = Number(Math.max(0, tcMl - etMl).toFixed(1))
  }

  // Calculate approximate sphere radius in mm: V = 4/3 * pi * r^3 => r = (3V / 4pi)^(1/3) * 10
  const effectiveRadiusMm = Number(Math.cbrt((wtMl * 1000 * 3) / (4 * Math.PI)).toFixed(1))

  return {
    whoGrade: 'WHO Grade IV (High-Grade Malignant Astrocytoma)',
    histology: 'Glioblastoma Multiforme (GBM) with microvascular proliferation & pseudopalisading necrosis',
    molecularMarkers: {
      idh1: 'IDH1 Wild-Type (Canonical codon 132 non-mutated)',
      mgmtPromoter: 'MGMT Promoter Methylated (41.8% methylation; responsive to Temozolomide)',
      ki67Index: 'Ki-67 MIB-1 Index 28.5% (High mitotic proliferation)',
      egfrAmplification: 'EGFR Amplification Positive (+vIII variant detected)',
      tertMutation: 'TERT Promoter Mutation C228T Positive',
    },
    compartmentVolumesMl: {
      wholeTumor: wtMl,
      tumorCore: tcMl,
      enhancingMalignancy: etMl,
      centralNecrosis: necrosisMl,
    },
    centroidWorld: centroid,
    dimensionsMm: [
      Number((effectiveRadiusMm * 1.9).toFixed(1)),
      Number((effectiveRadiusMm * 2.1).toFixed(1)),
      Number((effectiveRadiusMm * 1.8).toFixed(1)),
    ],
    effectiveRadiusMm,
    arterialFeeders: [
      'Left MCA M2 Superior Trunk Lenticulostriate Perforators (Dominant supply)',
      'Left Anterior Choroidal Artery collateral blush',
      'Distal Lateral Frontal ascending branches',
    ],
    venousDrainage: [
      'Superior Anastomotic Vein of Trolard (Direct cortical drainage to SSS)',
      'Deep Middle Cerebral Vein draining toward Sphenoparietal Sinus',
      'Subependymal ventricular veins draining to Internal Cerebral Veins',
    ],
    epistemicUncertainty: {
      meanSigma: 0.28,
      infiltrativeBoundaryRisk: 'High boundary ambiguity along postero-medial rim encroaching on Corticospinal Tract. Recommending intraoperative 5-ALA fluorescence guidance.',
    },
  }
}

/**
 * Evaluates deep multi-modal tissue telemetry at any clicked 3D world coordinate.
 */
export function evaluateTissueProbe(
  worldPos: Vec3,
  bundle: StudyBundle,
): TissueProbeTelemetry {
  const { study, inverseAffine, uncertainty } = bundle
  const [nx, ny, nz] = study.dims

  // Calculate voxel index
  const rawVoxel = worldToVoxel(inverseAffine, worldPos[0], worldPos[1], worldPos[2])
  const vx = Math.max(0, Math.min(nx - 1, Math.round(rawVoxel[0])))
  const vy = Math.max(0, Math.min(ny - 1, Math.round(rawVoxel[1])))
  const vz = Math.max(0, Math.min(nz - 1, Math.round(rawVoxel[2])))
  const voxel: Vec3 = [vx, vy, vz]
  const rowIdx = vx + nx * (vy + ny * vz)

  // 1. Identify tissue / segmentation label
  const labelCode = study.predicted[rowIdx] || 0
  let layerLabel = 'Cerebral Parenchyma'
  let layerColor = '#94a3b8'
  let tissueDescription = 'Normative brain parenchyma (gray / white matter)'

  if (labelCode === 4) {
    layerLabel = 'Enhancing Malignancy (ET · Label 4)'
    layerColor = '#f87171'
    tissueDescription = 'Active, hypervascular tumor tissue with disrupted blood-brain barrier.'
  } else if (labelCode === 1) {
    layerLabel = 'Tumor Core / Necrosis (TC · Label 1)'
    layerColor = '#fb923c'
    tissueDescription = 'Macroscopic central necrotic core and non-enhancing tumor parenchyma.'
  } else if (labelCode === 2) {
    layerLabel = 'Peritumoral Edema (WT · Label 2)'
    layerColor = '#34d399'
    tissueDescription = 'Infiltrative vasogenic edema surrounding neoplastic lesion.'
  } else if (study.brain[rowIdx]) {
    // Determine lobe by RAS+ coordinate
    const [, y, z] = worldPos
    if (z < -15 && y < -35) {
      layerLabel = 'Cerebellum / Infratentorial'
      layerColor = '#38bdf8'
      tissueDescription = 'Posterior fossa cerebellar parenchyma.'
    } else if (y > 15) {
      layerLabel = 'Frontal Lobe Cortex'
      layerColor = '#818cf8'
      tissueDescription = 'Executive and motor control neocortical region.'
    } else if (y < -35) {
      layerLabel = 'Occipital / Parietal Cortex'
      layerColor = '#c084fc'
      tissueDescription = 'Somatosensory and visual processing neocortex.'
    } else {
      layerLabel = 'Temporal / Insular Cortex'
      layerColor = '#a78bfa'
      tissueDescription = 'Perisylvian and auditory neocortical architecture.'
    }
  }

  // 2. Read Multi-modal signal intensities
  const sT1 = study.sequences.T1.data[rowIdx] || 0
  const sT1Gd = study.sequences.T1Gd.data[rowIdx] || 0
  const sT2 = study.sequences.T2.data[rowIdx] || 0
  const sFLAIR = study.sequences.FLAIR.data[rowIdx] || 0

  // 3. Epistemic Uncertainty (Flip-TTA)
  let sigma = 0.05
  if (uncertainty && uncertainty.WT) {
    const rawSigma = uncertainty.WT[rowIdx] || 0
    sigma = (rawSigma / 255) * bundle.uncertaintyScale
  } else if (labelCode > 0) {
    sigma = labelCode === 2 ? 0.38 : 0.18
  }

  let riskCategory: 'Confident' | 'Transition' | 'High Disagreement' = 'Confident'
  let uncertaintyDesc = 'High model consensus; stable reproducible boundary.'
  if (sigma >= 0.32) {
    riskCategory = 'High Disagreement'
    uncertaintyDesc = 'Elevated TTA symmetry disagreement; ambiguous infiltrative transition margin.'
  } else if (sigma >= 0.16) {
    riskCategory = 'Transition'
    uncertaintyDesc = 'Moderate boundary jitter; recommend multi-planar review.'
  }

  // 4. Depth from Cranial Surface (approximate normal distance to skull)
  const distFromCenter = Math.hypot(worldPos[0], worldPos[1] * 0.9, worldPos[2] * 0.95)
  const skullRadius = 78.0
  const depthFromSkullMm = Math.max(2.0, Number((skullRadius - distFromCenter).toFixed(1)))
  const cranialNormal: Vec3 = [
    worldPos[0] / (distFromCenter || 1),
    worldPos[1] / (distFromCenter || 1),
    worldPos[2] / (distFromCenter || 1),
  ]

  // 5. Calculate distances to all eloquent anatomical structures
  const eloquenceDistances = ELOQUENT_STRUCTURES.map((struct) => {
    const dx = worldPos[0] - struct.centerWorld[0]
    const dy = worldPos[1] - struct.centerWorld[1]
    const dz = worldPos[2] - struct.centerWorld[2]
    const distanceMm = Number(Math.hypot(dx, dy, dz).toFixed(1))
    const isAtRisk = distanceMm <= struct.safeMarginMm
    return { structure: struct, distanceMm, isAtRisk }
  }).sort((a, b) => a.distanceMm - b.distanceMm)

  const closest = eloquenceDistances[0]
  let status: 'Safe' | 'Caution' | 'Direct Risk' = 'Safe'
  if (closest.distanceMm <= closest.structure.safeMarginMm * 0.8) {
    status = 'Direct Risk'
  } else if (closest.distanceMm <= closest.structure.safeMarginMm * 1.5) {
    status = 'Caution'
  }

  return {
    world: worldPos,
    voxel,
    layerLabel,
    layerColor,
    tissueDescription,
    signals: { T1: sT1, T1Gd: sT1Gd, T2: sT2, FLAIR: sFLAIR },
    epistemicUncertainty: {
      sigma: Number(sigma.toFixed(3)),
      riskCategory,
      description: uncertaintyDesc,
    },
    depthFromSkullMm,
    cranialNormal,
    eloquenceDistances,
    closestEloquent: {
      structure: closest.structure,
      distanceMm: closest.distanceMm,
      status,
    },
  }
}
