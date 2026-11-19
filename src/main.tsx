import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, AudioLines, BookOpen, Camera, Check, ImagePlus, Mic, MoreHorizontal, Settings2, Sparkles, Trash2, Video, Volume2, X } from 'lucide-react'
import { defaultUiLanguage, strings, uiLanguages, type TextKey, type UiLanguage } from './strings'
import { learningLanguage } from './learning'
import { photoCanvas, scanner, tokens, unique, type ScanMode } from './scanner'
import { Live } from './Live'
import { Practice, type Outcome } from './Practice'
import { chooseVoice, savedProfile, voiceChoices, voiceLabel } from './voices'
import './style.css'

type Word = { text: string; learned: boolean }
type Data = {
  words: Word[]
  progress: Record<string, Outcome>
  sessions: number
  language: UiLanguage
  theme: 'system' | 'light' | 'dark'
  accent: typeof learningLanguage.speechLocales[number]
  voice: string
  slowRate: number
  scanMode: ScanMode
}
const initial: Data = {
  words: [], progress: {}, sessions: 0, language: defaultUiLanguage, theme: 'system',
  accent: learningLanguage.speechLocales[0], voice: '', slowRate: 65, scanMode: 'auto',
}
const storageKey = 'zodziu-tarimas-v1'
function load(): Data {
  try {
    const data = { ...initial, ...JSON.parse(localStorage.getItem(storageKey) ?? '{}') }
    if (!Object.hasOwn(uiLanguages, data.language)) data.language = defaultUiLanguage
    return data
  } catch {
    return initial
  }
}

