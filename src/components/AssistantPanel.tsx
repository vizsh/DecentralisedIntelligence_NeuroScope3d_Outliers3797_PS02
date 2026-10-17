import { useEffect, useRef, useState } from 'react'
import { assistantAsk, assistantHealth, AssistantError, type AssistantHealth, type AssistantMode } from '../lib/api'
import { useStore } from '../state/store'
import { useStudyOptional } from '../state/study'

interface Turn {
  question: string
  answer: string
  caveat: string | null
  citedFields: string[]
  refused: boolean
  error?: string
}

export default function AssistantPanel() {
  const open = useStore((s) => s.assistantOpen)
  const setOpen = useStore((s) => s.setAssistantOpen)
  const bundle = useStudyOptional()

  const [mode, setMode] = useState<AssistantMode>('trainee')
  const [health, setHealth] = useState<AssistantHealth | null>(null)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [asking, setAsking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    assistantHealth().then(setHealth)
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, asking])

  if (!open) return null

  const jobId = bundle?.mode === 'live' ? bundle.jobId : null
  const ready = health?.available && health.chat_model_ready && health.embed_model_ready

  const handleAsk = async () => {
    const q = question.trim()
    if (!q || asking) return
    setQuestion('')
    setAsking(true)
    try {
      const res = await assistantAsk(q, jobId, mode)
      setTurns((t) => [...t, {
        question: q, answer: res.answer, caveat: res.caveat,
        citedFields: res.cited_fields, refused: res.refused,
      }])
    } catch (err) {
      setTurns((t) => [...t, {
        question: q, answer: '', caveat: null, citedFields: [], refused: false,
        error: err instanceof AssistantError ? err.message : 'The assistant is unavailable right now.',
      }])
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div
        className="flex h-[80vh] w-full max-w-xl flex-col rounded-lg border border-edge bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge/80 p-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[13.5px] font-semibold text-slate-100">Tool Copilot</h2>
              <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9.5px] text-sky-300 border border-sky-500/20">
                Clinician / trainee only
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Explains this tool's own measurements. Never a diagnosis — see the disclaimer below.
            </p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-200">✕</button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1.5 border-b border-edge/60 px-3 py-2">
          <span className="text-[10px] text-slate-500">Audience:</span>
          {(['trainee', 'clinician'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium capitalize transition ${
                mode === m
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                  : 'border border-edge text-slate-400 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-500">
            {jobId ? 'Grounded to the current case' : 'No live case loaded — tool questions only'}
          </span>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {!health && (
            <p className="text-[11px] text-slate-500">Checking the local assistant…</p>
          )}
          {health && !ready && (
            <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-[11px] text-amber-200">
              Local assistant unavailable. Run <code className="font-mono">ollama serve</code>, and make sure{' '}
              <code className="font-mono">{health.chat_model}</code> and{' '}
              <code className="font-mono">{health.embed_model}</code> are pulled.
            </div>
          )}
          {turns.length === 0 && ready && (
            <div className="space-y-1.5 text-[11px] text-slate-500">
              <p>Ask about a metric, a validation message, or how to use a tool — for example:</p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>"What does HD95 measure?"</li>
                <li>"Why was my upload rejected?"</li>
                <li>"What does the agreement overlay's green color mean?"</li>
              </ul>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <div className="ml-6 rounded-lg bg-panel-2 px-3 py-1.5 text-[11.5px] text-slate-200">{t.question}</div>
              <div
                className={`mr-6 rounded-lg border px-3 py-2 text-[11.5px] leading-relaxed ${
                  t.error
                    ? 'border-rose-500/30 bg-rose-950/20 text-rose-200'
                    : t.refused
                      ? 'border-amber-500/30 bg-amber-950/20 text-amber-100'
                      : 'border-edge bg-panel-2/60 text-slate-200'
                }`}
              >
                {t.error || t.answer}
                {t.caveat && <p className="mt-1.5 text-[10px] italic text-slate-400">{t.caveat}</p>}
                {t.citedFields.length > 0 && (
                  <p className="mt-1.5 font-mono text-[9.5px] text-slate-500">
                    From: {t.citedFields.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}
          {asking && <p className="ml-6 text-[11px] text-slate-500">Thinking…</p>}
        </div>

        {/* Input */}
        <div className="border-t border-edge/80 p-3">
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              disabled={!ready || asking}
              placeholder={ready ? 'Ask about this tool or the current case…' : 'Assistant unavailable'}
              className="flex-1 rounded border border-edge bg-panel-2 px-3 py-1.5 text-[11.5px] text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleAsk}
              disabled={!ready || asking || !question.trim()}
              className="rounded border border-sky-500/50 bg-sky-500/15 px-3 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/25 disabled:opacity-40"
            >
              Ask
            </button>
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-slate-500">
            Research and teaching prototype. Explains this tool's own measurements only — never a diagnosis,
            never advice for a specific patient. Runs entirely on this machine; nothing is sent to a
            third-party service.
          </p>
        </div>
      </div>
    </div>
  )
}
