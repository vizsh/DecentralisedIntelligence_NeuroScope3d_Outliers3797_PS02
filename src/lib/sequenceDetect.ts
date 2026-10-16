/** Guess which upload slot a file belongs in from its filename — the "or the
 * filename says which file is which" half of the PS's upload requirement
 * (the other half, the user assigning a file to a labelled slot, is what
 * UploadPanel already did). Used to auto-sort a multi-file drop/selection;
 * the user's own slot placement always wins — this only pre-fills a guess,
 * never silently overrides what they picked. */

export type Slot = 'T1' | 'T1Gd' | 'T2' | 'FLAIR' | 'expert'

export type ImportProfile = 'standard' | 'synapse' | 'decathlon'

// Standard anatomical naming conventions
const STANDARD_PATTERNS: { slot: Slot; re: RegExp }[] = [
  { slot: 'expert', re: /(^|[_\-.])(seg|label|mask|gt|groundtruth|ground-truth)([_\-.]|$)/i },
  { slot: 'T1Gd', re: /(^|[_\-.])t1\s*(ce|gd|c|post|\+c)([_\-.]|$)/i },
  { slot: 'T1Gd', re: /t1[\s_-]?gad|post[\s_-]?contrast|contrast[\s_-]?enhanc/i },
  { slot: 'FLAIR', re: /(^|[_\-.])(flair|t2f)([_\-.]|$)/i },
  { slot: 'T2', re: /(^|[_\-.])(t2w?)([_\-.]|$)/i },
  { slot: 'T1', re: /(^|[_\-.])(t1w?|t1n)([_\-.]|$)/i },
]

// BraTS Synapse / nnU-Net numeric suffixes (_0000=FLAIR, _0001=T1, _0002=T1ce, _0003=T2)
const SYNAPSE_PATTERNS: { slot: Slot; re: RegExp }[] = [
  { slot: 'expert', re: /(^|[_\-.])(seg|label|mask|gt)([_\-.]|$)/i },
  { slot: 'FLAIR', re: /[_\-.]0000([_\-.]|$)/i },
  { slot: 'T1', re: /[_\-.]0001([_\-.]|$)/i },
  { slot: 'T1Gd', re: /[_\-.]0002([_\-.]|$)/i },
  { slot: 'T2', re: /[_\-.]0003([_\-.]|$)/i },
]

export function detectSlot(filename: string, profile: ImportProfile = 'standard'): Slot | null {
  const name = filename.toLowerCase()
  if (profile === 'synapse') {
    for (const { slot, re } of SYNAPSE_PATTERNS) {
      if (re.test(name)) return slot
    }
  }
  for (const { slot, re } of STANDARD_PATTERNS) {
    if (re.test(name)) return slot
  }
  return null
}

/** Distribute a list of dropped/selected files across slots by filename.
 * First match wins within the batch; anything undetected or colliding with
 * an already-filled slot comes back as `unmatched` so the UI can say so
 * instead of silently dropping it. */
export function autoSortFiles(
  files: File[],
  profile: ImportProfile = 'standard',
): { assigned: Partial<Record<Slot, File>>; unmatched: File[] } {
  const assigned: Partial<Record<Slot, File>> = {}
  const unmatched: File[] = []

  for (const file of files) {
    const slot = detectSlot(file.name, profile)
    if (slot && !assigned[slot]) {
      assigned[slot] = file
    } else {
      unmatched.push(file)
    }
  }
  return { assigned, unmatched }
}

