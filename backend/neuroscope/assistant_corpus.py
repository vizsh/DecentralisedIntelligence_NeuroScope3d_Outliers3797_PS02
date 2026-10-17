"""The assistant's entire knowledge base about the tool itself.

Deliberately small, hand-written, and reviewed — not a dump of the full docs/ tree. Every entry
here is something a clinician or trainee might ask "what does this mean" or "how do I do this"
about, phrased the way this project's own docs already phrase it (same wording rules apply here
as everywhere else: "suspected", "estimated", never "detected" or "diagnostic").

This is retrieval content, not instructions — the assistant's actual behavioural rules live in
assistant.py's SYSTEM_PROMPT, not here. Adding a new entry never changes what the assistant is
allowed to say, only what background it can draw on when answering.
"""

from __future__ import annotations

CORPUS: list[dict[str, str]] = [
    {
        "id": "wt-tc-et",
        "title": "What WT, TC and ET mean",
        "text": (
            "WT (Whole Tumour), TC (Tumour Core) and ET (Enhancing Tumour) are the three nested "
            "regions this platform reports every measurement against, following the BraTS "
            "convention. WT is the full extent of abnormal signal including swelling. TC is the "
            "solid tumour mass, excluding surrounding oedema. ET is the actively contrast-"
            "enhancing component only. TC is a subset of WT; ET is a subset of TC. Every volume, "
            "Dice score and uncertainty figure in this tool is reported separately for each of "
            "the three."
        ),
    },
    {
        "id": "dice",
        "title": "What a Dice score means",
        "text": (
            "Dice (the Dice similarity coefficient) is a 0-1 score for how much two masks "
            "overlap: 2x(intersection) / (sum of both masks' sizes). 1.0 is a perfect match, 0 "
            "is no overlap at all. In this tool, Dice compares the model's predicted region "
            "against an uploaded expert mask when one is provided. It is a volume-overlap "
            "metric — it does not directly measure boundary distance, which is what HD95 is for."
        ),
    },
    {
        "id": "sensitivity",
        "title": "What sensitivity means",
        "text": (
            "Sensitivity is the fraction of voxels the expert marked as tumour that the model "
            "also caught (true positives divided by all expert-positive voxels). A high Dice "
            "with low sensitivity can mean the model is precise but missing real tumour tissue; "
            "always read sensitivity alongside Dice, not instead of it."
        ),
    },
    {
        "id": "hd95",
        "title": "What HD95 measures and why it's reported alongside Dice",
        "text": (
            "HD95 (95th-percentile Hausdorff distance) measures boundary disagreement in "
            "physical millimetres, via a spacing-aware Euclidean distance transform between the "
            "predicted and expert boundaries. Dice and sensitivity are volume-overlap metrics; a "
            "thin sliver of disagreement at a tumour's edge barely moves either of them. HD95 "
            "catches that: it answers 'how far off is this boundary,' not just 'how much do the "
            "two masks overlap.' The 95th percentile (not the maximum) is used so one stray "
            "outlier voxel doesn't dominate the number. HD95 is explicitly null — never 0 or "
            "infinite — when either mask is empty, because a boundary distance against nothing "
            "is undefined, not a perfect or worst-case score."
        ),
    },
    {
        "id": "uncertainty-sigma",
        "title": "What the uncertainty (sigma) heat-map means, and its limits",
        "text": (
            "The uncertainty signal (sigma, sigma) comes from flip-based test-time augmentation: "
            "the model runs on the unflipped volume and on one or more flipped copies, and the "
            "per-voxel standard deviation across those passes becomes the uncertainty value. "
            "High sigma means the model disagreed with itself under augmentation; low sigma means "
            "it agreed. This is a measured disagreement signal, not a calibrated probability of "
            "correctness — a low sigma value does NOT by itself guarantee the prediction is "
            "right. This caveat applies every time sigma is shown, with no exception. Whether "
            "sigma actually correlates with real boundary error against expert masks is a "
            "specific, separate question this platform has not yet measured (see "
            "docs/IMPLEMENTATION_PLAN.md Phase 3c) — don't imply it has."
        ),
    },
    {
        "id": "connectivity",
        "title": "What the connectivity / 'one mass or two' answer means",
        "text": (
            "A 26-connected-component analysis runs on every predicted region and reports how "
            "many separate contiguous blobs of voxels it found, each blob's individual volume, "
            "and the largest blob's share of the total. This directly answers 'is this one mass "
            "or several separate pieces' for any region, at no extra computation cost."
        ),
    },
    {
        "id": "agreement-overlay",
        "title": "What the agreement overlay colours mean",
        "text": (
            "When an expert mask is uploaded, the agreement overlay colours every voxel green "
            "(model and expert agree it's tumour), amber (only the model flags it — a false "
            "positive relative to the expert), or red (only the expert flags it — something the "
            "model missed, a false negative). 'Largest miss -> go' flies the crosshair straight "
            "to the centre of the single biggest red (false-negative) blob and switches to this "
            "overlay automatically."
        ),
    },
    {
        "id": "quality-check-centre",
        "title": "What the Quality Check Centre shows",
        "text": (
            "The Quality Check Centre is an itemised report of every real validation check this "
            "study was put through — not a single pass/fail badge. Each row names the specific "
            "check (e.g. affine agreement, finiteness, skull-strip heuristic, field-of-view "
            "plausibility) and its real result for this study, with the warning text shown on "
            "hover when a check produced one."
        ),
    },
    {
        "id": "measure-tool",
        "title": "How the measure tool works",
        "text": (
            "Click two points on any slice view to get a real physical distance in millimetres, "
            "computed from that scan's own voxel spacing (not assumed isotropic)."
        ),
    },
    {
        "id": "window-level",
        "title": "How window/contrast adjustment works",
        "text": (
            "Drag on a slice view to re-window the display: up/down adjusts the window centre "
            "(brightness), left/right adjusts the window width (contrast) — the same interaction "
            "a clinical PACS viewer uses. The default view reproduces the platform's previous "
            "fixed display ramp exactly, so opening the tool changes nothing until it's touched."
        ),
    },
    {
        "id": "validation-all-or-nothing",
        "title": "Why a study with one bad file produces zero output, not a partial one",
        "text": (
            "Validation in this platform is strictly all-or-nothing. If any one of the four "
            "required sequences is unreadable, non-3D, contains NaN/Inf values, is constant "
            "(e.g. all zeros), exceeds the 1GB size limit, or disagrees in shape or affine with "
            "the others, the entire study is rejected with a specific message naming the exact "
            "sequence and problem — nothing downstream (segmentation, measurement, report) ever "
            "runs on a study that failed validation. There is no code path that produces a "
            "partial or degraded result."
        ),
    },
    {
        "id": "skull-strip-fov-warnings",
        "title": "What 'not skull-stripped' and field-of-view warnings mean",
        "text": (
            "These are non-fatal warnings, not rejections. 'Not skull-stripped' fires when a "
            "sequence doesn't have the expected large, exactly-zero background a skull-stripped "
            "BraTS-style volume should have — the model was trained on skull-stripped data, so "
            "its output on a non-stripped input is less reliable. A field-of-view warning fires "
            "when the scan's physical dimensions fall outside what's plausible for an adult "
            "brain study. Both are shown in the Quality Check Centre with the measured value "
            "that triggered them."
        ),
    },
    {
        "id": "datasets-gallery",
        "title": "What the Datasets gallery is",
        "text": (
            "A curated set of cases runnable from the UI in one click, through the exact same "
            "pipeline as an uploaded study — not a canned or pre-computed result. It includes "
            "synthetic reference cases (unifocal, multifocal, large-diffuse) and real, "
            "de-identified Medical Segmentation Decathlon cases."
        ),
    },
    {
        "id": "tta-passes",
        "title": "What the TTA pass count means and why more passes isn't automatically better Dice",
        "text": (
            "TTA (test-time augmentation) pass count is how many times the model runs on "
            "transformed copies of the input (the original plus one or more flips), averaged "
            "into the final prediction and used to compute the uncertainty signal. More passes "
            "give a more complete uncertainty estimate, but do not guarantee a higher Dice score "
            "on any single case — on one case, a 1-pass and 2-pass run can score within normal "
            "case-to-case variation of each other. The 2-pass ensemble's real, measured value is "
            "the per-voxel disagreement signal it uniquely produces, not a guaranteed accuracy "
            "improvement."
        ),
    },
    {
        "id": "model-provenance",
        "title": "What model this platform uses, and how its integrity is checked",
        "text": (
            "The segmentation model is MONAI's brats_mri_segmentation bundle, a SegResNet "
            "architecture trained on BraTS 2018, Apache-2.0 licensed. Its checkpoint is sha256-"
            "hash-verified against a pinned lock file every time it loads — a corrupted or "
            "swapped checkpoint is refused outright, not silently used. A separate, much "
            "simpler intensity-threshold heuristic exists purely as a pipeline smoke test when "
            "the real model isn't available; its output is clearly labelled and is not a trained "
            "segmentation model."
        ),
    },
    {
        "id": "held-out-accuracy",
        "title": "What the real held-out accuracy figures are, and their caveats",
        "text": (
            "Ten real, de-identified Medical Segmentation Decathlon cases have been scored "
            "against the real model with no fine-tuning: mean Dice WT 0.8808 / TC 0.8697 / "
            "ET 0.7885, mean HD95 (mm) WT 8.43 / TC 5.53 / ET 5.71. This closes the problem "
            "statement's requirement for held-out accuracy on at least ten real, labelled "
            "cases. Two honest caveats travel with this figure: one case (BRATS_218) scores "
            "far lower on ET (Dice 0.308) than the others, reported as measured rather than "
            "excluded; and whether these specific case IDs overlap the checkpoint's original "
            "BraTS-2018 training set cannot be independently verified from its public release."
        ),
    },
    {
        "id": "what-this-tool-does-not-do",
        "title": "What this tool explicitly does not do",
        "text": (
            "This platform never provides a diagnosis, disease grading, genetic prediction, "
            "prognosis, or treatment advice, even hedged — that is explicitly out of scope by "
            "the problem statement's own rules and this project's own hard rules. It also never "
            "says a tumour was 'detected' or that the system is 'diagnostic' — the correct "
            "wording is always 'suspected tumour region predicted by the model' and 'estimated "
            "volume'. It is a research and teaching prototype, not validated or cleared for any "
            "clinical or patient-facing use."
        ),
    },
    {
        "id": "workspaces-overview",
        "title": "What each workspace in the navigation sidebar is for",
        "text": (
            "Command Centre: an overview dashboard of the active session and headline figures. "
            "3D Studio Viewer: the main 3D mesh + linked axial/coronal/sagittal slice workspace "
            "with the interactive trust-layer tools. Segmentation Review: a queue-style view for "
            "working through flagged or multiple cases. Research Lab: cohort-level tables and "
            "model comparisons across the held-out and synthetic cases. Trust & Explainability: "
            "a deeper audit view of uncertainty, geometry/input validation, and provenance for "
            "the current case. NeuroLearn Academy: interactive teaching content about MRI "
            "sequences and BraTS region definitions."
        ),
    },
]
