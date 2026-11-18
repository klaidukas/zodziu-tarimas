import { useEffect, useRef, useState } from 'react'
import { Plus, Video } from 'lucide-react'
import { scanner, unique, type Detection, type ScanMode } from './scanner'
import { learningLanguage } from './learning'
import type { Copy, TextKey } from './strings'

export function Live({ t, saved, add, photo, mode }: { t: Copy; saved: string[]; add: (words: string[]) => void; photo: () => void; mode: ScanMode }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<TextKey>('opening')
  const [frame, setFrame] = useState<{ hits: Detection[]; width: number; height: number }>()
  const [ready, setReady] = useState(false)
  const [failure, setFailure] = useState<TextKey>()

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const player = video.current!
    let stream: MediaStream | undefined
    let timer: number | undefined
    let expiry: number | undefined
    let revision = 0
    const invalidateFrame = () => {
      revision++
      clearTimeout(expiry)
      setFrame(undefined)
    }
    const release = () => {
      controller.abort()
      clearTimeout(timer)
      clearTimeout(expiry)
      stream?.getTracks().forEach(track => track.stop())
      player.srcObject = null
    }
    const fail = (message: TextKey) => {
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
        const { recognize } = await scanner(true, mode, () => {}, signal)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        const scan = async () => {
          if (signal.aborted) return
          if (!document.hidden && player.readyState >= 2 && player.videoWidth && player.videoHeight) {
            const { videoWidth: width, videoHeight: height } = player
            const capturedRevision = revision
            const scale = Math.min(1, 1120 / Math.max(width, height))
            canvas.width = Math.round(width * scale)
            canvas.height = Math.round(height * scale)
            context.drawImage(player, 0, 0, canvas.width, canvas.height)
            const hits = await recognize(canvas)
            if (signal.aborted) return
            if (revision === capturedRevision && width === player.videoWidth && height === player.videoHeight) {
              // The SVG uses intrinsic video coordinates so its letterboxing matches the preview.
              const scaleX = width / canvas.width
              const scaleY = height / canvas.height
              const mapped = hits.flatMap(({ text, box }) => {
                const x0 = Math.max(0, box.x0 * scaleX)
                const x1 = Math.min(width, box.x1 * scaleX)
                const y0 = Math.max(0, box.y0 * scaleY)
                const y1 = Math.min(height, box.y1 * scaleY)
                return x1 > x0 && y1 > y0 ? [{ text, box: { x0, x1, y0, y1 } }] : []
              })
              clearTimeout(expiry)
              setFrame(mapped.length ? { hits: mapped, width, height } : undefined)
              if (mapped.length) expiry = window.setTimeout(() => setFrame(undefined), 2400)
              setStatus('waiting')
            }
          }
          timer = window.setTimeout(() => void scan().catch(() => fail('scanError')), 1100)
        }
        setStatus('scanning')
        await scan()
      } catch {
        fail('scanError')
      }
    }
    void start()
    player.addEventListener('resize', invalidateFrame)
    player.addEventListener('waiting', invalidateFrame)
    window.addEventListener('orientationchange', invalidateFrame)
    document.addEventListener('visibilitychange', invalidateFrame)
    window.addEventListener('pagehide', release)
    return () => {
      player.removeEventListener('resize', invalidateFrame)
      player.removeEventListener('waiting', invalidateFrame)
      window.removeEventListener('orientationchange', invalidateFrame)
      document.removeEventListener('visibilitychange', invalidateFrame)
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
      {frame && <svg className="ocr-overlay" viewBox={`0 0 ${frame.width} ${frame.height}`}
        preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {frame.hits.map(({ text, box }, index) => <rect key={index} className="ocr-box"
          x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0}
          vectorEffect="non-scaling-stroke" data-saved={saved.includes(text)}
          onClick={() => { if (!saved.includes(text)) add([text]) }}>
          <title lang={learningLanguage.lang}>{text}</title>
        </rect>)}
      </svg>}
    </div>
    {failure ? <><p role="alert">{t[failure]}</p><button className="button primary" onClick={photo}>{t.upload}</button></> :
      <>
        {(!words.length || status !== 'waiting') && <p role="status" className="muted">{t[status]}</p>}
        <div className="chips live-chips">
          {words.map(word => <button className="single-chip" lang={learningLanguage.lang} key={word} disabled={saved.includes(word)}
            onClick={() => add([word])}><Plus size={16} />{word}</button>)}
        </div>
        <button className="button primary" disabled={!words.some(word => !saved.includes(word))}
          onClick={() => add(words)}><Plus size={19} />{t.addAll}</button>
      </>}
  </>
}
