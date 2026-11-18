import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, AudioLines, BookOpen, Camera, Check, ImagePlus, Mic, MoreHorizontal, Settings2, Sparkles, Trash2, Video, Volume2, X } from 'lucide-react'
import { strings, type Copy } from './strings'
import { photoCanvas, scanner, tokens, unique } from './scanner'
import { Live } from './Live'
import { Practice, type Outcome } from './Practice'
import './style.css'

type Word = { text: string; learned: boolean }
type Data = {
  words: Word[]
  progress: Record<string, Outcome>
  sessions: number
  language: keyof typeof strings
  theme: 'system' | 'light' | 'dark'
  accent: 'en-GB' | 'en-US'
}
const initial: Data = { words: [], progress: {}, sessions: 0, language: 'lt', theme: 'system', accent: 'en-GB' }
const storageKey = 'zodziu-tarimas-v1'
function load(): Data {
  try {
    return { ...initial, ...JSON.parse(localStorage.getItem(storageKey) ?? '{}') }
  } catch {
    return initial
  }
}

type Panel = 'photo' | 'live' | 'settings' | 'clear' | 'word' | 'practice'
function DialogBody({ dialog, title, close, children, dismiss }: {
  dialog: React.RefObject<HTMLDialogElement | null>; title: string; close: string; children: ReactNode;
  dismiss: React.RefObject<(() => void) | undefined>
}) {
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [dialog])
  return <dialog ref={dialog} aria-labelledby="dialog-title" onCancel={event => {
    event.preventDefault()
    dismiss.current?.()
  }}>
    <header className="dialog-header">
      <h2 id="dialog-title">{title}</h2>
      <button type="button" className="icon-button" aria-label={close} onClick={() => dismiss.current?.()}><X size={21} /></button>
    </header>
    {children}
  </dialog>
}

