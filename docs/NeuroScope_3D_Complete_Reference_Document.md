# NeuroScope 3D — Complete Project Reference Document

**Project Code:** DI-02 · Health-tech · 3D Medical Image Segmentation + Web Visualisation  
**Scope:** Research & Teaching Prototype  
**Date:** October 2026  

> ⚡ **Quick Navigation:** [**➔ Jump to Consolidated Math, Formulas & Decision-Making Glossary (Formulas, Variables & 1-Line Reasoning)**](#comprehensive-math-formulas--decision-making-glossary)

---

## Table of Contents

- [**Comprehensive Math, Formulas & Decision-Making Glossary**](#comprehensive-math-formulas--decision-making-glossary)
  - [Segment 1: Volumetric & Spatial Geometry Formulas](#segment-1-volumetric--spatial-geometry-formulas)
  - [Segment 2: Clinical Region Partitioning & Set Theory (BraTS)](#segment-2-clinical-region-partitioning--set-theory-brats)
  - [Segment 3: Input Validation & Pre-flight Gatekeeper Formulas](#segment-3-input-validation--pre-flight-gatekeeper-formulas)
  - [Segment 4: Segmentation Performance & Spatial Error Metrics](#segment-4-segmentation-performance--spatial-error-metrics)
  - [Segment 5: Uncertainty Quantification & Calibration Formulas](#segment-5-uncertainty-quantification--calibration-formulas)
  - [Segment 6: DICOM Ingestion & Spatial Affine Math](#segment-6-dicom-ingestion--spatial-affine-math)
  - [Segment 7: Neurosurgical 3D Clipping Planes & Shader Math](#segment-7-neurosurgical-3d-clipping-planes--shader-math)
  - [Segment 8: Queue Scheduling & Runtime Metric Formulas](#segment-8-queue-scheduling--runtime-metric-formulas)
1. [Executive Summary](#1-executive-summary)
2. [The Problem Statement](#2-the-problem-statement)
3. [The Three-Layer Approach](#3-the-three-layer-approach)
4. [Competitive Landscape & Differentiation](#4-competitive-landscape--differentiation)
5. [System Architecture](#5-system-architecture)
6. [Technology Stack](#6-technology-stack)
7. [Complete Feature Inventory](#7-complete-feature-inventory)
8. [Data Flow Architecture](#8-data-flow-architecture)
9. [Inference Pipeline — Stage by Stage](#9-inference-pipeline--stage-by-stage)
10. [The Segmentation Model — Technical Deep Dive](#10-the-segmentation-model--technical-deep-dive)
11. [Uncertainty Estimation — How It Works](#11-uncertainty-estimation--how-it-works)
12. [API Surface Reference](#12-api-surface-reference)
13. [Frontend Architecture](#13-frontend-architecture)
14. [Backend Pipeline Architecture](#14-backend-pipeline-architecture)
15. [Multi-Workspace Navigation System](#15-multi-workspace-navigation-system)
16. [Tool Copilot (AI Assistant)](#16-tool-copilot-ai-assistant)
17. [Reporting & Provenance System](#17-reporting--provenance-system)
18. [Security, Privacy & Resource Guards](#18-security-privacy--resource-guards)
19. [Testing & Verification Framework](#19-testing--verification-framework)
20: [Deployment Architecture](#20-deployment-architecture)
21. [Repository Layout](#21-repository-layout)
22. [Known Limitations & Future Roadmap](#22-known-limitations--future-roadmap)
23. [Glossary of Key Terms](#23-glossary-of-key-terms)

---

## Comprehensive Math, Formulas & Decision-Making Glossary

> **Architectural Philosophy:** NeuroScope 3D avoids black-box calculations. Every volumetric measurement, clinical threshold, spatial transformation, and quality score is computed deterministically, exposed through the API, and verified against ground truth or physical bounds. Below is the segmented formula index pairing exact mathematical definitions with **concise, one-line rationales**.

---

### Segment 1: Volumetric & Spatial Geometry Formulas

| Metric & Symbol | Mathematical Formula | Variables & Units | One-Line Essential Reasoning / Justification |
|---|---|---|---|
| **Physical Volume** ($V$) | $$V = \frac{N_{\text{voxels}} \cdot (\Delta x \cdot \Delta y \cdot \Delta z)}{1000}$$ | $N$: active voxel count;<br>$\Delta x, \Delta y, \Delta z$: spacing in mm | Evaluated directly on the original acquisition grid without interpolation bias; $1000\text{ mm}^3 = 1\text{ mL}$. |
| **Brain Volume Fraction** ($F_{\text{brain}}$) | $$F_{\text{brain}} = \frac{V_{\text{region}}}{V_{\text{brain}}} \times 100\%$$ | $V_{\text{region}}$: lesion volume (mL);<br>$V_{\text{brain}}$: intracranial parenchyma (mL) | Normalizes tumor burden against total intracranial volume to quantify anatomical mass effect. |
| **26-Connected Mass Volume** ($V_i$) | $$V_i = \frac{c_i \cdot (\Delta x \cdot \Delta y \cdot \Delta z)}{1000}$$ | $c_i$: voxel count in $i$-th cluster;<br>Neighborhood: 26-connectivity | Diagonal adjacency across anisotropic slices prevents artificial splitting of contiguous anatomical masses. |
| **Dominant Mass Share** ($S_{\text{dom}}$) | $$S_{\text{dom}} = \frac{\max(c_i)}{\sum_{k=1}^n c_k} \times 100\%$$ | $c_i$: voxel count of cluster $i \in [1, n]$ | Instantly separates solitary unifocal lesions from multifocal disease or satellite micrometastases. |
| **Maximum 3D Diameter** ($D_{\max}$) | $$D_{\max} = \max_{u, v \in \mathcal{H}} \|\mathbf{p}_u - \mathbf{p}_v\|_2$$ | $\mathcal{H}$: 3D convex hull vertices;<br>$\mathbf{p}_i = \mathbf{x}_i \odot \boldsymbol{\Delta}$ in world mm | Computes exact caliper distance over convex hull vertices in $O(V_{\text{hull}}^2)$ with zero approximation; logs endpoints for validation. |
| **Boundary Surface Area** ($S$) | $$S = \sum_{a \in \{x,y,z\}} N_{\text{faces}, a} \cdot A_a$$ | $N_{\text{faces}, a}$: exposed boundary faces;<br>$A_x = \Delta y \Delta z$ in $\text{mm}^2$ | Evaluates exposed voxel faces per axis independently to preserve geometric fidelity under anisotropic slice thicknesses. |
| **Patient-Space Centroid** ($\mathbf{C}_{\text{world}}$) | $$\mathbf{C}_{\text{world}} = \mathbf{A}_{3\times3} \cdot \left(\frac{1}{N} \sum_{i=1}^N \mathbf{x}_i\right) + \mathbf{t}$$ | $\mathbf{x}_i$: 3D voxel index;<br>$\mathbf{A}$: rotational affine; $\mathbf{t}$: origin | Projects lesion center-of-mass into true patient anatomical space (RAS+) for unambiguous hemispheric side localization. |
| **Physical Bounding Box** ($\mathbf{E}$) | $$\mathbf{E} = (\max(\mathbf{x}) - \min(\mathbf{x}) + 1) \odot \boldsymbol{\Delta}$$ | $\mathbf{x}$: coordinates of active voxels;<br>$\boldsymbol{\Delta} = (\Delta x, \Delta y, \Delta z)$ in mm | Measures orthogonal span (Width $\times$ Depth $\times$ Height in mm) for rapid surgical field and craniotomy clearance checks. |

---

### Segment 2: Clinical Region Partitioning & Set Theory (BraTS)

| Clinical Region | Set-Theoretic Formula | Raw BraTS Label Membership | One-Line Essential Reasoning / Justification |
|---|---|---|---|
| **Whole Tumor** ($\mathbf{WT}$) | $$\mathbf{WT} = \text{NCR} \cup \text{ED} \cup \text{ET}$$ | Label 1 (Necrotic) $\cup$ 2 (Edema) $\cup$ 4 (Enhancing) | Encompasses the entire abnormal parenchymal footprint, including vasogenic edema, for radiation target volumes. |
| **Tumor Core** ($\mathbf{TC}$) | $$\mathbf{TC} = \text{NCR} \cup \text{ET}$$ | Label 1 (Necrotic Core) $\cup$ Label 4 (Enhancing) | Isolates bulk macroscopic tumor tissue slated for surgical resection, excluding non-neoplastic vasogenic edema. |
| **Enhancing Tumor** ($\mathbf{ET}$) | $$\mathbf{ET} = \text{ET}$$ | Label 4 (Active Gadolinium Enhancement) | Pinpoints viable, hyper-vascularized malignancy exhibiting blood-brain barrier disruption for targeted adjuvant therapy. |
| **Biological Hierarchy** | $$\mathbf{ET} \subseteq \mathbf{TC} \subseteq \mathbf{WT}$$ | Outer-to-inner assignment overwrite rule | Eliminates physically impossible states (e.g. enhancing rim appearing outside edema) through enforced nesting logic. |

---

### Segment 3: Input Validation & Pre-flight Gatekeeper Formulas

| Gatekeeper Rule | Mathematical Condition | Threshold Bounds | One-Line Essential Reasoning / Justification |
|---|---|---|---|
| **Affine Invertibility** | $$|\det(\mathbf{A}_{3\times3})| > \epsilon$$ | $\epsilon = 10^{-6}$ | Prevents matrix inversion crashes and ensures the scan represents a non-degenerate 3D physical volume. |
| **Cross-Sequence Spatial Match** | $$\max_{i,j} \|\mathbf{A}_i - \mathbf{A}_j\|_\infty \le \delta_A \quad \wedge \quad \max_{i,j} \|\mathbf{t}_i - \mathbf{t}_j\|_\infty \le \delta_t$$ | $\delta_A = 10^{-3}$,<br>$\delta_t = 0.1\text{ mm}$ | Verifies all 4 MRI sequences are co-registered and occupy the exact same physical frame before 4-channel tensor assembly. |
| **Physical FOV Limit** | $$\max_{a \in \{x,y,z\}} (N_a \cdot \Delta_a) \le L_{\max}$$ | $L_{\max} = 500\text{ mm}$ | Catches unit metadata corruption (e.g., coordinates recorded in meters or micrometers rather than millimeters). |
| **Edge Occupancy Heuristic** | $$\frac{1}{|\partial V|} \sum_{\mathbf{x} \in \partial V} \mathbb{I}(I(\mathbf{x}) > 0.1 \cdot I_{\max}) < \theta_{\text{edge}}$$ | $\theta_{\text{edge}} = 0.05$ (5%) | Identifies unstripped or cropped scans where brain tissue spills into the FOV border, invalidating downstream models. |
| **Intensity Sanity Check** | $$\sigma(I) > 10^{-4} \quad \wedge \quad \max(I) > \min(I) \quad \wedge \quad \text{NaN}(I) = 0$$ | Standard deviation, range & nulls | Instantly rejects blank scout views, flat zero-volumes, and corrupted floating-point streams before neural inference. |
| **Payload Size Guard** | $$\text{TransferBytes} \le \text{MaxCap}$$ | $\text{MaxCap} = 1\text{ GB} = 10^9\text{ bytes}$ | Drops oversized HTTP payloads prior to memory ingestion to protect server workers from decompression bombs. |

---

### Segment 4: Segmentation Performance & Spatial Error Metrics

| Evaluation Metric | Mathematical Formula | Handling of Empty Masks ($0/0$) | One-Line Essential Reasoning / Justification |
|---|---|---|---|
| **Sørensen–Dice Index** | $$\text{Dice}(P, T) = \frac{2 |P \cap T|}{|P| + |T|}$$ | Awards $1.0$ if $|P| + |T| = 0$ | Standard volumetric overlap metric; explicitly avoids division-by-zero by rewarding correct prediction of true absence. |
| **Sensitivity (Recall)** | $$\text{Sens}(P, T) = \frac{|P \cap T|}{|T|}$$ | Awards $1.0$ if $|T| = 0$ | Quantifies false-negative under-segmentation; critical in neuro-oncology where missed infiltrative tumor is dangerous. |
| **Precision (PPV)** | $$\text{Prec}(P, T) = \frac{|P \cap T|}{|P|}$$ | Awards $1.0$ if $|P| = 0$ | Measures false-positive over-segmentation to verify healthy functional brain parenchyma is not falsely flagged. |
| **95th-Percentile Hausdorff Distance** | $$\text{HD95} = \max\left( \mathcal{P}_{95}\left(\min_{t \in \partial T} d_w(p, t)\right), \mathcal{P}_{95}\left(\min_{p \in \partial P} d_w(t, p)\right) \right)$$ | Returns `null` if $P=\emptyset$ or $T=\emptyset$ | Physical boundary disagreement in mm; 95th percentile clips spurious outlier voxels while avoiding undefined empty bounds. |
| **Spatial Error Overlay** | $$\text{TP} = P \cap T \quad \text{(Green)}, \quad \text{FP} = P \setminus T \quad \text{(Amber)}, \quad \text{FN} = T \setminus P \quad \text{(Red)}$$ | Voxel-wise boolean decomposition | Spatially unpacks scalar Dice scores into intuitive clinical error classes directly across multi-planar slice views. |
| **Largest Miss Centroid** | $$\mathbf{x}_{\text{miss}} = \text{centroid}\left(\arg\max_{c \in \text{CC}(T \setminus P)} \text{Volume}(c)\right)$$ | Navigation target coordinate | Flies the slice crosshairs directly to the center of the largest anatomical region the model missed with one click. |

---

### Segment 5: Uncertainty Quantification & Calibration Formulas

| Uncertainty Metric | Mathematical Formula | Variables & Range | One-Line Essential Reasoning / Justification |
|---|---|---|---|
| **Flip-TTA Voxel Uncertainty** ($\sigma$) | $$\sigma(\mathbf{x}) = \sqrt{ \frac{1}{K} \sum_{k=1}^K \left(p_k(\mathbf{x}) - \bar{p}(\mathbf{x})\right)^2 }$$ | $K=2$ (unflipped + LR-flipped);<br>$\sigma \in [0, 0.5]$ | Captures epistemic instability under anatomical mirror reflection; elevated $\sigma$ reliably highlights ambiguous infiltrating margins. |
| **Ensemble Mean Probability** ($\bar{p}$) | $$\bar{p}(\mathbf{x}) = \frac{1}{2} \left( p_{\text{orig}}(\mathbf{x}) + p_{\text{unflip}}(\mathbf{x}) \right) \ge 0.5$$ | Calibrated consensus threshold | Symmetrically averages predictions across hemispheres, canceling unilateral directional bias and boundary jitter. |
| **Calibration Correlation** ($r$) | $$r = \frac{\sum (\sigma_i - \bar{\sigma})(e_i - \bar{e})}{\sqrt{\sum (\sigma_i - \bar{\sigma})^2 \sum (e_i - \bar{e})^2}} \quad \text{where } e_i = |p_i - t_i|$$ | Pooled Pearson $r$ over $1.3\times 10^6$ voxels | Empirically proves flip-TTA uncertainty correlates with actual clinical error (measured $r = 0.3463$ across 10 held-out cases). |

---

### Segment 6: DICOM Ingestion & Spatial Affine Math

| Transformation Step | Matrix / Vector Formula | DICOM Metadata Tags | One-Line Essential Reasoning / Justification |
|---|---|---|---|
| **Slice Normal Vector** ($\mathbf{n}$) | $$\mathbf{n} = \mathbf{F}_{\text{row}} \times \mathbf{F}_{\text{col}}$$ | `(0020,0037)` `ImageOrientationPatient` | Establishes the true normal vector of the 2D scan plane relative to the 3D patient coordinate system. |
| **Slice Axial Ordering Distance** ($s$) | $$s_k = \mathbf{r}_k \cdot \mathbf{n}$$ | `(0020,0032)` `ImagePositionPatient` | Projects each slice's origin along the normal vector, establishing correct monotonic anatomical stacking independent of filename. |
| **Calculated Slice Spacing** ($\Delta z$) | $$\Delta z = \text{median}_{k} |s_{k+1} - s_k|$$ | Successive slice distance differences | Deduces physical z-spacing directly from slice positions, avoiding reliance on frequently erroneous nominal thickness tags. |
| **LPS to RAS Conversion** | $$\mathbf{A}_{\text{RAS}} = \operatorname{diag}(-1, -1, 1, 1) \cdot \mathbf{A}_{\text{LPS}}$$ | 4x4 coordinate affine transformation | Converts clinical DICOM patient space (Left-Posterior-Superior) to neuroimaging standard space (Right-Anterior-Superior). |

---

### Segment 7: Neurosurgical 3D Clipping Planes & Shader Math

| Visualization Operation | GPU Shader Formula | Parameters & Coordinates | One-Line Essential Reasoning / Justification |
|---|---|---|---|
| **Signed Distance Function** ($d$) | $$d(\mathbf{x}) = \mathbf{n}_{\text{plane}} \cdot (\mathbf{x} - \mathbf{p}_{\text{plane}})$$ | $\mathbf{n}_{\text{plane}} \in \{(\pm 1,0,0), (0,\pm 1,0), (0,0,\pm 1)\}$;<br>$\mathbf{p}_{\text{plane}}$: plane offset in mm | Discards shader fragments where $d(\mathbf{x}) < 0$ in real time, revealing deep subcortical tumor cores without destroying 3D spatial context. |

---

### Segment 8: Queue Scheduling & Runtime Metric Formulas

| Scheduling & Telemetry Metric | Operational Formula | Input Parameters | One-Line Essential Reasoning / Justification |
|---|---|---|---|
| **FIFO Wait Time Estimate** | $$\text{ETA} = (\text{Position}_{\text{queue}} + 1) \times \text{P50}_{\text{runtime}}$$ | Queue rank index;<br>$\text{P50}_{\text{runtime}} \approx 37\text{s}$ | Computes accurate wait-time estimates from observed rolling median CPU execution times rather than static arbitrary timers. |
| **Inference Latency Percentiles** | $$\text{P50} = \text{Rank}_{\lceil 0.50 N \rceil}, \quad \text{P95} = \text{Rank}_{\lceil 0.95 N \rceil}$$ | Sorted execution durations ($N \ge 1$) | Proves platform reliability and tail-latency adherence against the competition's 120-second execution budget. |

---

## 1. Executive Summary

**NeuroScope 3D** is a web-based platform that takes four MRI sequences of a brain (T1, T1Gd, T2, FLAIR), segments a suspected brain tumour into three nested BraTS regions (Whole Tumour, Tumour Core, Enhancing Tumour), renders it as an interactive 3D digital twin with linked multi-planar slice views, measures it precisely, and — crucially — tells the user **how far to trust** the AI's result.

### Core Thesis

> *A 3D viewer alone isn't new — 3D Slicer exists. A 3D viewer that visibly shows its own uncertainty, rejects bad input loudly, and explains every number is the whitespace nothing else in the landscape fills.*

### Key Metrics at a Glance

| Metric | Value |
|---|---|
| Judge Pipeline Tests | **17/17 passing** |
| Real-Data Dice (WT / TC / ET) | **0.88 / 0.87 / 0.79** |
| HD95 (mm) — WT / TC / ET | 8.43 / 5.53 / 5.71 |
| Inference Time (CPU-only) | ~60–75 seconds per case |
| PS Time Budget (T4 GPU) | 120 seconds |
| Cloud API Calls | **Zero** — fully local processing |
| Uncertainty Calibration (Pearson) | 0.3463 (σ vs. real disagreement) |
| Pytest Suite | 48 tests |
| Guardrail Adversarial Tests | 28/29 passing |

---

## 2. The Problem Statement

### The Clinical Challenge

A brain MRI study for suspected glioma is not one image — it is **four separate 3D sequences**, each containing roughly 155 slices, for a total of **~620 flat images per case**. Each sequence reveals different tissue characteristics:

| Sequence | What It Reveals | Clinical Role |
|---|---|---|
| **T1 (native)** | Baseline anatomy and structural boundaries | Reference anatomy |
| **T1Gd (post-contrast)** | Active, growing tumour cells that absorb contrast agent | Identifies enhancing tumour |
| **T2-weighted** | Structural context around the lesion | Shows tissue water content |
| **FLAIR** | Swelling and fluid build-up (oedema) around the tumour | Delineates peritumoral oedema |

### Three Unanswered Questions

A trainee must hold all four sequences in their head simultaneously and scroll through all of them to answer three deceptively simple questions:

1. **Is it one connected mass or several?**
2. **Which side of the brain is it on, and what is it near?**
3. **What is its exact volume in millilitres?**

### Why Existing AI Overlays Don't Solve This

Segmentation models that colour in the suspected tumour on a 2D slice have existed for years (BraTS challenge has run since 2012). However:

- A 2D overlay is only a **cross-section of a 3D guess** — it doesn't show how far the tumour extends through 154 other slices
- A plausible-looking mask is **not evidence of an accurate one**
- No existing tool combines a trained BraTS model with a browser-based 3D viewer, transparent volumetric math, AND visible model uncertainty in one product

### BraTS Region Definitions

The BraTS benchmark defines three tissue codes that combine into three **nested** evaluation regions:

| Region | Built From | Clinical Meaning |
|---|---|---|
| **Whole Tumour (WT)** | NCR + ED + ET | Full extent of abnormal signal, including swelling |
| **Tumour Core (TC)** | NCR + ET | Solid tumour mass, excluding surrounding oedema |
| **Enhancing Tumour (ET)** | ET only | Actively growing, contrast-enhancing component |

**Nesting relationship:** ET ⊆ TC ⊆ WT — this nesting is enforced in code during inference.

---

## 3. The Three-Layer Approach

Every design decision in NeuroScope 3D follows a three-layer framing:

### Layer 1 — Image Interpretation
**Goal:** Navigate the scan, understand where the abnormal region sits.  
**Status:** ✅ Done  
- Linked MPR (multi-planar reconstruction) + 3D digital twin
- One shared crosshair across all views
- Voxel + world-mm coordinate display
- L/R, A/P, S/I orientation labels derived from scan's own affine

### Layer 2 — AI Segmentation
**Goal:** Predict which voxels belong to WT/TC/ET.  
**Status:** ✅ Done & Independently Verified  
- Real MONAI SegResNet checkpoint, sha256-pinned
- 17/17 judge pipeline tests pass
- Standalone CLI (`predict.py`) + live web pipeline share identical code

### Layer 3 — Verification & Trust (THE DIFFERENTIATOR)
**Goal:** Explain size/location, measure agreement with expert labels, disclose model limitations.  
**Status:** ✅ Done  
- Flip-TTA uncertainty (measured, not guessed)
- Connected-component analysis
- Transparent volumetric formulas
- Fail-safe all-or-nothing validation
- Full provenance tracking
- Agreement overlay with "largest miss → go" navigation

> **Key Insight:** NeuroScope 3D is positioned as a **Layer 3 tool** — the one almost nothing else in the landscape addresses — built on solid implementations of Layers 1 and 2. The 3D mesh and linked slice views are necessary infrastructure, not the pitch.

---

## 4. Competitive Landscape & Differentiation

### What Already Exists

| Category | Examples | What They Do | What They Don't Combine |
|---|---|---|---|
| **Open-source viewers** | 3D Slicer, NiiVue, OHIF | Mature 3D + MPR rendering | No built-in AI inference, no uncertainty, no provenance report |
| **Commercial clinical AI** | Brainlab, Quantib, QyScore | FDA/CE-cleared volumetrics | Dice scores live only in regulatory filings; desktop workstation software |
| **Hackathon/research prototypes** | Various | Partial 3D + volume demos | Each builds roughly half the pipeline — never both plus uncertainty and Dice |

### The Whitespace NeuroScope 3D Fills

**No tool found in the landscape review combines:**
1. A trained BraTS model
2. A polished browser-based 3D + linked-slice viewer
3. Transparent volumetric math
4. Visible model uncertainty

...in one lightweight product. This specific combination is the gap.

---

## 5. System Architecture

NeuroScope 3D is a **three-tier system**, where every tier is independently testable:

```
┌─────────────────────────────────────────────────────────────────┐
│                       BROWSER TIER                              │
│  React 18 + TypeScript + Vite                                   │
│  Three.js (react-three-fiber) · Zustand · Tailwind CSS v4       │
│                                                                 │
│  ┌──────────┐ ┌────────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │ 3D Brain │ │ Linked MPR │ │ Upload/     │ │ Metrics/     │  │
│  │ Twin     │ │ Grid       │ │ Datasets    │ │ Trust Layer  │  │
│  │ (WebGL)  │ │ (Ax/Cor/   │ │ Panel       │ │ (σ, Dice,    │  │
│  │          │ │  Sag views)│ │             │ │  Agreement)  │  │
│  └──────────┘ └────────────┘ └─────────────┘ └──────────────┘  │
│                        ↕ HTTP (localhost)                        │
├─────────────────────────────────────────────────────────────────┤
│                       SERVER TIER                               │
│  FastAPI + uvicorn                                              │
│  Job lifecycle · Live progress · FIFO Queue · CORS (loopback)   │
│                                                                 │
│  /api/v1/segment · /api/v1/jobs/{id}/status · /api/v1/samples  │
│  /api/v1/metrics · /api/v1/assistant · /api/v1/models/status    │
│                        ↕ Python function calls                  │
├─────────────────────────────────────────────────────────────────┤
│                      PIPELINE TIER                              │
│  Pure Python library: backend/neuroscope/                       │
│  No web concerns — independently testable via CLI               │
│                                                                 │
│  validate → resample → segment (TTA) → measure → mesh → report │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ MONAI    │ │ nibabel  │ │ PyTorch  │ │ scipy / numpy     │  │
│  │ SegRes-  │ │ NIfTI    │ │ Tensor   │ │ Connected comps,  │  │
│  │ Net      │ │ I/O      │ │ Compute  │ │ Distance xform    │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **Pipeline is a standalone library** — `backend/neuroscope/` has zero web dependencies; it ships its own CLI (`predict.py`) and judge-scoring harness separately from the web server
2. **Client-minted job IDs** — 32 hex chars, generated in the browser, so polling can start concurrently with upload (the ID exists before the upload finishes)
3. **Single global processing lock** — one study at a time, appropriate for single-workstation deployment; a second study gets queued (not rejected)
4. **Same code path for CLI and web** — `predict.py` is the same tool that powers the live pipeline, so there's no difference between what a judge's script sees and what the web workspace shows

---

## 6. Technology Stack

### Frontend Stack

| Component | Technology | Purpose |
|---|---|---|
| **Framework** | React 18 + TypeScript | UI components and application logic |
| **Build Tool** | Vite 5 | Fast development server and production builds |
| **3D Rendering** | Three.js via `react-three-fiber` | WebGL-based 3D brain digital twin |
| **Post-processing** | `@react-three/postprocessing` | Bloom, vignette effects |
| **State Management** | Zustand 5 | Small, explicit stores (crosshair, regions, study status, workspace) |
| **Styling** | Tailwind CSS v4 | Utility-first CSS framework |
| **Icons** | Lucide React | Consistent iconography |
| **3D Utilities** | `@react-three/drei` | Camera controls, helpers |

### Backend Stack

| Component | Technology | Version | Purpose |
|---|---|---|---|
| **Web Framework** | FastAPI | ≥0.110 | HTTP API, job lifecycle, progress reporting |
| **ASGI Server** | uvicorn | ≥0.29 | Production-ready async server |
| **Deep Learning** | PyTorch | ≥2.0 | Tensor operations, model inference |
| **Medical AI** | MONAI | ≥1.3 | SegResNet model, BraTS bundle, sliding-window inference |
| **Neuroimaging I/O** | nibabel | ≥5.0 | NIfTI file reading/writing |
| **Scientific Computing** | NumPy | ≥1.24 | Array operations |
| **Image Processing** | SciPy | ≥1.10 | Connected components, distance transforms, resampling |
| **DICOM** | pydicom | ≥2.4 | DICOM series parsing and conversion |
| **CLI** | Fire | ≥0.5 | Command-line interface for `predict.py` |
| **HTTP Client** | Requests | ≥2.31 | Decathlon data fetching |
| **Multipart** | python-multipart | ≥0.0.9 | File upload handling |

### AI/ML Model

| Property | Value |
|---|---|
| **Name** | MONAI `brats_mri_segmentation` |
| **Architecture** | SegResNet (3D convolutional encoder-decoder) |
| **Bundle Version** | 0.5.4 |
| **Licence** | Apache-2.0 |
| **Training Data** | BraTS 2018 |
| **Source** | MONAI Model Zoo (Hugging Face) |
| **Integrity** | sha256-verified against pinned `model-lock.json` on every load |

### Optional: Tool Copilot Stack

| Component | Technology | Purpose |
|---|---|---|
| **Local LLM Runtime** | Ollama | Self-hosted LLM inference |
| **Language Model** | llama3.1:8b | Q&A generation |
| **Embedding Model** | nomic-embed-text | Corpus retrieval |

---

## 7. Complete Feature Inventory

### 7.1 — Ingestion & Validation

| Feature | Description | Use Case | Technical Detail |
|---|---|---|---|
| **NIfTI Upload** | Accepts 4 NIfTI sequences (`.nii`/`.nii.gz`) + optional expert mask | Standard research data format | Per-slot file validation, BraTS label codes (1, 2, 4) |
| **DICOM Ingestion** | Upload real DICOM series or zip directly | Hospital PACS workflow integration | Groups by `SeriesInstanceUID`, sorts along slice normal, builds LPS→RAS affine from `ImageOrientationPatient`/`ImagePositionPatient` |
| **Sequence Auto-detection** | Auto-identifies T1/T1Gd/T2/FLAIR | Eliminates manual sequence assignment | From `SeriesDescription` and contrast-bolus tags (DICOM) or filename patterns (NIfTI) |
| **De-identification Check** | Warns if `PatientName` isn't anonymized | Privacy protection | Checked, not assumed — explicit warning, not silent proceeding |
| **Geometry Validation** | Checks shapes, affines, orientation agree | Prevents garbage-in-garbage-out | Affine singularity, FOV bounds, edge-occupancy, skull-strip heuristics |
| **Specific Error Messages** | Names the exact sequence and problem | Actionable rejection, not cryptic failure | Per-validator messages: corrupt, non-3D, NaN, constant, mismatched, etc. |
| **All-or-Nothing Gate** | One bad file = zero output | No degraded partial results | Validation is terminal — nothing downstream runs on a failed study |
| **FIFO Job Queue** | Second upload gets queued, not rejected | Multi-user/sequential use | Capped at 10 waiting; live position + measured-average ETA via `/status` |
| **File Size Guard** | Rejects uploads over 1 GB by `Content-Length` | Memory protection | Checked before streaming a single byte |
| **Pre-flight Inspection** | Fast geometry check without inference | Quick validation before committing to full pipeline | `POST /api/v1/studies/inspect` (~100ms, doesn't hold the processing lock) |

### 7.2 — Live Segmentation

| Feature | Description | Use Case | Technical Detail |
|---|---|---|---|
| **Real Model Inference** | MONAI SegResNet, checkpoint sha256-verified | Clinical-grade brain tumour segmentation | 128³ sliding window, Gaussian blending, overlap 0.5 |
| **Flip-TTA Ensemble** | 2-pass test-time augmentation | More robust predictions + uncertainty signal | Unflipped + one flip axis; mean = prediction, std = uncertainty |
| **Original-Grid Output** | Prediction mapped back to input grid | Preserves scan geometry for downstream use | Nearest-neighbour resampling back to original affine/shape |
| **BraTS Code Output** | Labels at codes 1/2/4 | Standard format compatible with BraTS benchmark | 1=NCR (necrotic core), 2=ED (oedema), 4=ET (enhancing tumour) |
| **Nesting Enforcement** | ET ⊆ TC ⊆ WT enforced in code | Biologically correct region hierarchy | Post-inference logical nesting applied to probability maps |
| **Voxel Count Cap** | Hard limit on resampled grid size | Prevents out-of-memory crashes | `neuroscope/limits.py` — identical for CLI and server |
| **Deterministic Results** | Identical output on repeated runs | Reproducibility (Dice ≥ 0.99 requirement) | Deterministic seeding; measured: Dice 1.00000 on re-runs |
| **CLI + Web** | Same code path for both | Judge scoring and web use identical | `predict.py` wraps the same `neuroscope` functions the server calls |

### 7.3 — 3D & Multi-Planar Visualisation

| Feature | Description | Use Case | Technical Detail |
|---|---|---|---|
| **3D Digital Twin** | Translucent brain shell with nested tumour isosurfaces | Spatial understanding of tumour location/shape | Custom **Surface Nets** extraction (not marching cubes), Laplacian smoothing |
| **WT/TC/ET Isosurfaces** | Independent nested surfaces in world-mm space | Visualize each tumour region separately | Per-region visibility toggle + opacity control |
| **WebGL Rendering** | Native orbit/zoom/pan | Interactive 3D exploration | Three.js via react-three-fiber, bloom + vignette post-processing |
| **Region Click-to-Fly** | Click a region to fly camera to it | Quick navigation to region of interest | Auto-reduces surrounding shells to wireframe mode |
| **Linked MPR Grid** | Axial, coronal, sagittal panels share one crosshair | Standard radiology viewing pattern | Moving crosshair anywhere (including 3D mesh click) updates all views |
| **Orientation Labels** | L/R, A/P, S/I on every panel | Anatomical orientation awareness | Derived live from the scan's own affine, not assumed |
| **Dual Coordinate Display** | Voxel index + world-mm coordinate | Precision measurement | Computed from affine transformation matrix |
| **Comparison Panel** | 4th panel for alternate sequence | Side-by-side sequence comparison | Maintains shared crosshair across all panels |
| **Soft Overlay** | Segmentation as colour wash, not hard outline | Underlying tissue remains visible | Opacity-blended overlay preserving tissue visibility |
| **Model vs. Expert Toggle** | Switch between model prediction and expert mask | Accuracy assessment | Available in 3D mesh, 2D overlay, and metrics bar simultaneously |
| **Cutaway View** | Interactive clipping plane (axial/coronal/sagittal) | See inside the 3D mesh | Adjustable depth; visualization only, no surgical-planning claims |

### 7.4 — Trust Layer (THE DIFFERENTIATOR)

| Feature | Description | Use Case | Technical Detail |
|---|---|---|---|
| **Flip-TTA Uncertainty** | Per-voxel σ from multi-pass ensemble | Know WHERE the model is unsure | Standard deviation across TTA passes; concentrated at tumour boundaries |
| **Uncertainty Heat-map** | Toggleable overlay in slice views | Visual uncertainty inspection | Replaces segmentation wash, not hidden behind it |
| **σ Readout** | Mean/boundary-max σ per region | Quantitative uncertainty per region | Displayed in metrics bar per-region |
| **Honest Caveat** | Explicit disclaimer on every σ display | Prevent over-reliance on uncertainty | "Disagreement under augmentation, not a calibrated probability" |
| **Measured Calibration** | σ vs. real disagreement validated | Evidence that uncertainty is meaningful | Pearson 0.3463 across 1.3M voxels; disagreement rises from 15.7% to ~65% with σ |
| **Connectivity Analysis** | 26-connected-component per region | "Is it one mass or two?" | Component count, per-component volume, largest share |
| **Transparent Volumetrics** | Formula shown inline: count × spacing ÷ 1000 | Auditable measurements | Computed on original acquisition grid, not resampled approximation |
| **Volume Calibration** | Verified against judges' test case | Mathematical correctness | 20×20×20 cube at 1×1×2mm reads exactly 16.0 mL |
| **HD95** | 95th-percentile Hausdorff distance | Boundary accuracy (not just overlap) | Spacing-aware Euclidean distance transform; null when either mask empty |
| **Validation Badge** | Pass/warning status in metrics bar | Quick study quality assessment | Specific warning text on hover |
| **Quality Check Centre** | Itemised report of every validation check | Auditable validation (not just PASS badge) | Floating panel, real-validator-driven |
| **Shape Measurements** | Max 3D diameter + surface area | Tumour characterisation | Diameter via convex hull; definition named on hover |
| **Agreement Overlay** | Green=agree, amber=model-only, red=expert-only | Visual TP/FP/FN spatial assessment | Requires expert mask; colour-coded spatial map |
| **Largest Miss → Go** | Navigate to biggest false negative | Find what the model missed most | Flies crosshair to centre of largest expert-only region; switches to agreement overlay |

### 7.5 — Interrogation Tools

| Feature | Description | Use Case | Technical Detail |
|---|---|---|---|
| **Measure Tool** | Click two points for real mm distance | Physical measurement from scan | Computed from scan's own voxel spacing; keyboard shortcut: `M` |
| **Window/Contrast** | Drag to re-window display | Standard radiology viewing adjustment | Up/down = centre, left/right = width; same as clinical PACS; shortcut: `W` |
| **Keyboard Shortcuts** | Full shortcut set | Power-user efficiency | C=crosshair, M=measure, W=window, O=overlay, E=expert, U=uncertainty, A=agreement, B=brain, ?=help, Esc=exit |
| **Dataset Gallery** | 3 synthetic + real Decathlon cases | Quick demo and teaching cases | Runnable from UI in one click via `/api/v1/samples` |

### 7.6 — Tool Copilot (AI Assistant)

| Feature | Description | Use Case | Technical Detail |
|---|---|---|---|
| **Local Q&A Assistant** | Explains tool's own measurements | Clinician/trainee learning | Local Ollama (llama3.1:8b + nomic-embed-text); nothing leaves the machine |
| **Guard-railed Responses** | 4-layer defense-in-depth | Prevent diagnosis/treatment advice | Input guard → system prompt → structured JSON → post-generation filter |
| **Corpus-Based Retrieval** | ~16 hand-written documents about tool vocabulary | Grounded, relevant answers | Re-embedded once per server process lifetime; cached in memory |
| **Metadata-Only Access** | Only sees pre-computed scalar fields | Data minimization | Explicit allow-list: volumes, Dice, HD95, σ, warnings, model info |
| **Trainee/Clinician Modes** | Toggle for tone and verbosity | Audience-appropriate communication | Same guardrails in both modes; only presentation changes |

### 7.7 — Reporting & Provenance

| Feature | Description | Use Case | Technical Detail |
|---|---|---|---|
| **Printable Report** | HTML report with full results | Documentation and record-keeping | Generated only after study passes validation |
| **Provenance Record** | Model + input + process metadata | Reproducibility and audit trail | Checkpoint sha256, input sha256s, git commit, timestamp, runtime |
| **Case Export Bundle** | One-click zip download | Archive, share, tumour board | Report + metadata JSON + prediction NIfTI |
| **Operational Metrics** | Job-outcome counters + inference timing | Pipeline reliability evidence | P50/P95 inference times; completed/errored/rejected breakdowns |
| **Local-Only Processing** | Zero cloud calls | Data sovereignty | No scan, mask, or derived data ever leaves the machine |
| **Auto-Expiry** | Source uploads deleted immediately; jobs expire in 23h | Data hygiene | Background sweep for expired job directories |

---

## 8. Data Flow Architecture

### End-to-End Data Flow

```
                    USER INPUT
                        │
            ┌───────────┴───────────┐
            │                       │
        NIfTI Files            DICOM Series
        (4 sequences)          (or zip of one)
            │                       │
            │                  ┌────┴────┐
            │                  │ DICOM   │
            │                  │ Parser  │
            │                  │ ┌──────────────────────┐
            │                  │ │• Group by SeriesUID  │
            │                  │ │• Sort by slice normal│
            │                  │ │• Build LPS→RAS affine│
            │                  │ │• Auto-detect sequence│
            │                  │ │• De-ID check         │
            │                  │ └──────────────────────┘
            │                  └────┬────┘
            │                       │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │     VALIDATION        │
            │  (All-or-Nothing)     │
            │ ┌───────────────────┐ │
            │ │ Geometry checks   │ │
            │ │ Affine agreement  │ │
            │ │ Finiteness (NaN)  │ │
            │ │ Shape agreement   │ │
            │ │ FOV bounds        │ │
            │ │ Edge occupancy    │ │
            │ │ Skull-strip check │ │
            │ │ Head-shape check  │ │
            │ └───────────────────┘ │
            │  FAIL → specific msg  │
            │  PASS → continue      │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │     RESAMPLING        │
            │ ┌───────────────────┐ │
            │ │ Reorient → RAS+   │ │
            │ │ Resample → 1mm    │ │
            │ │ isotropic grid    │ │
            │ │ Per-channel z-    │ │
            │ │ score normalise   │ │
            │ └───────────────────┘ │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │    SEGMENTATION       │
            │  (Flip-TTA Ensemble)  │
            │ ┌───────────────────┐ │
            │ │ Pass 1: Original  │──┐
            │ │ (128³ sliding     │  │
            │ │  window, 0.5      │  │  Per-voxel
            │ │  overlap,         │  ├─→ MEAN → Final Prediction
            │ │  Gaussian blend)  │  │  Per-voxel
            │ │ Pass 2: Flipped   │──┘  STD  → Uncertainty (σ)
            │ │ (un-flip result)  │     │
            │ └───────────────────┘     │
            │  Nesting: ET⊆TC⊆WT       │
            └───────────┬──────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │     MEASUREMENT       │
            │ ┌───────────────────┐ │
            │ │ Region volumes    │ │
            │ │ (count × spacing) │ │
            │ │ Dice/sensitivity  │ │
            │ │ HD95 (boundary)   │ │
            │ │ Connected comps   │ │
            │ │ Shape: diameter,  │ │
            │ │ surface area,     │ │
            │ │ centroid, bbox    │ │
            │ │ Agreement map     │ │
            │ └───────────────────┘ │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │      MESHING          │
            │ ┌───────────────────┐ │
            │ │ Resample to       │ │
            │ │ shared display    │ │
            │ │ grid              │ │
            │ │ Export as binary  │ │
            │ │ uint8 payloads    │ │
            │ └───────────────────┘ │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │     REPORTING         │
            │ ┌───────────────────┐ │
            │ │ Provenance record │ │
            │ │ HTML report       │ │
            │ │ NIfTI on original │ │
            │ │ grid (for judge)  │ │
            │ │ Metadata JSON     │ │
            │ └───────────────────┘ │
            └───────────┬───────────┘
                        │
               ┌────────┴────────┐
               │                 │
          To Browser        To CLI/Judge
          (binary volumes,  (NIfTI +
           metadata JSON)    report JSON)
```

### Browser ↔ Server Data Flow

```
Browser                                    FastAPI Server
  │                                              │
  │──── POST /api/v1/segment/{job} ────────────→│  (Upload 4 files + optional expert mask)
  │     (multipart/form-data)                    │
  │                                              │── Validate → Resample → Segment
  │←─── GET /api/v1/jobs/{job}/status ──────────│     → Measure → Mesh → Report
  │     (polling every ~400ms)                   │
  │     {"stage": "segmenting", ...}             │
  │                                              │
  │←─── GET /api/v1/jobs/{job}/metadata ────────│  (Full results JSON)
  │←─── GET /api/v1/jobs/{job}/volume/{seq} ────│  (Binary uint8 volume)
  │←─── GET /api/v1/jobs/{job}/labels ──────────│  (Binary predicted labels)
  │←─── GET /api/v1/jobs/{job}/uncertainty/wt ──│  (Binary σ volume)
  │                                              │
  │──── buildLiveStudy.ts ──────────────────────│  (Assembles render-ready bundle)
  │     (fetches all binary payloads)            │
  │                                              │
  │──── Same rendering pipeline as demo phantom──│  (No separate code path)
```

---

## 9. Inference Pipeline — Stage by Stage

A single study moves through **seven explicit, independently testable stages**. Each reports its status to the browser in real time, and a failure at Validate is **terminal** — nothing downstream ever runs.

### Stage 1: Validate
- **What:** Geometry, orientation, finiteness, affine/shape agreement across sequences, skull-strip and head-shape heuristics
- **Time:** ~1 second
- **Key detail:** All-or-nothing — zero partial results
- **Module:** `neuroscope/validate.py`

### Stage 2: Resample
- **What:** Reorient to closest-canonical RAS+, resample to isotropic 1mm working grid
- **Time:** ~2–5 seconds
- **Key detail:** Per-channel z-score normalisation over non-zero (in-brain) voxels
- **Module:** `neuroscope/nifti_io.py`

### Stage 3: Segment
- **What:** Flip-TTA ensemble inference through the verified SegResNet checkpoint
- **Time:** ~37 seconds per pass (the slow step)
- **Key detail:** 128³ sliding window, Gaussian blending, overlap 0.5; 2 passes for TTA
- **Module:** `neuroscope/infer.py`

### Stage 4: Measure
- **What:** Region volumes, Dice/sensitivity vs. expert mask, 26-connected-component analysis, shape geometry
- **Time:** ~1–2 seconds
- **Key detail:** All measurements on original acquisition grid
- **Module:** `neuroscope/regions.py`

### Stage 5: Mesh
- **What:** Resample sequences, labels, and uncertainty onto one shared display grid; export as binary payloads
- **Time:** ~2–3 seconds
- **Key detail:** Custom Surface Nets extraction, not marching cubes
- **Module:** Uses `neuroscope/nifti_io.py` + server payload assembly

### Stage 6: Report
- **What:** Provenance record assembled, printable HTML report written, original-grid NIfTI saved
- **Time:** ~1 second
- **Key detail:** The NIfTI and provenance JSON are what automated judge scorers read
- **Module:** `neuroscope/provenance.py`, server report generator

### End-to-End Timing

| Metric | Value |
|---|---|
| Single inference pass | ~37 seconds |
| Full pipeline (2-pass TTA) | ~60–75 seconds |
| PS budget (T4 GPU) | 120 seconds |
| Environment | CPU-only (no GPU in dev) |

---

## 10. The Segmentation Model — Technical Deep Dive

### Architecture: SegResNet

SegResNet is a **3D convolutional encoder-decoder** architecture designed specifically for volumetric medical image segmentation:

- **Encoder:** Series of residual blocks with downsampling, extracting features at multiple spatial resolutions
- **Decoder:** Symmetric upsampling path with skip connections from the encoder
- **3D convolutions:** Operates on full volumetric data, not slice-by-slice

### Input/Output Contract

| Aspect | Specification |
|---|---|
| **Input Channels** | 4 (T1Gd → T1 → T2 → FLAIR — **not alphabetical!**) |
| **Input Resolution** | 1mm isotropic (resampled from original) |
| **Preprocessing** | Reorient to RAS+; z-score per channel over non-zero voxels |
| **Inference Window** | 128³ sliding window |
| **Window Overlap** | 0.5 (50%) |
| **Blending** | Gaussian (smooth transition between windows) |
| **Output Channels** | 3 (TC, WT, ET) with sigmoid activation |
| **Threshold** | 0.5 |
| **Nesting** | ET ⊆ TC ⊆ WT enforced post-inference |
| **Export Codes** | 1 (NCR), 2 (ED), 4 (ET) |
| **Grid** | Written back to **original** input grid via nearest-neighbour resampling |

### Model Integrity

```
setup_model.py downloads checkpoint
        │
        ▼
sha256 hash computed
        │
        ▼
Compared against pinned model-lock.json
        │
    ┌───┴───┐
    │       │
  MATCH   MISMATCH
    │       │
  Load    REFUSE
  model   (no silent
           corruption)
```

### Performance (Measured)

| Metric | Synthetic Case | Real Data (10 cases) |
|---|---|---|
| Dice — WT | 0.961 | **0.8808** |
| Dice — TC | 0.921 | **0.8697** |
| Dice — ET | 0.952 | **0.7885** |
| Sensitivity — WT | — | 0.8460 |
| Sensitivity — TC | — | 0.8505 |
| Sensitivity — ET | — | 0.7617 |
| HD95 (mm) — WT | — | 8.43 |
| HD95 (mm) — TC | — | 5.53 |
| HD95 (mm) — ET | — | 5.71 |
| Reproducibility (Dice) | 1.00000 | — |

---

## 11. Uncertainty Estimation — How It Works

### Method: Flip-Based Test-Time Augmentation (TTA)

Rather than a single forward pass, inference runs as a small flip-based ensemble:

```
Input Volume (RAS+ oriented, 1mm isotropic)
        │
        ├──→ Pass 1: Unflipped volume → Network → Probability Map A
        │
        └──→ Pass 2: Flip along one axis → Network → Un-flip result → Probability Map B
                                                                          │
                                                                          │
        Per-voxel MEAN(A, B) ────→ Final prediction (more robust)         │
        Per-voxel STD(A, B)  ────→ Uncertainty signal (σ)                 │
```

### What σ Means (and Doesn't Mean)

| Property | Value |
|---|---|
| **Is:** | A measured disagreement signal between two differently-augmented views |
| **Is Not:** | A calibrated probability of correctness |
| **Concentrates at:** | Tumour boundaries, where model self-consistency breaks down |
| **Works without:** | An expert mask (the common case) |

### Measured Calibration

Tested across all 10 held-out cases (1,297,798 WT-union voxels):

| σ Bin | Disagreement Rate |
|---|---|
| 0.00–0.10 (low σ) | 15.7% |
| 0.10–0.20 | 54.5% |
| 0.20–0.50 (high σ) | ~65% |
| **Pooled Pearson** | **0.3463** |

**Interpretation:** There is a real, positive, moderate correlation between σ and actual prediction error. The uncertainty signal is informative but not a guarantee — exactly the "useful but honestly caveated" framing the UI uses.

### Why Not Full Monte-Carlo Dropout or a Large Ensemble?

Published findings show naive uncertainty signals in medical segmentation can correlate **only weakly** with true boundary error. The platform deliberately uses a cheap, honestly-caveated signal rather than implying more confidence than the method can support. This is a design decision, not a limitation to fix.

---

## 12. API Surface Reference

All routes are versioned under `/api/v1/`. Internal API with one consumer (the project's own frontend).

### Core Pipeline Endpoints

| Method | Endpoint | Purpose | Response |
|---|---|---|---|
| `GET` | `/api/v1/health` | Server health check | Model checkpoint status (real vs. heuristic fallback) |
| `POST` | `/api/v1/segment/{job}` | Upload 4 sequences + optional expert mask, run full pipeline | Synchronous processing with live status updates |
| `GET` | `/api/v1/jobs/{job}/status` | Current pipeline stage | `{"stage": "segmenting", ...}` — polled every ~400ms |
| `GET` | `/api/v1/jobs/{job}/metadata` | Full provenance + results JSON | Complete measurement and provenance record |

### Data Retrieval Endpoints

| Method | Endpoint | Purpose | Response |
|---|---|---|---|
| `GET` | `/api/v1/jobs/{job}/volume/{seq}` | Binary uint8 volume for one sequence | On shared display grid |
| `GET` | `/api/v1/jobs/{job}/labels` | Binary predicted label volume | BraTS codes 1/2/4 |
| `GET` | `/api/v1/jobs/{job}/uncertainty/{region}` | Binary flip-TTA σ volume (WT/TC/ET) | Per-voxel standard deviation |
| `GET` | `/api/v1/jobs/{job}/expert-labels` | Binary expert mask volume | If supplied at upload |
| `GET` | `/api/v1/jobs/{job}/prediction` | Predicted label map as NIfTI | On **original** input grid |

### Reporting & Export Endpoints

| Method | Endpoint | Purpose | Response |
|---|---|---|---|
| `GET` | `/api/v1/jobs/{job}/report` | Printable HTML provenance report | Full HTML document |
| `GET` | `/api/v1/jobs/{job}/export` | One-click case bundle | Zip: report + metadata JSON + prediction NIfTI |
| `GET` | `/api/v1/metrics` | Operational statistics | Job-outcome counters, inference-time P50/P95 |

### Model & Sample Endpoints

| Method | Endpoint | Purpose | Response |
|---|---|---|---|
| `GET` | `/api/v1/models/status` | Which model is loaded + checkpoint hash | Model provenance info |
| `GET` | `/api/v1/samples` | List curated demo cases | 3 synthetic + real Decathlon cases |
| `POST` | `/api/v1/studies/inspect` | Fast pre-flight geometry check | ~100ms, no processing lock held |
| `POST` | `/api/v1/studies/inspect-dicom` | DICOM pre-flight | Series geometry, auto-detected sequences, de-ID status |

### Assistant Endpoints

| Method | Endpoint | Purpose | Response |
|---|---|---|---|
| `GET` | `/api/v1/assistant/health` | Ollama reachability + model status | Health check for copilot availability |
| `POST` | `/api/v1/assistant/chat` | Ask the tool copilot a question | Guardrailed JSON response with answer + cited fields + caveat |

### Error Handling

All failures raise structured `ApiError(status, code, message)`, normalized into one consistent envelope:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "T2 sequence has non-finite values (NaN detected)",
  "status": 422
}
```

Clients branch on `code` instead of parsing prose.

---

## 13. Frontend Architecture

### Component Hierarchy

```
App.tsx
├── TopBar.tsx                           Top navigation bar
├── DisclaimerBanner.tsx                 Research/teaching prototype notice
├── UploadPanel.tsx                      4-sequence upload with live progress
├── DatasetsPanel.tsx                    Curated case gallery
├── HelpPanel.tsx                        Workspace guide + vocabulary
├── AssistantPanel.tsx                   AI copilot chat interface
│
├── NavigationSidebar.tsx                Multi-workspace nav
│
└── [Active Workspace]
    ├── LandingWorkspace.tsx             Welcome/onboarding
    ├── CommandCentreWorkspace.tsx       Session overview dashboard
    ├── ViewerWorkspace.tsx              Main 3D + MPR workspace
    │   ├── ThreeBrainTwin.tsx           3D viewport (brain shell + tumour meshes)
    │   ├── LinkedMprGrid.tsx            2×2 linked slice views + toolbar
    │   │   └── MprPanel.tsx             Individual axial/coronal/sagittal panel
    │   └── BottomMetricsBar.tsx         Volumes, Dice, connectivity, uncertainty
    ├── ReviewWorkspace.tsx              Segmentation review
    ├── ResearchLabWorkspace.tsx         Cohort tables, model comparisons
    ├── TrustExplainabilityWorkspace.tsx Uncertainty calibration, provenance
    ├── PatientWorkspace.tsx             Patient companion view
    ├── NeuroLearnWorkspace.tsx          Interactive teaching content
    └── ResearchGraphWorkspace.tsx       Research visualization

    └── BottomActivityStrip.tsx          Status bar + panel toggles
```

### State Management (Zustand Stores)

| Store | File | Responsibility |
|---|---|---|
| **Main Store** | `state/store.ts` | Crosshair position, region visibility/opacity, active sequence, mask source, panel open states |
| **Study Provider** | `state/study.tsx` | Builds render-ready bundle (demo phantom or live study); same pipeline for both |
| **Live Study** | `state/liveStudy.ts` | Upload progress, poll/status for active jobs |
| **Workspace Store** | `state/workspaceStore.ts` | Active workspace, workspace-specific state, navigation |

### Key Library Modules

| Module | File | Purpose |
|---|---|---|
| **Surface Nets** | `lib/surfaceNets.ts` | Custom isosurface extraction with Laplacian smoothing — not a third-party black box |
| **Meshing** | `lib/meshing.ts` | Mesh generation orchestration |
| **Volume Math** | `lib/volume.ts` | Affine math: voxel↔world coordinate conversion, axis orientation, sampling |
| **API Client** | `lib/api.ts` | Typed client for all FastAPI endpoints |
| **Sequence Detect** | `lib/sequenceDetect.ts` | Auto-detect T1/T1Gd/T2/FLAIR from filenames |
| **Keyboard Shortcuts** | `lib/useShortcuts.ts` | Global keyboard shortcut handling (suppressed during text input) |
| **Live Study Builder** | `lib/buildLiveStudy.ts` | Fetches completed job's binary payloads → same rendering pipeline as demo |
| **Demo Phantom** | `lib/phantom.ts` | Procedurally generated synthetic brain for zero-setup demo |

### Critical Design Pattern: One Code Path

The same rendering pipeline handles **both** the procedural demo phantom **and** real server-produced data. `buildLiveStudy.ts` fetches a completed job's binary payload and drops it into the exact same rendering pipeline — no separate "real" vs. "demo" code path.

---

## 14. Backend Pipeline Architecture

### Module Reference Table

| Module | File | Role | Dependencies |
|---|---|---|---|
| **NIfTI I/O** | `neuroscope/nifti_io.py` | Read/write NIfTI; keeps input grid + affine authoritative | nibabel |
| **Validation** | `neuroscope/validate.py` | All-or-nothing fail-safe gate | nibabel, numpy |
| **Inference** | `neuroscope/infer.py` | Flip-TTA ensemble, sha256 verification, deterministic seeding | PyTorch, MONAI |
| **Regions** | `neuroscope/regions.py` | BraTS codes → WT/TC/ET; volumes, Dice, sensitivity, HD95, connectivity, geometry, agreement | scipy, numpy |
| **Provenance** | `neuroscope/provenance.py` | File hashing (sha256), git commit identification | hashlib |
| **Limits** | `neuroscope/limits.py` | Resource budgets (voxel caps) — identical for CLI and server | — |
| **Model Base** | `neuroscope/model_base.py` | Formal `Protocol` for model adapters | typing |
| **Config** | `neuroscope/config.py` | Single `Settings` object for all tunables | — |
| **DICOM I/O** | `neuroscope/dicom_io.py` | DICOM → NIfTI conversion with verified affine | pydicom, nibabel |
| **Assistant** | `neuroscope/assistant.py` | Local tool copilot with guardrails | requests (Ollama) |
| **Corpus** | `neuroscope/assistant_corpus.py` | ~16 hand-written documents about tool vocabulary | — |

### Server Module (`backend/server/`)

| File | Role |
|---|---|
| `main.py` | FastAPI application — all API endpoints, job lifecycle, queue management, progress tracking, CORS, error handling |
| `viewer.py` | Report HTML generation |

### CLI Tools

| Tool | File | Purpose |
|---|---|---|
| **Predict** | `predict.py` | CLI entry point for judge scoring |
| **Evaluate** | `evaluate.py` | Dice/sensitivity/HD95 over a BraTS-style folder tree |
| **Calibration** | `calibration_check.py` | Measures σ vs. real disagreement correlation |
| **Test Generator** | `make_testcase.py` | Generates synthetic judge test pack |
| **Test Runner** | `run_judge_tests.py` | Runs judge pack, reports PASS/FAIL |
| **Model Setup** | `setup_model.py` | Downloads + sha256-verifies MONAI checkpoint |
| **Guardrail Tests** | `run_assistant_guardrail_tests.py` | Adversarial prompt pack for copilot |

### Data Tools

| Tool | File | Purpose |
|---|---|---|
| **Fetch Decathlon** | `tools/fetch_decathlon_sample.py` | Downloads specific cases using HTTP Range requests (~99 MB vs 7.6 GB) |
| **Convert Decathlon** | `tools/convert_decathlon.py` | Splits 4D → 4× 3D, remaps label codes to BraTS |
| **Demo Gallery** | `tools/make_demo_gallery.py` | Generates curated synthetic demo cases |

---

## 15. Multi-Workspace Navigation System

The platform provides **nine specialised workspaces**, each serving a different user persona or workflow stage:

| Workspace | Key | Primary Purpose | Data Source |
|---|---|---|---|
| **Landing** | `landing` | Welcome/onboarding, first-time orientation | Static |
| **Command Centre** | `dashboard` | Session overview: recent cases, key metrics, system status | Live job data + session log |
| **3D Studio Viewer** | `viewer` | Main interactive workspace: 3D twin + linked MPR + all trust-layer tools | Live StudyProvider (demo or real) |
| **Segmentation Review** | `review` | Focused comparison of model prediction vs. expert mask | Live StudyProvider |
| **Research Lab** | `research` | Cohort tables, model comparison data, benchmark results | Committed evaluation data |
| **Trust & Explainability** | `trust` | Uncertainty calibration details, geometry/input audit, full provenance | Live StudyProvider + calibration data |
| **Patient Companion** | `patient` | Simplified view designed for non-specialist audiences | Summary data |
| **NeuroLearn Academy** | `learn` | Interactive teaching content about brain tumour segmentation | Educational content |
| **Research Graph** | `graph` | Research network visualization | Research metadata |

### Navigation Implementation

- `NavigationSidebar.tsx` — Persistent sidebar with workspace icons
- `workspaceStore.ts` — Zustand store managing active workspace and per-workspace state
- Workspaces requiring study data wrap in `<StudyProvider>` with a loading fallback
- Transition animation: `animate-fade-in` on workspace switch

---

## 16. Tool Copilot (AI Assistant)

### Architecture

```
User Question
      │
      ▼
┌─────────────────┐
│ LAYER 1:        │    "cancer", "diagnos*", "chemotherapy"...
│ Deterministic   │────→ INSTANT REFUSAL (no model call)
│ Input Guard     │
└────────┬────────┘
         │ (passes)
         ▼
┌─────────────────┐
│ LAYER 2:        │    Retrieval over ~16 hand-written docs
│ Corpus Retrieval│    about tool vocabulary (Dice, HD95, σ, etc.)
│ + Allow-listed  │    + explicit allow-list of job metadata fields
│ Metadata        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LAYER 3:        │    System prompt + structured JSON output
│ Ollama LLM      │    {"answer", "cited_fields", "caveat"}
│ (llama3.1:8b)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LAYER 4:        │    BANNED_PATTERN regex scan
│ Post-Generation │────→ Match? Discard response, substitute REFUSAL
│ Filter          │
└────────┬────────┘
         │ (passes all layers)
         ▼
    Safe Response
    to User
```

### What It Never Sees

- ❌ Raw image or voxel data
- ❌ Input file paths or filenames
- ❌ File hashes
- ✅ Only: pre-computed scalar fields from metadata (volumes, Dice, HD95, σ, warnings, model info)
- ✅ Only: the hand-written corpus about tool vocabulary

### Adversarial Testing

29-prompt test pack covering:
- Direct diagnosis requests → must be refused
- Hedged/role-play reframing → must be refused
- Legitimate tool questions → must NOT be refused

**Result: 28/29 passed** (the 1 near-miss was content-safe on inspection)

---

## 17. Reporting & Provenance System

### What Every Report Contains

| Category | Fields |
|---|---|
| **Model Provenance** | Model name, bundle version, licence, checkpoint sha256, TTA pass count and method |
| **Input Provenance** | Per-sequence sha256 of uploaded files, geometry (dims/spacing/affine), code commit hash |
| **Results** | Per-region volume with formula, Dice/sensitivity vs. expert, connectivity, mean/max σ, max diameter, surface area, TP/FP/FN agreement |
| **Process** | Timestamp, total runtime, every validation warning that fired |
| **Compliance** | Disclaimer, explicit itemised limitations |

### Export Bundle

`GET /api/v1/jobs/{id}/export` produces a zip containing:
1. **Printable HTML report** — formatted for archiving or printing
2. **Full metadata JSON** — machine-readable, complete provenance
3. **Prediction NIfTI** — on original grid, openable in any NIfTI viewer

**Use case:** Archive a case, hand it to a colleague, bring it to a tumour board.

### Operational Metrics

`GET /api/v1/metrics` provides:
- Job-outcome counters: completed / errored / rejected (by rejection code)
- Inference-time P50 and P95
- "The pipeline is reliable" backed by a reproducible number

---

## 18. Security, Privacy & Resource Guards

### Data Privacy

| Control | Implementation |
|---|---|
| **Zero cloud calls** | All processing is local — no scan, mask, or derived data ever leaves the machine |
| **Source file deletion** | Uploaded files are deleted immediately after a result exists |
| **Job auto-expiry** | Derived artefacts expire after 23 hours (background sweep) |
| **No-store headers** | All `/api/v1/` responses marked `no-store` |
| **Filename sanitization** | Server never trusts client-supplied filenames for on-disk paths |
| **DICOM de-ID check** | Non-anonymized `PatientName` produces explicit warning |
| **Loopback-only** | Network bound to localhost; CORS pinned to Vite dev origin |

### Resource Guards

| Guard | Implementation |
|---|---|
| **Voxel count cap** | Hard limit on resampled inference grid (`limits.py`) |
| **Upload size guard** | Rejects oversized multipart uploads by `Content-Length` before streaming |
| **Processing lock** | Single global lock — one study at a time |
| **Queue cap** | Maximum 10 waiting studies |
| **Structured errors** | Every failure path raises `ApiError(status, code, message)` |

---

## 19. Testing & Verification Framework

### Test Layers

| Layer | Tool | Tests | What It Covers |
|---|---|---|---|
| **Unit Tests** | pytest | 48 tests | `validate.py`, `regions.py`, `model_base.py`, inspect, queue, metrics, export |
| **Judge Pipeline** | `run_judge_tests.py` | 17 tests | Failure pack, volume calibration, reproducibility, anisotropic, orientation |
| **Guardrail Tests** | `run_assistant_guardrail_tests.py` | 29 prompts | Adversarial + legitimate prompt coverage |
| **Real-Data Eval** | `evaluate.py` | 10 cases | Dice, sensitivity, HD95 on held-out Decathlon data |
| **Calibration Check** | `calibration_check.py` | 10 cases | σ vs. real disagreement correlation |
| **CI** | `.github/workflows/ci.yml` | On every push | pytest + heuristic judge pack + frontend build |

### Judge Pipeline Test Results

| Test | What It Checks | Result |
|---|---|---|
| **Failure Pack (×9)** | 8 broken inputs + missing sequence | **9/9 PASS** — every case rejected with specific message |
| **Volume Calibration** | 20×20×20 cube at 1×1×2mm = 16.0 mL | **PASS** — exact |
| **Reproducibility** | Same case twice → Dice ≥ 0.99 | **PASS** — 1.00000 |
| **Anisotropic** | Half-resolution case → WT within 10% | **PASS** — 2.1–5.4% |
| **Orientation (same)** | Flipped voxels + matching affine | **PASS** — 0.0% difference |
| **Orientation (mirrored)** | Flipped voxels, unchanged affine | **PASS** — tumour on other side |

### How to Reproduce

```bash
# Unit tests
cd backend && python -m pytest tests/ -q

# Judge pipeline
python make_testcase.py --out ./testdata
python run_judge_tests.py --data ./testdata --model bundle

# Real-data evaluation
python tools/fetch_decathlon_sample.py --count 10 --out data/raw_sample
python tools/convert_decathlon.py --root data/raw_sample/Task01_BrainTumour --out data
python evaluate.py --root data/decathlon --limit 10 --out data/real_sample_eval.json --model bundle

# Calibration check
python calibration_check.py --root data/decathlon --limit 10

# Guardrail tests (requires Ollama running)
python run_assistant_guardrail_tests.py
```

---

## 20. Deployment Architecture

### Local Development (Recommended)

```bash
# Terminal 1 — Frontend
npm install
npm run dev                          # → http://localhost:5173

# Terminal 2 — Backend
cd backend
pip install -r requirements.txt
python setup_model.py                # One-time: downloads + verifies checkpoint
uvicorn server.main:app --host 127.0.0.1 --port 8008

# Terminal 3 — Tool Copilot (Optional)
ollama serve
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

### Docker Compose (One-Command)

```yaml
services:
  backend:    # Port 8008 — FastAPI + pipeline
  frontend:   # Port 5173 — Vite dev server
  ollama:     # Port 11434 — Local LLM (optional, needs manual model pull)
```

```bash
docker compose up --build
# Then (one-time, for the copilot):
docker compose exec ollama ollama pull llama3.1:8b
docker compose exec ollama ollama pull nomic-embed-text
```

### Environment Configuration

All tunables live in `neuroscope/config.py`'s `Settings` object:

| Setting | Default | Environment Variable |
|---|---|---|
| Job directory | `.runtime/` | `NEUROSCOPE_JOB_DIR` |
| TTA passes | 2 | `NEUROSCOPE_TTA_PASSES` |
| CORS origins | `http://localhost:5173` | `NEUROSCOPE_CORS_ORIGINS` |
| Upload limit | 1 GB | `NEUROSCOPE_UPLOAD_LIMIT` |
| Job retention | 23 hours | `NEUROSCOPE_RETENTION_HOURS` |
| Ollama URL | `http://localhost:11434` | `NEUROSCOPE_OLLAMA_URL` |
| Assistant model | `llama3.1:8b` | `NEUROSCOPE_ASSISTANT_MODEL` |

---

## 21. Repository Layout

```
c:\Kurukshetra\
│
├── backend/
│   ├── neuroscope/              Pure-Python pipeline library
│   │   ├── __init__.py
│   │   ├── validate.py          All-or-nothing input validation
│   │   ├── infer.py             TTA inference + checkpoint verification
│   │   ├── regions.py           BraTS regions, volumes, Dice, HD95, connectivity
│   │   ├── nifti_io.py          NIfTI read/write with affine preservation
│   │   ├── dicom_io.py          DICOM series → NIfTI conversion
│   │   ├── provenance.py        File hashing, git commit ID
│   │   ├── limits.py            Resource budgets (voxel caps)
│   │   ├── model_base.py        Formal model adapter Protocol
│   │   ├── config.py            Centralised Settings object
│   │   ├── assistant.py         Local tool copilot + guardrails
│   │   └── assistant_corpus.py  ~16 hand-written corpus documents
│   │
│   ├── server/                  FastAPI application
│   │   ├── main.py              All endpoints, job lifecycle, queue, progress
│   │   └── viewer.py            Report HTML generation
│   │
│   ├── tools/                   Data preparation utilities
│   │   ├── fetch_decathlon_sample.py    Range-request fetcher (~99MB vs 7.6GB)
│   │   ├── convert_decathlon.py         4D→4×3D split, label code remap
│   │   └── make_demo_gallery.py         Synthetic demo case generation
│   │
│   ├── tests/                   pytest suite (48 tests)
│   ├── data/                    Eval results, splits, manifests (gitignored)
│   ├── samples/                 Curated demo + real cases
│   ├── models/                  Model checkpoints (gitignored)
│   │
│   ├── predict.py               CLI entry point (judges call this)
│   ├── evaluate.py              Batch accuracy evaluation
│   ├── calibration_check.py     Uncertainty calibration measurement
│   ├── make_testcase.py         Synthetic test pack generator
│   ├── run_judge_tests.py       Judge test runner
│   ├── run_assistant_guardrail_tests.py  Adversarial prompt tests
│   ├── setup_model.py           Model download + verification
│   ├── requirements.txt         Python dependencies
│   └── Dockerfile               Backend container image
│
├── src/
│   ├── components/              React UI components
│   │   ├── ThreeBrainTwin.tsx   3D viewport (brain shell + tumour meshes)
│   │   ├── LinkedMprGrid.tsx    2×2 linked MPR grid + toolbar
│   │   ├── MprPanel.tsx         Individual slice panel
│   │   ├── UploadPanel.tsx      4-sequence upload + progress
│   │   ├── BottomMetricsBar.tsx Volumes, Dice, connectivity, σ
│   │   ├── QualityCentre.tsx    Itemised validation report
│   │   ├── AssistantPanel.tsx   AI copilot chat
│   │   ├── DatasetsPanel.tsx    Curated case gallery
│   │   ├── HelpPanel.tsx        Help + vocabulary guide
│   │   ├── NavigationSidebar.tsx Multi-workspace nav
│   │   ├── TopBar.tsx           Top navigation bar
│   │   ├── BottomActivityStrip.tsx  Status bar + panel toggles
│   │   ├── DisclaimerBanner.tsx Research prototype banner
│   │   └── workspaces/          9 workspace components
│   │
│   ├── lib/                     Shared utilities
│   │   ├── surfaceNets.ts       Custom isosurface extraction
│   │   ├── meshing.ts           Mesh generation orchestration
│   │   ├── volume.ts            Affine math (voxel↔world)
│   │   ├── api.ts               Typed FastAPI client
│   │   ├── buildLiveStudy.ts    Live job → render-ready bundle
│   │   ├── phantom.ts           Procedural demo brain
│   │   ├── sequenceDetect.ts    Filename-based sequence detection
│   │   ├── useShortcuts.ts      Keyboard shortcut handling
│   │   ├── planes.ts            Plane geometry utilities
│   │   └── regions.ts           Region definitions + colours
│   │
│   ├── state/                   Zustand state management
│   │   ├── store.ts             Main application store
│   │   ├── study.tsx            StudyProvider (demo + live)
│   │   ├── liveStudy.ts         Upload/poll state
│   │   └── workspaceStore.ts    Workspace navigation state
│   │
│   ├── App.tsx                  Root application component
│   ├── main.tsx                 React entry point
│   └── index.css                Global styles
│
├── docs/                        Project documentation
│   ├── ARCHITECTURE.md          Technical architecture deep-dive
│   ├── FEATURES.md              Complete feature breakdown
│   ├── PROBLEM_AND_APPROACH.md  Clinical problem + three-layer thesis
│   ├── VERIFICATION.md          Measured test results
│   ├── MODEL_CARD.md            Model provenance + limitations
│   ├── ASSISTANT.md             Tool copilot design + guardrails
│   ├── IMPLEMENTATION_PLAN.md   Active data/model work plan
│   ├── INTERACTIVE_PLATFORM_PLAN.md  Active product-surface plan
│   ├── BACKEND_ROADMAP.md       Phased backend hardening plan
│   ├── PRODUCT_GAPS_AND_IDEATION.md  Gap analysis + ideation
│   └── assets/                  Diagrams and screenshots
│
├── reports/                     Landscape/competitive research
├── .github/workflows/           CI configuration
├── docker-compose.yml           One-command Docker setup
├── package.json                 Frontend dependencies
├── tsconfig.json                TypeScript configuration
├── vite.config.ts               Vite build configuration
└── README.md                    Project overview + quickstart
```

---

## 22. Known Limitations & Future Roadmap

### Current Known Limitations

| Limitation | Detail | Impact |
|---|---|---|
| **Single model** | Only SegResNet benchmarked; multi-model comparison needs GPU training compute | No model diversity for comparison |
| **Pretraining overlap** | Can't verify if eval cases overlap BraTS 2018 training set | Disclosed, not fixable without checkpoint training manifest |
| **128³ window** | Smaller than some full-resolution configs | Trades some accuracy for speed/memory |
| **Heuristic skull-strip** | Not a trained classifier | Can accept unusual phantoms or reject unusual genuine images |
| **No modality dropout** | All 4 sequences required | No degraded mode for missing sequences |
| **TTA uncertainty** | Not epistemic/aleatoric decomposed | Cheaper but less theoretically grounded |
| **Copilot latency** | 50–130s per answer on CPU | Acceptable for prototype, needs GPU for production |
| **No conversation memory** | Each copilot question answered independently | Multi-turn adversarial attempts untested |
| **Docker not build-verified** | Written but not tested in dev environment | May need fixes for first actual build |

### Planned Roadmap

| Priority | Feature | Status |
|---|---|---|
| Near-term | Pre-inference preview | Planned |
| Near-term | Interactive failure simulator | Planned |
| Near-term | Atlas-relative localisation (lobe identification) | Planned |
| Near-term | Modality-ablation explanation | Planned |
| Medium-term | Longitudinal comparison (same patient over time) | Planned |
| GPU-gated | Multi-model benchmarking (nnU-Net, Swin UNETR) | Blocked on GPU compute |
| GPU-gated | GPU timing on T4-class hardware | Blocked on GPU access |

---

## 23. Glossary of Key Terms

| Term | Definition |
|---|---|
| **BraTS** | Brain Tumour Segmentation challenge — the standard benchmark for brain tumour AI |
| **WT (Whole Tumour)** | NCR + ED + ET — the full extent of the abnormal signal including swelling |
| **TC (Tumour Core)** | NCR + ET — the solid tumour mass excluding oedema |
| **ET (Enhancing Tumour)** | The actively growing, contrast-enhancing component |
| **NCR** | Necrotic Core — dead tissue inside the tumour (BraTS code 1) |
| **ED** | Peritumoral Edema — swelling around the tumour (BraTS code 2) |
| **Dice Score** | Overlap metric: 2×|A∩B| / (|A|+|B|); 1.0 = perfect agreement |
| **Sensitivity (Recall)** | |TP| / (|TP|+|FN|) — proportion of true positives found |
| **HD95** | 95th-percentile Hausdorff distance — boundary accuracy in mm |
| **Flip-TTA** | Flip-based Test-Time Augmentation — running inference with and without spatial flips |
| **σ (sigma)** | Standard deviation across TTA passes — the uncertainty signal |
| **Surface Nets** | Isosurface extraction algorithm producing smoother meshes than marching cubes |
| **MPR** | Multi-Planar Reconstruction — viewing 3D data as axial, coronal, sagittal slices |
| **RAS+** | Right-Anterior-Superior orientation convention for neuroimaging |
| **LPS** | Left-Posterior-Superior — DICOM's default orientation convention |
| **Affine** | 4×4 transformation matrix mapping voxel indices to world-mm coordinates |
| **NIfTI** | Neuroimaging Informatics Technology Initiative — standard file format for brain scans |
| **DICOM** | Digital Imaging and Communications in Medicine — hospital scanner output format |
| **PACS** | Picture Archiving and Communication System — hospital image storage/viewing system |
| **MONAI** | Medical Open Network for Artificial Intelligence — PyTorch-based medical AI framework |
| **SegResNet** | 3D convolutional encoder-decoder architecture for volumetric segmentation |
| **Zustand** | Lightweight React state management library |
| **FastAPI** | Modern Python web framework for building APIs |
| **Ollama** | Local LLM inference server |
| **Provenance** | Complete record of how a result was produced (model, data, code, parameters) |

---

> **Disclaimer:** NeuroScope 3D is a research and teaching prototype only. It never establishes a diagnosis. It shows a *suspected tumour region predicted by the model* and an *estimated volume* — never "detected," never a "diagnostic system," and it never replaces a radiologist. It uses public, de-identified research data only. Out of scope: diagnosis, grading, genetic prediction, prognosis, treatment advice, surgical or radiotherapy planning, and any claim of clinical validation or regulatory clearance.

---

*Document generated from the NeuroScope 3D codebase (c:\Kurukshetra). For the most current information, refer to the project's `docs/` directory.*
