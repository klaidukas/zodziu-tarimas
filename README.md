# Žodžių tarimas

A Lithuanian-first app for learning to pronounce English vocabulary. Photograph or upload a vocabulary sheet, or scan it with the live camera. Tap a word to hear it, or open its options to listen slowly, fix it, mark it as learned, or delete it. Practice shows what the browser recognized and keeps your latest result for each word and your completed session count.

Use **Tvarkyti** to remove several saved words at once, or choose **Pažymėti visus** to clear the list. Before scanning, leave **Kalbos lape** on automatic, or choose English and Lithuanian for a bilingual worksheet or English only for a plain English list.

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

- OCR processes images and video frames on the device. The app filters detections using US and UK English dictionaries. On mixed worksheets with short bracketed pronunciation notes, it uses those notes to identify English entries. Blurred text may still be missed or misread as another English word. Use chip options or bulk selection to correct the list.
- Choose or preview an English voice under **Settings → Pronunciation voice**. Automatic selection favors your preferred accent and gives priority to voices labeled Natural, Enhanced, or Premium within that accent. Available voices vary by browser and device, and online voices may require a connection. Adjust slow playback from 45% to 95% in Settings or a word's options. On iPhone, [Apple's voice settings](https://support.apple.com/en-us/111798) let you download enhanced voices, which the app can offer if Safari exposes them.
- Speech recognition availability and permissions vary across browsers and devices. Try a recent Chrome or Safari if your browser cannot recognize speech. Recognition may require internet or send audio to a service chosen by the browser. Results indicate word matching only and give no pronunciation accuracy score.
- Vocabulary, settings, and progress are saved in this browser profile. Clearing the list keeps historical practice totals. Clearing site data removes saved progress.

## Smoke test

1. Upload a clear picture containing several printed English words and one repeated word. Confirm the word order and deduplication.
2. Play a word, open its options, try slow playback, edit it, mark it as learned, and remove one chip.
3. Open the live camera on an HTTPS origin with a phone. Point it at the sheet, add one detection, then add all remaining detections. Close the preview and check that the camera indicator turns off.
4. Start practice. Try the expected word, a different word, and silence. Verify the feedback, retry, advance, finish, and try only difficult words.
5. Reload to verify vocabulary, progress, language, voice preference, and theme. Check the camera and speech permission-denied paths in a separate browser profile.
