# Product gaps and ideation

This builds on `docs/BACKEND_ROADMAP.md`, the competitive landscape research
in `reports/`, and the gap analysis in "What doctors and radiology trainees
see today" (supplied separately). That document's framing is the most
precise statement of the problem we have, and it reframes what we're
actually building — not "the first tool to show a tumour in 3D" (3D Slicer
and others already do that), but **the first lightweight tool that connects
3D exploration to reproducible measurement and explicit evidence about
whether the AI prediction can be trusted.** Everything below is organised
around that reframing.

## The three-layer gap, and where this project sits today

The source document separates three things the PS deliberately bundles
together:

| Layer | What it is | Where this project stands |
|---|---|---|
| 1. Image interpretation | Navigate the scan, understand where the abnormal region is | **Done.** Linked axial/coronal/sagittal + 3D, shared crosshair, voxel+world coordinates. |
| 2. AI segmentation | Predict which voxels belong to WT/TC/ET | **Done and verified real** — real MONAI SegResNet checkpoint downloaded, hash-pinned, ~37s/case on CPU, real Dice 0.92–0.96 on a synthetic case, all 17 judge pipeline tests pass. |
| 3. Verification and trust | Explain size/location, measure agreement with expert labels, disclose limitations | **Partially done.** Volume math is shown with formula; Dice/sensitivity vs an uploaded expert mask is shown. What's *not* yet shown: voxel-level uncertainty, held-out accuracy against real BraTS data (not just our synthetic test case), and a few of the explicit fail-safe signals discussed below. |

The source document's own conclusion is the thesis for this whole roadmap:
position this as the Layer 3 tool, not a Layer 1 tool with a tumour overlay
bolted on. A tool that only does Layers 1–2 is replicating 3D Slicer with
worse software maturity; a tool that does all three, cheaply, live, in a
browser, is the thing nothing in the landscape research found.

## Gaps, specifically, from a "does this solve the actual problem" lens

These are gaps the PS test matrix doesn't directly score but the source
document's framing makes clearly necessary for the tool to be *useful*, not
just *compliant*:

1. ~~A plausible-looking mask is not evidence of accuracy~~ — **closed.**
   The document's sharpest point, and the single highest-value gap to close.
   Inference now runs as a small flip-based TTA ensemble (2 passes by
   default: identity + one flip, `neuroscope.infer.Segmenter.predict`); the
   per-voxel standard deviation across passes is a real, measured
   disagreement signal, not a proxy. It's transported to the browser as its
   own set of binary volumes (`/api/v1/jobs/{id}/uncertainty/{region}`) on the
   same grid as everything else, shown as a toggleable heat-map overlay in
   the MPR views (replacing the segmentation wash, not hidden behind it) and
   as a mean/max-σ readout per region in the metrics bar — with an explicit
   caveat attached everywhere it appears: this is disagreement under
   augmentation, not a calibrated confidence probability, and low σ does not
   guarantee correctness (the research flagged exactly this failure mode for
   naive uncertainty UIs). Cost: roughly 2x inference time — measured at
   ~60s/case on CPU with 2 passes, still well inside the 2-minute budget.

2. ~~"Whether the model has missed tissue on slices you haven't inspected"~~
   — **closed.** `neuroscope.regions.connectivity_all` runs 26-connected
   component analysis on each region and reports component count, each
   component's volume, and the largest component's share of the total —
   directly answering the document's and the PS story's own opening
   question ("is it one mass or two?"). Surfaced per-region in the metrics
   bar ("single connected mass" vs "3 disconnected regions, largest 84%").

3. **Evaluation is currently self-referential.** Dice/sensitivity only
   appear when the *user's own* expert mask is uploaded. The PS requires
   accuracy on ≥10 *held-out* cases the team evaluated separately — that
   number needs to live somewhere in the product (the report, a static
   "model card" panel), not only in a CLI output judges never see unless
   they ask.

4. **No anatomical localisation.** The document's story opens with "which
   side is it on" as one of the three questions a trainee has to answer
   manually. Side (L/R) is already visible from the crosshair and mesh, but
   there's no equivalent for *which lobe* / proximity to major structures —
   a cheap, defensible addition (see "atlas-relative localisation" below),
   distinct from diagnosis.

