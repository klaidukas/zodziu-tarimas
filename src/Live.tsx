import { useEffect, useRef, useState } from 'react'
import { Plus, Video } from 'lucide-react'
import { scanner, tokens, unique, type Detection } from './scanner'
import type { Copy } from './strings'

export function Live({ t, saved, add, photo }: { t: Copy; saved: string[]; add: (words: string[]) => void; photo: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<keyof Copy>('opening')
  const [frame, setFrame] = useState<{ hits: Detection[]; width: number; height: number }>()
  const [ready, setReady] = useState(false)
  const [failure, setFailure] = useState<keyof Copy>()

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const player = video.current!
    let stream: MediaStream | undefined
    let timer: number | undefined
    const release = () => {
      controller.abort()
      clearTimeout(timer)
      stream?.getTracks().forEach(track => track.stop())
      player.srcObject = null
    }
    const fail = (message: keyof Copy) => {
      if (signal.aborted) return
      release()
      setFailure(message)
    }
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return fail('cameraUnavailable')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })
        if (signal.aborted) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => fail('cameraLost'), { once: true }))
        player.srcObject = stream
        await player.play()
        if (signal.aborted) return
        setReady(true)
        setStatus('loading')
      } catch {
        return fail('cameraError')
      }
      try {
        const { recognize } = await scanner(true, () => {}, signal)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        const scan = async () => {
          if (signal.aborted) return
          if (document.visibilityState === 'visible' && player.readyState >= 2 && player.videoWidth > 0) {
            const scale = Math.min(1, 1120 / Math.max(player.videoWidth, player.videoHeight))
            const width = canvas.width = Math.round(player.videoWidth * scale)
            const height = canvas.height = Math.round(player.videoHeight * scale)
            context.drawImage(player, 0, 0, width, height)
            const { data } = await recognize(canvas)
            if (signal.aborted) return
            const hits = (data.blocks ?? [])
              .flatMap(block => block.paragraphs)
              .flatMap(paragraph => paragraph.lines)
              .flatMap(line => line.words)
              .filter(word => word.confidence >= 55)
              .flatMap(word => tokens(word.text).map(text => ({ text: text.toLowerCase(), box: word.bbox })))
            setFrame({ hits, width, height })
            setStatus('waiting')
          }
          timer = window.setTimeout(() => void scan().catch(() => fail('scanError')), 1600)
        }
        setStatus('scanning')
        await scan()
      } catch {
        fail('scanError')
      }
    }
    void start()
    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [])

  const words = unique(frame?.hits.map(hit => hit.text) ?? [])
  return <>
    <p className="muted">{t.aim}</p>
    <div className="viewfinder" hidden={!!failure}>
      <video ref={video} autoPlay muted playsInline className={ready ? 'ready' : ''} />
      {!ready && <Video size={36} className="camera-placeholder" />}
      {frame?.hits.map(({text, box}, index) => (
        <button key={index} className="ocr-box" title={text} aria-label={text}
          tabIndex={-1} disabled={saved.includes(text)} onClick={() => add([text])}
          style={{
            left: `${100 * box.x0 / frame.width}%`, top: `${100 * box.y0 / frame.height}%`,
            width: `${100 * (box.x1 - box.x0) / frame.width}%`, height: `${100 * (box.y1 - box.y0) / frame.height}%`,
          }} />
      ))}
    </div>
    {failure ? <><p role="alert">{t[failure]}</p><button className="button primary" onClick={photo}>{t.upload}</button></> :
      <>
        {(!words.length || status !== 'waiting') && <p role="status" className="muted">{t[status]}</p>}
        <div className="chips live-chips">
          {words.map(word => <button className="single-chip" key={word} disabled={saved.includes(word)}
            onClick={() => add([word])}><Plus size={16} />{word}</button>)}
        </div>
        <button className="button primary" disabled={!words.some(word => !saved.includes(word))}
          onClick={() => add(words)}><Plus size={19} />{t.addAll}</button>
      </>}
  </>
}
