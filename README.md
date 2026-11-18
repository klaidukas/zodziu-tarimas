# Žodžių tarimas

A Lithuanian-first app for learning to pronounce English vocabulary. Photograph or upload a vocabulary sheet, or scan it with the live camera. Tap a word to hear it, or open its options to listen slowly, fix it, mark it as learned, or delete it. Practice shows what the browser recognized and keeps your latest result for each word and your completed session count.

## Run locally

Install Node.js 22 or later, then run:

```sh
npm ci
npm run dev
```

Open the address Vite prints. Use localhost on your computer. For physical phone testing, use an HTTPS deployment. A plain HTTP address on your Wi-Fi network generally cannot request camera or microphone access.

```sh
npm run build
npm run preview
```

The production build enables installation and offline access to the app and OCR after its service worker finishes installing. The English OCR model is served with the app. Speech features depend on the browser and installed voices. The browser or OS controls how to install it. On iPhone, use Safari’s Share menu and **Add to Home Screen**.

## Deploy for free

- **Netlify** — Import the repository and deploy with the included configuration, or build locally and upload the contents of `dist`.
- **Vercel** — Import the repository as a Vite project. Use `npm run build` and output directory `dist`.
- **GitHub Pages** — Set **Settings → Pages → Source** to **GitHub Actions**. The included workflow publishes on pushes to `main` and can also be run manually. Vite uses relative paths for project sites.

Open the deployment over HTTPS for camera and microphone access. No backend, accounts, keys, or paid APIs are required.

## Browser support and privacy

- OCR processes images and video frames on the device. Printed English text in good lighting works best. The app keeps scan order, removes duplicates and filters obvious noise. English OCR can still include words from adjacent translations, especially when both languages use unaccented Latin text. Use chip options to correct the list.
- The browser supplies English playback voices. Available voices vary by device. If the preferred UK or US voice is missing, the app can use another English voice.
- Speech recognition availability and permissions vary across browsers and devices. Try a recent Chrome or Safari if your browser cannot recognize speech. Recognition may require internet or send audio to a service chosen by the browser. Results indicate word matching only and give no pronunciation accuracy score.
- Vocabulary, settings, and progress are saved in this browser profile. Clearing the list keeps historical practice totals. Clearing site data removes saved progress.

## Smoke test

1. Upload a clear picture containing several printed English words and one repeated word. Confirm the word order and deduplication.
2. Play a word, open its options, try slow playback, edit it, mark it as learned, and remove one chip.
3. Open the live camera on an HTTPS origin with a phone. Point it at the sheet, add one detection, then add all remaining detections. Close the preview and check that the camera indicator turns off.
4. Start practice. Try the expected word, a different word, and silence. Verify the feedback, retry, advance, finish, and try only difficult words.
5. Reload to verify vocabulary, progress, language, voice preference, and theme. Check the camera and speech permission-denied paths in a separate browser profile.
