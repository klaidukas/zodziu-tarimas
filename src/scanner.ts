import type { Bbox, Page, Word, Worker } from 'tesseract.js'
import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import modelUrl from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url'

export type Detection = { text: string; box: Bbox }
export type ScanMode = 'auto' | 'mixed' | 'english'

export function tokens(text: string): string[] {
  return (text.normalize('NFC').match(/[\p{L}\p{M}\p{N}'’\-]+/gu) ?? [])
    .map(word => word.replace(/^['’\-]+|['’\-]+$/g, '').replaceAll('’', "'"))
    .filter(word => /^(?:[ai]|[a-z]+(?:['-][a-z]+)*)$/i.test(word) && (word.length > 1 || /^[ai]$/i.test(word)))
}

export function unique(words: string[]) {
  return [...new Set(words.map(word => word.toLowerCase()))]
}

// Short bracketed transcriptions are evidence of a vocabulary column on a mixed sheet.
const transcription = /^[[(\{][^\s()[\]{}]{1,5}(?:[\])}]|$)/

export function englishDetections(page: Pick<Page, 'blocks'>, mode: ScanMode, isEnglish: (word: string) => boolean): Detection[] {
  const lines = (page.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines))
  const candidates = lines.flatMap(line => line.words.flatMap((word: Word, index) => {
    const value = word.text.replace(/^[|;:.,*“"—]+/, '')
    const bracket = value.search(/[[(\{]/)
    const next = line.words[index + 1]
    const marked = (bracket > 0 && transcription.test(value.slice(bracket))) ||
      (next && transcription.test(next.text) && next.bbox.x0 - word.bbox.x1 <= 1.2 * (word.bbox.y1 - word.bbox.y0))
    const visible = (bracket >= 0 ? value.slice(0, bracket) : value).replace(/[\])}]+$/, '')
    if (!visible || /[\])}]/.test(visible)) return []
    return tokens(visible).map(text => ({ text: text.toLowerCase(), box: word.bbox, confidence: word.confidence, marked }))
  }))
  const markedCount = candidates.filter(item => item.marked && isEnglish(item.text)).length
  const annotated = mode !== 'english' && markedCount >= (mode === 'mixed' ? 2 : 4)
  return candidates
    .filter(({ text, confidence, marked }) =>
      (annotated ? marked && confidence >= 52 : confidence >= (text.length < 3 ? 83 : 65)) && isEnglish(text))
    .map(({ text, box }) => ({ text, box }))
}

function untilAbort<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    void task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export async function scanner(live: boolean, mode: ScanMode, logger: (message: { status: string; progress: number }) => void, signal: AbortSignal) {
  const [{ createWorker, PSM }, isEnglish] = await untilAbort(Promise.all([
    import('tesseract.js'), import('./english').then(module => module.loadEnglish()),
  ]), signal)
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
    await untilAbort(worker.setParameters({ tessedit_pageseg_mode: live || mode !== 'english' ? PSM.SPARSE_TEXT : PSM.AUTO }), signal)
    signal.throwIfAborted()
  } catch (error) {
    stop()
    throw error
  }
  return {
    recognize: async (canvas: HTMLCanvasElement) => {
      const { data } = await untilAbort(worker.recognize(canvas, {}, { blocks: true }), signal)
      return englishDetections(data, mode, isEnglish)
    },
    stop,
  }
}

export async function photoCanvas(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(2200 / Math.max(image.width, image.height), Math.max(1, 1600 / Math.min(image.width, image.height)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    if (scale > 1.1) sharpenText(context, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function sharpenText(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height)
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4
    gray[i] = .299 * image.data[offset] + .587 * image.data[offset + 1] + .114 * image.data[offset + 2]
  }
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x
      const local = (gray[i - 2] + gray[i + 2] + gray[i - 2 * width] + gray[i + 2 * width]) / 4
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = gray[i] + 1.4 * (gray[i] - local)
    }
  }
  context.putImageData(image, 0, 0)
}
