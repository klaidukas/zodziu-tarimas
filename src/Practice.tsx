import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Mic, RotateCcw, Volume2 } from 'lucide-react'
import type { Copy } from './strings'

export type Outcome = 'correct' | 'retry' | 'unclear'
type Result = { outcome: Outcome; heard: string }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  start: () => void
  abort: () => void
}
const speechWindow = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '')

export function Practice({ t, words, accent, speak, record, complete, restart }: {
  t: Copy; words: string[]; accent: string; speak: (word: string, slow?: boolean) => void
  record: (word: string, outcome: Outcome) => void; complete: () => void; restart: (words: string[]) => void
}) {
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [listening, setListening] = useState<'opening' | 'active' | false>(false)
  const [error, setError] = useState<keyof Copy>()
  const [done, setDone] = useState(false)
  const recognizer = useRef<Recognition | null>(null)
  const timeout = useRef<number>(undefined)
  const word = words[index]
  const result = Object.hasOwn(results, word) ? results[word] : undefined
  const missed = words.filter(item => Object.hasOwn(results, item) && results[item].outcome !== 'correct')
  const count = Object.keys(results).length

  const stop = () => {
    clearTimeout(timeout.current)
    const recognition = recognizer.current
    recognizer.current = null
    if (recognition) {
      recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null
      recognition.abort()
    }
  }
  useEffect(() => {
    window.addEventListener('pagehide', stop)
    return () => {
      stop()
      window.removeEventListener('pagehide', stop)
    }
  }, [])

  const listen = () => {
    if (!SpeechRecognition || recognizer.current) return
    window.speechSynthesis?.cancel()
    setError(undefined)
    setListening('opening')
    const recognition = new SpeechRecognition()
    recognizer.current = recognition
    recognition.lang = accent
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    const finish = (outcome?: Outcome, heard = '', issue?: keyof Copy) => {
      if (recognizer.current !== recognition) return
      stop()
      setListening(false)
      setError(issue)
      if (outcome) {
        setResults(previous => ({ ...previous, [word]: { outcome, heard } }))
        record(word, outcome)
      }
    }
    recognition.onstart = () => {
      setListening('active')
      clearTimeout(timeout.current)
      timeout.current = window.setTimeout(() => finish('unclear'), 12000)
    }
    recognition.onend = () => finish('unclear')
    recognition.onerror = ({error: code}) => {
      if (code === 'no-speech') finish('unclear')
      else finish(undefined, '', code === 'network' ? 'network' : code === 'language-not-supported' ? 'unsupported' : 'micError')
    }
    recognition.onresult = event => {
      const heard = event.results[0]?.[0]?.transcript.trim() ?? ''
      finish(!heard ? 'unclear' : normalize(heard) === normalize(word) ? 'correct' : 'retry', heard)
    }
    timeout.current = window.setTimeout(() => finish(undefined, '', 'micError'), 45000)
    try {
      recognition.start()
    } catch {
      finish(undefined, '', 'micError')
    }
  }

  return <div className="practice">
    {done ? <>
      <div className="practice-emblem"><Check size={38} /></div>
      <h3>{t.sessionsDone}</h3>
      <p>{t.correct} <strong>{count - missed.length} / {words.length}</strong></p>
      {missed.length > 0 && <button className="button primary" onClick={() => restart(missed)}><RotateCcw size={18} />{t.difficult}</button>}
    </> : <>
      <div className="progress-label"><span>{t.practiced}</span><strong>{count} / {words.length}</strong></div>
      <progress value={count} max={words.length} aria-label={t.practiced} />
      <p className="prompt-word" lang="en">{word}</p>
      {SpeechRecognition ? <>
        <button className={`mic ${listening ? 'listening' : ''}`} disabled={!!listening}
          aria-label={result ? t.retry : t.say} onClick={listen}><Mic size={33} /></button>
        <p className="mic-label" role="status">{listening === 'opening' ? t.micOpening : listening ? t.listening : result ? t.retry : t.say}</p>
      </> : <p role="status">{t.unsupported}</p>}
      {error && <p role="alert" className="feedback retry">{t[error]}</p>}
      {result && !listening && <div className={`feedback ${result.outcome}`} role="status">
        <strong>{t[result.outcome]}</strong>
        {result.outcome !== 'correct' && <p>{t.expected} <b lang="en">{word}</b></p>}
        {result.heard && <p>{t.heard} <b lang="en">“{result.heard}”</b></p>}
      </div>}
      <div className="practice-controls">
        <button className="button secondary" disabled={!!listening} onClick={() => speak(word)}><Volume2 size={18} />{t.listen}</button>
        {result && <button className="button primary" disabled={!!listening} onClick={() => {
          setError(undefined)
          if (index + 1 === words.length) {
            complete()
            setDone(true)
          } else setIndex(index + 1)
        }}>{index + 1 === words.length ? t.finish : t.next}<ArrowRight size={18} /></button>}
      </div>
      <p className="fineprint">{t.limit}<br />{t.privacy}</p>
    </>}
  </div>
}
