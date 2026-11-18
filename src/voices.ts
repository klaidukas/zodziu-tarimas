const qualityNames = /\b(natural|neural|enhanced|premium|wavenet|online)\b/i

export function voiceKey(voice: SpeechSynthesisVoice): string {
  return JSON.stringify([voice.voiceURI, voice.lang, voice.name])
}

export function rankedEnglishVoices(voices: SpeechSynthesisVoice[], accent: string): SpeechSynthesisVoice[] {
  const score = (voice: SpeechSynthesisVoice) =>
    (voice.lang.replaceAll('_', '-').toLowerCase() === accent.toLowerCase() ? 8 : 0) +
    (qualityNames.test(voice.name) ? 4 : 0) + (voice.default ? 1 : 0)

  const english = voices.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang))
  return [...new Map(english.map(voice => [voiceKey(voice), voice])).values()]
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
}
