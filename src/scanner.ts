import type { Bbox, Worker } from 'tesseract.js'
import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import modelUrl from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url'

export type Detection = { text: string; box: Bbox }

export function tokens(text: string): string[] {
  return (text.normalize('NFC').match(/[\p{L}\p{M}\p{N}'’\-]+/gu) ?? [])
    .map(word => word.replace(/^['’\-]+|['’\-]+$/g, '').replaceAll('’', "'"))
    .filter(word => /^(?:[ai]|[a-z]+(?:['-][a-z]+)*)$/i.test(word) && (word.length > 1 || /^[ai]$/i.test(word)))
}

export function unique(words: string[]) {
  return [...new Set(words.map(word => word.toLowerCase()))]
}

function untilAbort<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    void task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export async function scanner(live: boolean, logger: (message: { status: string; progress: number }) => void, signal: AbortSignal) {
  const { createWorker, PSM } = await import('tesseract.js')
  let worker: Worker | undefined
  let stopped = false
  const stop = () => {
    signal.removeEventListener('abort', stop)
    if (worker && !stopped) {
      stopped = true
      void worker.terminate()
    }
  }
  signal.throwIfAborted()
  const absolute = (url: string) => new URL(url, document.baseURI).href
  const setup = new Promise<Worker>((resolve, reject) => {
    let initialized = false
    let failed = false
    const fail = (error: unknown) => {
      failed = true
      clearTimeout(timer)
      reject(error)
    }
    const timer = window.setTimeout(() => fail(new Error('OCR initialization timed out')), 45000)
    void createWorker('eng', 1, {
      logger,
      errorHandler: error => { if (!initialized) fail(error) },
      workerBlobURL: false,
      workerPath: absolute(workerUrl),
      corePath: absolute(coreUrl),
      langPath: new URL('.', absolute(modelUrl)).href,
    }).then(created => {
      clearTimeout(timer)
      initialized = true
      if (failed || signal.aborted) void created.terminate()
      else resolve(created)
    }, fail)
  })
  worker = await untilAbort(setup, signal)
  if (signal.aborted) stop()
  signal.throwIfAborted()
  signal.addEventListener('abort', stop, { once: true })
  try {
    await untilAbort(worker.setParameters({ tessedit_pageseg_mode: live ? PSM.SPARSE_TEXT : PSM.AUTO }), signal)
    signal.throwIfAborted()
  } catch (error) {
    stop()
    throw error
  }
  return {
    recognize: (canvas: HTMLCanvasElement) => untilAbort(worker.recognize(canvas, {}, { blocks: live }), signal),
    stop,
  }
}

export async function photoCanvas(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 2200 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}