## Making the backend genuinely demo-proof

This was the most concrete ask this round, so it's already implemented,
not just planned:

- **Real model, not just the pipeline smoke test.** `setup_model.py` now
  downloads and sha256-pins the actual MONAI `brats_mri_segmentation`
  checkpoint (18.8 MB, Apache-2.0). Measured on this machine, CPU-only:
  **~37 seconds per case**, comfortably inside the PS's 2-minute T4 budget
  even without a GPU. Real Dice on a synthetic test case: WT 0.960, TC
  0.920, ET 0.953. All 17 judge pipeline tests pass with the real model.
- **Live stage progress, not a silent spinner.** The backend now reports
  pipeline stage transitions (`validating → resampling → segmenting →
  measuring → meshing → reporting → done`) through a pollable
  `/api/v1/jobs/{id}/status` endpoint, and the upload panel shows them live
  with a stage bar. During a demo, the judges watch it actually move through
  "Running 3D segmentation — this is the slow step…" for the ~30 seconds
  that take real work, rather than staring at an ambiguous spinner that
  could be doing nothing. This is a presentation-reliability feature as much
  as a UX one: a visible multi-second pipeline reads as "doing real
  compute," which is the honest and the persuasive framing at once.
- **Still open before a live slot**: the two things in Phase 1 of the
  backend roadmap that need a GPU or real patient-adjacent data to close —
  an actual T4 timing run, and real accuracy on ≥10 held-out BraTS cases
  (today's 0.92–0.96 Dice is on our own synthetic calibration case, not
  real tumour data, and must not be presented as if it were).

## Ideation: extra input for a cleaner output

In rough order of value-per-effort:

- **A seed point / region-of-interest click.** Instead of only an optional
  *expert mask*, let the user click a point in the MPR view before running
  inference ("the tumour is roughly here"). This doesn't need a new model —
  it can crop the inference ROI around the click, which both speeds up
  inference and reduces false positives elsewhere in the volume on noisy or
  atypical inputs. This is a genuinely useful "extra input for cleaner
  output" feature and is a few hours of work (a click handler + an ROI crop
  in `neuroscope.infer`), not a new model to train.