function App() {
  const [data, setData] = useState(load)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [speaking, setSpeaking] = useState('')
  const [photoStatus, setPhotoStatus] = useState<keyof Copy>()
  const [percent, setPercent] = useState(0)
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState<keyof Copy>()
  const [session, setSession] = useState<{ id: number; words: string[] }>({ id: 0, words: [] })
  const photoJob = useRef<AbortController | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const dismiss = useRef<() => void>(undefined)
  const t = strings[data.language]
  const saved = data.words.map(word => word.text)
  const difficult = saved.filter(word => Object.hasOwn(data.progress, word) && data.progress[word] !== 'correct')
  const chosen = data.words.find(word => word.text === selected)

  useEffect(() => {
    document.documentElement.lang = data.language
    document.documentElement.dataset.theme = data.theme
    try {
      localStorage.setItem(storageKey, JSON.stringify(data))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [data])

  useEffect(() => {
    const release = () => {
      photoJob.current?.abort()
      window.speechSynthesis?.cancel()
    }
    window.addEventListener('pagehide', release)
    return () => window.removeEventListener('pagehide', release)
  }, [])

  const close = () => {
    photoJob.current?.abort()
    photoJob.current = null
    setPhotoStatus(undefined)
    setPanel(null)
  }
  dismiss.current = close

  const add = (words: string[]) => {
    const incoming = unique(words)
    const count = incoming.filter(word => !saved.includes(word)).length
    setNotice(count ? `${t.added} · ${count}` : t.already)
    setData(current => {
      const existing = new Set(current.words.map(word => word.text))
      return { ...current, words: [...current.words, ...incoming.filter(word => !existing.has(word)).map(text => ({ text, learned: false }))] }
    })
  }
  const scanPhoto = async (file: File) => {
    photoJob.current?.abort()
    const controller = new AbortController()
    const { signal } = controller
    photoJob.current = controller
    setPhotoStatus('loading')
    setPercent(0)
    try {
      const canvas = await photoCanvas(file)
      const { recognize, stop } = await scanner(false, message => {
        if (message.status === 'recognizing text' && !signal.aborted) setPercent(message.progress)
      }, signal)
      try {
        setPhotoStatus('scanning')
        const { data: result } = await recognize(canvas)
        if (signal.aborted) return
        const words = tokens(result.text)
        if (words.length) {
          add(words)
          close()
        } else setPhotoStatus('noWords')
      } finally {
        stop()
      }
    } catch {
      if (!signal.aborted) setPhotoStatus('scanError')
    } finally {
      if (photoJob.current === controller) photoJob.current = null
    }
  }

  const speak = (word: string, slow = false) => {
    const synth = window.speechSynthesis
    if (!synth || !window.SpeechSynthesisUtterance) return setNotice(t.noVoice)
    synth.cancel()
    const voice = new SpeechSynthesisUtterance(word)
    const voices = synth.getVoices()
    const english = voices.filter(item => /^en(?:[-_]|$)/i.test(item.lang))
    const preferred = english.find(item => item.lang.replace('_', '-') === data.accent) ?? english[0]
    if (voices.length && !preferred) return setNotice(t.noVoice)
    if (preferred) voice.voice = preferred
    voice.lang = preferred?.lang ?? data.accent
    voice.rate = slow ? 0.65 : 0.95
    utteranceRef.current = voice
    setSpeaking(word)
    setNotice('')
    voice.onend = () => {
      if (utteranceRef.current !== voice) return
      utteranceRef.current = null
      setSpeaking('')
    }
    voice.onerror = event => {
      if (utteranceRef.current !== voice) return
      utteranceRef.current = null
      setSpeaking('')
      if (!['interrupted', 'canceled'].includes(event.error)) setNotice(t.noVoice)
    }
    synth.speak(voice)
  }

  const start = (words: string[]) => {
    const queue = [...words]
    for (let index = queue.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1))
      const word = queue[index]
      queue[index] = queue[other]
      queue[other] = word
    }
    setSession(current => ({ id: current.id + 1, words: queue }))
    setPanel('practice')
  }
  const edit = () => {
    const text = draft.trim().toLowerCase().replaceAll('’', "'")
    if (tokens(text)[0] !== text) return setEditError('invalid')
    if (text !== selected && saved.includes(text)) return setEditError('duplicate')
    setData(current => ({ ...current, words: current.words.map(word => word.text === selected ? { ...word, text } : word) }))
    close()
  }
  const titles = { photo: t.photo, live: t.live, settings: t.settings, clear: t.clear, word: t.options, practice: t.practice }
  const busy = photoStatus === 'loading' || photoStatus === 'scanning'
  const fileInput = (capture: boolean) => <label className={`button file-button ${capture ? 'primary' : 'secondary'}`}>
    {capture ? <Camera size={20} /> : <ImagePlus size={20} />}{capture ? t.take : t.upload}
    <input type="file" accept="image/*" capture={capture ? 'environment' : undefined} disabled={busy}
      aria-label={capture ? t.take : t.upload} onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void scanPhoto(file)
      }} />
  </label>

  return <>
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand"><span className="brand-icon"><AudioLines size={21} /></span>{t.name}</div>
        <button className="icon-button settings-button" aria-label={t.settings} onClick={() => setPanel('settings')}><Settings2 size={21} /></button>
      </div>
    </header>
    <main className="shell">
      <section className="hero">
        <div className="hero-copy"><h1>{t.title}</h1><p>{t.intro}</p></div>
        <div className="sound-art" aria-hidden="true">
          <span className="orbit orbit-one" /><span className="orbit orbit-two" />
          <div className="sound-tile"><AudioLines size={68} strokeWidth={1.7} /></div>
          <Sparkles className="star star-one" size={27} /><Sparkles className="star star-two" size={17} />
          <span className="art-dot" />
        </div>
      </section>
      <div className="actions">
        <button className="action action-photo" onClick={() => setPanel('photo')}>
          <span className="action-icon"><Camera size={24} /></span><ArrowUpRight className="action-arrow" size={19} />
          <strong>{t.photo}</strong><span>{t.photoHint}</span>
        </button>
        <button className="action action-live" onClick={() => setPanel('live')}>
          <span className="action-icon"><Video size={24} /></span><ArrowUpRight className="action-arrow" size={19} />
          <strong>{t.live}</strong><span>{t.liveHint}</span>
        </button>
      </div>
      <section className="word-section" aria-labelledby="words-title">
        <div className="section-header">
          <h2 id="words-title">{t.words} <span className="count">{saved.length}</span></h2>
          {saved.length > 0 && <button className="text-button" onClick={() => setPanel('clear')}><Trash2 size={16} />{t.clear}</button>}
        </div>
        {saved.length ? <>
          <ul className="chips">
            {data.words.map(({text, learned}) => <li key={text} className={`chip ${speaking === text ? 'speaking' : ''} ${learned ? 'learned' : ''}`}>
              <button className="say-word" onClick={() => speak(text)} aria-label={`${t.listen}: ${text}`}>
                {learned && <Check size={16} aria-label={t.learned} />}<span lang="en">{text}</span><Volume2 size={17} />
              </button>
              <button className="chip-options" onClick={() => {
                setSelected(text); setDraft(text); setEditError(undefined); setPanel('word')
              }} aria-label={`${t.options}: ${text}`}><MoreHorizontal size={18} /></button>
            </li>)}
          </ul>
          <div className="home-practice">
            <button className="button primary" onClick={() => start(saved)}><Mic size={20} />{t.practice}</button>
            {difficult.length > 0 && <button className="button secondary" onClick={() => start(difficult)}>{t.difficult} · {difficult.length}</button>}
          </div>
        </> : <div className="empty">
          <span className="empty-icon"><BookOpen size={25} /></span><strong>{t.empty}</strong><p>{t.emptyHint}</p>
        </div>}
      </section>
      <footer><span className="privacy-dot" />{t.local}</footer>
      {(notice || storageError) && <p className="notice" role="status">{storageError ? t.storage : notice}
        {notice && <button className="icon-button" aria-label={t.close} onClick={() => setNotice('')}><X size={17} /></button>}</p>}
    </main>
    {panel && <DialogBody key={panel} dialog={dialog} dismiss={dismiss} title={titles[panel]} close={t.close}>
      {panel === 'photo' && <>
        <p className="muted">{t.photoHelp}</p>
        <div className="stack">{fileInput(true)}{fileInput(false)}</div>
        {photoStatus && <p role="status">{t[photoStatus]}</p>}
        {photoStatus === 'scanning' && <progress max={1} value={percent} aria-label={t.scanning} />}
      </>}
      {panel === 'live' && <Live t={t} saved={saved} add={add} photo={() => setPanel('photo')} />}
      {panel === 'clear' && <>
        <p>{t.clearAsk}</p><p className="muted">{t.clearNote}</p>
        <button className="button danger" onClick={() => { setData(current => ({ ...current, words: [] })); setNotice(''); close() }}>{t.clear}</button>
      </>}
      {panel === 'word' && chosen && <>
        <form className="edit-form" onSubmit={event => { event.preventDefault(); edit() }}>
          <label>{t.edit}<input value={draft} lang="en" autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={event => setDraft(event.target.value)} /></label>
          {editError && <p role="alert">{t[editError]}</p>}
          <button className="button primary">{t.save}</button>
        </form>
        <div className="stack word-tools">
          <button className="button secondary" onClick={() => speak(selected, true)}><Volume2 size={18} />{t.slow}</button>
          <button className="button secondary" onClick={() => {
            setData(current => ({ ...current, words: current.words.map(word => word.text === selected ? { ...word, learned: !word.learned } : word) }))
            close()
          }}><Check size={18} />{chosen.learned ? t.unmark : t.mark}</button>
          <button className="button danger" onClick={() => {
            setData(current => ({ ...current, words: current.words.filter(word => word.text !== selected) }))
            close()
          }}><Trash2 size={18} />{t.remove}</button>
        </div>
      </>}
      {panel === 'settings' && <div className="stack">
        <label>{t.language}<select value={data.language} onChange={event => setData({ ...data, language: event.target.value as Data['language'] })}>
          <option value="lt" lang="lt">Lietuvių</option><option value="en" lang="en">English</option>
        </select></label>
        <label>{t.accent}<select value={data.accent} onChange={event => setData({ ...data, accent: event.target.value as Data['accent'] })}>
          <option value="en-GB">English (UK)</option><option value="en-US">English (US)</option>
        </select></label>
        <label>{t.theme}<select value={data.theme} onChange={event => setData({ ...data, theme: event.target.value as Data['theme'] })}>
          <option value="system">{t.system}</option><option value="light">{t.light}</option><option value="dark">{t.dark}</option>
        </select></label>
        <h3>{t.progress}</h3>
        <dl className="stats">
          <div><dt>{t.practiced}</dt><dd>{Object.keys(data.progress).length}</dd></div>
          <div><dt>{t.correct}</dt><dd>{Object.values(data.progress).filter(outcome => outcome === 'correct').length}</dd></div>
          <div><dt>{t.retry}</dt><dd>{Object.values(data.progress).filter(outcome => outcome !== 'correct').length}</dd></div>
          <div><dt>{t.completed}</dt><dd>{data.sessions}</dd></div>
        </dl>
      </div>}
      {panel === 'practice' && <Practice key={session.id} t={t} words={session.words} accent={data.accent} speak={speak} restart={start}
        record={(word, outcome) => setData(current => ({ ...current, progress: { ...current.progress, [word]: outcome } }))}
        complete={() => setData(current => ({ ...current, sessions: current.sessions + 1 }))} />}
      {notice === t.noVoice && <p role="alert">{notice}</p>}
    </DialogBody>}
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch(console.warn) })
}