type Panel = 'photo' | 'live' | 'settings' | 'bulk' | 'word' | 'practice'
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
  const [notice, setNotice] = useState<{ key: 'added' | 'already' | 'removedWords' | 'noVoice' | 'voiceOffline'; count?: number }>()
  const [storageError, setStorageError] = useState(false)
  const [speaking, setSpeaking] = useState('')
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [photoStatus, setPhotoStatus] = useState<TextKey>()
  const [percent, setPercent] = useState(0)
  const [selected, setSelected] = useState('')
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(() => new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState<TextKey>()
  const [session, setSession] = useState<{ id: number; words: string[] }>({ id: 0, words: [] })
  const photoJob = useRef<AbortController | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const dismiss = useRef<() => void>(undefined)
  const t = strings[data.language]
  const saved = data.words.map(word => word.text)
  const difficult = saved.filter(word => Object.hasOwn(data.progress, word) && data.progress[word] !== 'correct')
  const chosen = data.words.find(word => word.text === selected)
  const voices = voiceChoices(availableVoices, data.accent)
  const selectedVoice = savedProfile(data.voice, availableVoices)
  const previewWord = saved[0] ?? learningLanguage.previewWord
  const noticeText = notice && (notice.count === undefined ? t[notice.key] : `${t[notice.key]} · ${notice.count}`)

  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) return
    const refresh = () => setAvailableVoices([...synth.getVoices()])
    const refreshWhenVisible = () => { if (!document.hidden) refresh() }
    refresh()
    synth.addEventListener('voiceschanged', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      synth.removeEventListener('voiceschanged', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = data.language
    document.documentElement.dataset.theme = data.theme
    document.title = t.name
    try {
      localStorage.setItem(storageKey, JSON.stringify(data))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [data, t.name])

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
    setNotice(count ? { key: 'added', count } : { key: 'already' })
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
      const { recognize, stop } = await scanner(false, data.scanMode, message => {
        if (message.status === 'recognizing text' && !signal.aborted) setPercent(message.progress)
      }, signal)
      try {
        setPhotoStatus('scanning')
        const hits = await recognize(canvas)
        if (signal.aborted) return
        const words = hits.map(hit => hit.text)
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
    if (!synth || !window.SpeechSynthesisUtterance) return setNotice({ key: 'noVoice' })
    const deviceVoices = synth.getVoices()
    const preferred = chooseVoice(deviceVoices, data.accent, data.voice, navigator.onLine)
    if (!preferred && deviceVoices.length) return setNotice({ key: navigator.onLine ? 'noVoice' : 'voiceOffline' })
    const fallback = preferred && chooseVoice(
      deviceVoices.filter(voice => voice.voiceURI !== preferred.voiceURI), data.accent, data.voice, false,
    )
    utteranceRef.current = null
    if (synth.speaking || synth.pending) synth.cancel()
    setSpeaking(word)
    setNotice(undefined)
    const play = (deviceVoice?: SpeechSynthesisVoice, retry?: SpeechSynthesisVoice) => {
      const voice = new SpeechSynthesisUtterance(word)
      if (deviceVoice) voice.voice = deviceVoice
      voice.lang = deviceVoice?.lang.replaceAll('_', '-') ?? data.accent
      voice.rate = slow ? data.slowRate / 100 : 1
      utteranceRef.current = voice
      const finish = (error?: string) => {
        if (utteranceRef.current !== voice) return
        if (retry && (error === 'network' || error === 'voice-unavailable' || error === 'synthesis-failed')) {
          return play(retry)
        }
        utteranceRef.current = null
        setSpeaking('')
        if (error && !['interrupted', 'canceled'].includes(error)) setNotice({ key: error === 'network' ? 'voiceOffline' : 'noVoice' })
      }
      voice.onend = () => finish()
      voice.onerror = event => finish(event.error)
      try {
        synth.speak(voice)
      } catch {
        finish('synthesis-failed')
      }
    }
    play(preferred, fallback)
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
  const titles = { photo: t.photo, live: t.live, settings: t.settings, bulk: t.manageWords, word: t.options, practice: t.practice }
  const busy = photoStatus === 'loading' || photoStatus === 'scanning'
  const slowSpeed = <label className="speed-field">
    <span>{t.slowSpeed} <strong>{data.slowRate}%</strong></span>
    <input type="range" min="45" max="95" step="5" value={data.slowRate}
      aria-label={t.slowSpeed} aria-valuetext={`${data.slowRate}%`}
      onChange={event => {
        const slowRate = event.target.valueAsNumber
        setData(current => ({ ...current, slowRate }))
      }} />
  </label>
  const scanChoice = <label className="scan-choice">{t.sheetLanguage}
    <select value={data.scanMode} disabled={busy} onChange={event => {
      const scanMode = event.target.value as ScanMode
      setData(current => ({ ...current, scanMode }))
    }}>
      <option value="auto">{t.autoDetect}</option>
      <option value="mixed">{t.mixedSheet}</option>
      <option value="english">{t.englishSheet}</option>
    </select>
  </label>
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
        <button className="icon-button settings-button" aria-label={t.settings} onClick={() => {
          setAvailableVoices(window.speechSynthesis?.getVoices() ?? [])
          setPanel('settings')
        }}><Settings2 size={21} /></button>
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
          {saved.length > 0 && <button className="text-button" onClick={() => {
            setBulkSelection(new Set()); setBulkConfirm(false); setPanel('bulk')
          }}><Trash2 size={16} />{t.manageWords}</button>}
        </div>
        {saved.length ? <>
          <ul className="chips">
            {data.words.map(({text, learned}) => <li key={text} className={`chip ${speaking === text ? 'speaking' : ''} ${learned ? 'learned' : ''}`}>
              <button className="say-word" onClick={() => speak(text)} aria-label={`${t.listen}: ${text}`}>
                {learned && <Check size={16} aria-label={t.learned} />}<span lang={learningLanguage.lang}>{text}</span><Volume2 size={17} />
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
      {(notice || storageError) && <p className="notice" role="status">{storageError ? t.storage : noticeText}
        {notice && <button className="icon-button" aria-label={t.close} onClick={() => setNotice(undefined)}><X size={17} /></button>}</p>}
    </main>
    {panel && <DialogBody key={panel} dialog={dialog} dismiss={dismiss} title={titles[panel]} close={t.close}>
      {panel === 'photo' && <>
        {scanChoice}
        <p className="muted">{t.photoHelp}</p>
        <div className="stack">{fileInput(true)}{fileInput(false)}</div>
        {photoStatus && <p role="status">{t[photoStatus]}</p>}
        {photoStatus === 'scanning' && <progress max={1} value={percent} aria-label={t.scanning} />}
      </>}
      {panel === 'live' && <>{scanChoice}<Live key={data.scanMode} mode={data.scanMode} t={t} saved={saved} add={add} photo={() => setPanel('photo')} /></>}
      {panel === 'bulk' && <>
        {bulkConfirm ? <>
          <p>{bulkSelection.size === saved.length ? t.clearAsk : t.removeSelectedAsk} <b>({bulkSelection.size})</b></p>
          <p className="muted">{t.clearNote}</p>
          <div className="bulk-actions">
            <button className="button secondary" onClick={() => setBulkConfirm(false)}>{t.back}</button>
            <button className="button danger" onClick={() => {
              setData(current => ({ ...current, words: current.words.filter(word => !bulkSelection.has(word.text)) }))
              setNotice({ key: 'removedWords', count: bulkSelection.size })
              close()
            }}>{t.remove}</button>
          </div>
        </> : <>
          <div className="bulk-actions">
            <button className="button secondary" onClick={() => setBulkSelection(
              bulkSelection.size === saved.length ? new Set() : new Set(saved)
            )}>{bulkSelection.size === saved.length ? t.clearSelection : t.selectAll}</button>
            <button className="button danger" disabled={!bulkSelection.size} onClick={() => setBulkConfirm(true)}>
              <Trash2 size={17} />{t.removeSelected} · {bulkSelection.size}
            </button>
          </div>
          <div className="chips" role="group" aria-label={t.manageWords}>
            {saved.map(text => <button type="button" key={text} className="single-chip bulk-chip" lang={learningLanguage.lang}
              aria-pressed={bulkSelection.has(text)} onClick={() => setBulkSelection(previous => {
                const next = new Set(previous)
                if (next.has(text)) next.delete(text)
                else next.add(text)
                return next
              })}>{bulkSelection.has(text) && <Check size={16} />}{text}</button>)}
          </div>
        </>}
      </>}
      {panel === 'word' && chosen && <>
        <form className="edit-form" onSubmit={event => { event.preventDefault(); edit() }}>
          <label>{t.edit}<input value={draft} lang={learningLanguage.lang} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={event => setDraft(event.target.value)} /></label>
          {editError && <p role="alert">{t[editError]}</p>}
          <button className="button primary">{t.save}</button>
        </form>
        <div className="stack word-tools">
          {slowSpeed}
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
        <label>{t.language}<select value={data.language} onChange={event => {
          const language = event.target.value as UiLanguage
          setData(current => ({ ...current, language }))
        }}>
          {Object.entries(uiLanguages).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
        </select></label>
        <label>{t.accent}<select value={data.accent} onChange={event => setData({ ...data, accent: event.target.value as Data['accent'] })}>
          {learningLanguage.speechLocales.map(locale => <option key={locale} value={locale}>{t.voiceLocales[locale]}</option>)}
        </select></label>
        <label>{t.voiceName}<select value={voices.some(voice => voice.id === selectedVoice) ? selectedVoice : ''} onChange={event => {
          const voice = event.target.value
          setData(current => ({ ...current, voice }))
        }}>
          <option value="">{t.autoVoice}</option>
          {voices.map(voice => <option key={voice.id} value={voice.id}>
            {voiceLabel(voice, t)}{voice.options.some(option => option.localService) ? '' : ` · ${t.onlineVoice}`}
          </option>)}
        </select></label>
        <p className="muted">{voices.length ? t.voiceHint : t.voiceUnavailable}</p>
        {slowSpeed}
        <div className="practice-controls voice-preview">
          <button className="button secondary" onClick={() => speak(previewWord)}><Volume2 size={18} />{t.previewVoice}</button>
          <button className="button secondary" onClick={() => speak(previewWord, true)}>{t.slow}</button>
        </div>
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
      {(notice?.key === 'noVoice' || notice?.key === 'voiceOffline') && <p role="alert">{noticeText}</p>}
    </DialogBody>}
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch(console.warn) })
}