- **Patient age, as metadata only.** BraTS-trained models are adult-glioma
  specific; nothing in the pipeline today warns if a paediatric or clearly
  atypical-age scan is uploaded. A single optional age field lets the
  report add a specific, honest limitation note ("this model was trained
  and validated on adult glioma cases only") instead of a generic
  disclaimer — small effort, real trust value, zero clinical-claim risk.
  Must stay metadata-only: it must never influence the segmentation itself
  without evidence that doing so is valid.
  **Second, prior-scan upload** (same patient, different date) is already
  PS extra credit (longitudinal comparison) and is the natural second
  "extra input" — reuses the whole pipeline per-scan, then diffs volumes.
- **Scanner field strength / sequence TR-TE, read from the NIfTI/DICOM
  header rather than asked as a new input** — already available for free in
  most real files; surfacing it in the provenance report (not using it in
  the model) costs nothing and adds a real data-quality signal a radiologist
  would actually look for.

## Ideation: "what else solves the actual problem" (beyond extra credit)

- **Atlas-relative localisation, not diagnosis.** Register the predicted WT
  mask against a public, non-clinical brain atlas (e.g. a coarse
  lobe/hemisphere parcellation shipped with a library like `nilearn` or a
  bundled MNI-space atlas) and report something like *"predicted WT overlaps
  the right temporal lobe (62%) and right parietal lobe (14%)"*. This
  directly answers "which side is it on" and "where, anatomically" — the
  document's own framing of what trainees struggle with — without making
  any claim about what the tumour *is* or what to *do about it*. This is
  squarely inside Layer 1/2 (location, not interpretation) and costs one
  registration step plus a lookup table.
- **Connected-component summary**, from the gap list above: "WT is 1
  connected region" vs "WT is 3 regions, largest is 91% of total volume" —
  directly answers the document's "is it one mass or two?" question, which
  the PS's own story opens with, and is a few lines of `scipy.ndimage.label`
  on top of infrastructure that already exists.
- **A genuinely useful provenance/report page as the product's actual
  differentiator**, per the document's "measuring vs validating" distinction
  — this is already Phase 3 of the backend roadmap (uncertainty + HD95 +
  agreement maps + "second reader" framing) and doesn't need new ideation
  here; the gap analysis above just confirms it's the right priority, not a
  nice-to-have.

## On "a rough diagnosis suggesting what to do"

This needs to be said plainly rather than quietly built around: **the PS
explicitly forbids this**, and it isn't a grey area.

> *Out of scope: diagnosis, grading, genetic prediction, prognosis or
> treatment advice...* and *Wording: say "suspected tumour region predicted
> by the model" and "estimated volume". Never say "tumour detected",
> "diagnostic system" or "replaces the radiologist".*

A "rough diagnosis" or "suggested next step" feature — even hedged,
even labelled "not medical advice" — is very likely to read as exactly the
prohibited behaviour to a judge scoring against that rubric, and the
downside (disqualification or a hard credibility hit on the one axis this
competition cares about most) outsizes any upside. I'd recommend not
building this, and I haven't.

What the same underlying impulse — "give the user something actionable,
not just a number" — can become *without* crossing that line:

- **"Suggested review priority," framed as a research-workflow action, not
  a clinical one**: e.g. "ET volume exceeds the WT:ET ratio seen in typical
  cases in this dev set — flag for expert review" is a statement about the
  *model's own output relative to its training distribution*, not about the
  patient. This is defensible as the "second reader" framing the trust
  research recommends, as long as it's phrased as "review this model
  output," never "this indicates."
- **Explicit model-confidence routing**: "this case's prediction falls
  outside the uncertainty range seen on held-out validation cases — treat
  this result with lower confidence than the reported Dice would suggest."
  This is the uncertainty/OOD work from Phase 3 of the backend roadmap,
  stated as an action about *trusting the tool*, not about the patient's
  condition — which is the distinction the PS is actually drawing.

Both of those produce the feeling of "the tool told me what to do," the
thing I think the original ask was really reaching for, while staying
entirely on the Layer 3 (verification) side of the line the PS draws, never
the Layer 1/2 (clinical interpretation) side.

## Ideation round 2 — interactivity, and the resident's actual daily workflow

Everything above was scoped against the PS's own text. This round asks a
different question: if a radiology resident, a teaching-hospital volunteer,
or a research-lab coordinator had to use this tool *every single day*, what
would make it worth opening versus just scrolling slices in the existing
PACS viewer? The honest answer is that today's feature set mostly *restates*
the PS — upload, segment, view, measure. What's below is what turns it into
something that teaches and triages, not just displays, while staying
strictly on the Layer 3 (trust) side of the line already drawn above.

Status note: the two "Datasets" and "Help" items in category A were, until
this round, dead nav-bar buttons with no handler — found and fixed alongside
this ideation pass, not just proposed. See `src/components/DatasetsPanel.tsx`,
`src/components/HelpPanel.tsx`, and the new `/api/v1/samples` +
`/api/v1/samples/{id}/run/{job}` server endpoints.

### A. Fixing what looked done but wasn't

| Gap found | Why it matters daily | Fix |
|---|---|---|
| "Datasets" / "Selection" / "Help" nav buttons had no `onClick` at all | A volunteer clicking the obvious nav item and having nothing happen is the fastest way to lose trust in the *whole* tool, not just that button | **Done.** Datasets panel lists curated cases and runs them server-side with one click, through the exact same pipeline as an upload; Help panel explains the workspace, the trust-layer vocabulary, and explicitly answers "where's the accuracy number" |
| "Measure" and "Window / Contrast" toolbar buttons (`LinkedMprGrid.tsx`) are wired to `onClick={() => {}}` | Measuring distance and adjusting contrast are the two things every radiology workstation lets you do on slice 1 of any session — a resident's muscle memory expects them | Not yet built this round — flagged here so it isn't silently assumed done. Both are pure frontend geometry/canvas work (`lib/volume.ts` already has voxel↔world math), no backend change, no model change — good next session's first task |

### B. Session memory — "what did I look at today"

A resident or volunteer realistically reviews several cases in one sitting,
not one. Nothing today lets them come back to case 3 after looking at case
7 without re-running it.

- **Session case log** — every run (sample or uploaded) gets a lightweight
  local record (timestamp, case label, volumes, Dice if available, sha256) —
  `localStorage`, no backend/database needed since job artefacts already
  expire server-side in 23h anyway. A visible "Today's cases" list lets you
  jump back to any of them instantly if the job is still live, or at least
  see the numbers after it's expired.
- **Two-case compare** — pick any two entries from that log and see their
  metrics bars stacked, with the volume/Dice *delta* highlighted. This is a
  cheap, immediately-useful precursor to the roadmap's full longitudinal
  comparison (same-patient-over-time) — it works for *any* two cases today,
  which is what a volunteer comparing "this teaching case vs. the one we did
  last week" actually needs first.
- **Review-priority badge** — compare this case's mean flip-TTA σ against the
  session log's own distribution so far; flag outliers ("higher uncertainty
  than the other cases you've run today — review this one first"). This is
  the PS-safe reframing already drafted above ("a statement about the
  model's own output," never about the patient), now made concrete and
  genuinely triage-useful for someone working through a stack of scans.

### C. Teaching and explainability — making the tool *teach*, not just show

- **Modality-ablation toggle, live** — a per-sequence switch in the upload/
  sample panel that re-runs inference with one channel zeroed, then shows the
  voxels that *disappeared* highlighted in a third colour. Already named in
  the PS's own extra-credit list (`docs/PRODUCT_GAPS_AND_IDEATION.md`'s
  "growing edge"), but reframed here as the actual teaching payoff: a
  resident sees directly that FLAIR is carrying most of the oedema call on
  *this* case, which is the real skill the PS's own opening story says
  residents are missing — not an offline research plot, an interactive one.
- **Explain-this-number tooltips everywhere a figure appears** — Dice,
  sensitivity, σ, and the volume formula already have one good tooltip
  example (`BottomMetricsBar.tsx`'s uncertainty caveat); extend the same
  pattern to every metric so hovering teaches instead of the Help panel
  being the only place that explains anything.
- **Guided first-run tour** — a 5-step spotlight walkthrough (3D twin →
  shared crosshair → confidence heat-map → region isolation → upload/
  Datasets), built on the same panel primitives as Help, shown once per
  browser via `localStorage`. Onboarding friction is the actual adoption
  blocker in a busy teaching session, not missing features.
- **Interactive "case builder"** — expose `make_demo_gallery.py`'s lesion
  parameters (size, position, single vs. multifocal) as sliders in the UI,
  calling a new `/api/v1/samples/build` endpoint that generates and
  immediately segments a fresh synthetic case. Lets an instructor construct
  "what if the tumour were bigger / on the other side / split in two" live,
  in front of a room — directly serves the teaching-hospital use case named
  in the README's Business Impact table, with zero new model work.

### D. The gap that actually blocks real-world daily use

- **DICOM ingestion is the highest-leverage item on this entire list.** Every
  idea above assumes a resident already has four NIfTI files. In practice
  their actual daily artefact is a DICOM series out of the hospital's PACS.
  Until there's a conversion step in front of upload (`dicom2nifti` or
  equivalent, already named in the original roadmap's "growing edge"), the
  tool cannot ingest what a resident's worklist actually contains — this
  matters more than most Layer-3 additions above, because without it the
  *daily* use case this whole project is framed around never actually
  happens outside a demo.
- **Atlas-relative localisation**, re-prioritized up from the original list:
  it directly extends the PS's own opening question ("which side is it on")
  to "which lobe," using a small bundled coarse atlas and an affine-only
  (not deformable) alignment — honestly disclosed as approximate, never
  framed as a registration-grade result.

### What stays explicitly out, restated

Nothing above crosses into diagnosis, grading, or treatment suggestion. The
case builder generates *synthetic* teaching cases, never a claim about a
real patient; the review-priority badge is a statement about this session's
own uncertainty distribution, never about the patient's prognosis. The line
drawn earlier in this document is unchanged — this round only asks how to
make the Layer-3 side of it more useful day to day, not whether to cross it.
