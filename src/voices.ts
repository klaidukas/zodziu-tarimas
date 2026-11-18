import type { Copy } from './strings'

type VoiceProfile = {
  id: string
  locale: string
  gender: 'female' | 'male'
  names: RegExp
}

// Browsers expose names and locales, but no voice gender or quality metadata.
// Match known speaking voices so sound effects and unknown voices never enter the picker.
const profiles: VoiceProfile[] = [
  { id: 'en-GB-female', locale: 'en-GB', gender: 'female',
    names: /^(?:google uk english female|(?:microsoft )?(?:sonia|libby|maisie|hazel)|serena|kate|stephanie)(?:$|\s|\()/i },
  { id: 'en-GB-male', locale: 'en-GB', gender: 'male',
    names: /^(?:google uk english male|(?:microsoft )?(?:ryan|ollie|george|thomas)|daniel|jamie|oliver)(?:$|\s|\()/i },
  { id: 'en-US-female', locale: 'en-US', gender: 'female',
    names: /^(?:google us english(?: female)?|(?:microsoft )?(?:jenny|aria|ana|emma|zira|michelle|ava)|samantha|allison|ava|susan|nicky|zoe)(?:$|\s|\()|^en-us-x-tpf-(?:local|network)$/i },
  { id: 'en-US-male', locale: 'en-US', gender: 'male',
    names: /^(?:(?:microsoft )?(?:guy|andrew|brian|davis|david|mark|christopher)|alex|tom|evan|nathan)(?:$|\s|\()|^en-us-x-tpd-(?:local|network)$/i },
]

const qualityNames = /\b(natural|neural|enhanced|premium|wavenet|online)\b/i
const effects = /\b(bubbles?|bells?|whisper|novelty|robot|sound effects?)\b/i

function matches(voice: SpeechSynthesisVoice, profile: VoiceProfile) {
  return voice.lang.replaceAll('_', '-').toLowerCase() === profile.locale.toLowerCase() &&
    !effects.test(voice.name) && profile.names.test(voice.name)
}

export function savedProfile(selection: string, voices: SpeechSynthesisVoice[]) {
  const configured = profiles.find(profile => profile.id === selection)
  if (configured) return configured.id
  // Earlier builds stored a browser voice identity rather than a profile.
  const voice = voices.find(item => JSON.stringify([item.voiceURI, item.lang, item.name]) === selection)
  return voice ? profiles.find(profile => matches(voice, profile))?.id ?? '' : ''
}

export function voiceChoices(voices: SpeechSynthesisVoice[], preferredLocale: string) {
  const score = (voice: SpeechSynthesisVoice) => (qualityNames.test(voice.name) ? 4 : 0) + (voice.default ? 1 : 0)
  return profiles.flatMap(profile => {
    const options = voices.filter(voice => matches(voice, profile)).sort((a, b) => score(b) - score(a))
    return options.length ? [{ ...profile, options }] : []
  }).sort((a, b) =>
    Number(b.locale === preferredLocale) - Number(a.locale === preferredLocale) || score(b.options[0]) - score(a.options[0]))
}

export function voiceLabel(profile: VoiceProfile, copy: Copy) {
  return `${copy[profile.gender === 'female' ? 'femaleVoice' : 'maleVoice']} · ${copy.voiceLocales[profile.locale] ?? profile.locale}`
}

export function chooseVoice(voices: SpeechSynthesisVoice[], preferredLocale: string, selection: string, online: boolean) {
  const profile = savedProfile(selection, voices)
  const choices = voiceChoices(online ? voices : voices.filter(voice => voice.localService), preferredLocale)
  const selected = choices.find(choice => choice.id === profile)
  const previous = selected?.options.find(item => JSON.stringify([item.voiceURI, item.lang, item.name]) === selection)
  return previous ?? selected?.options[0] ?? choices[0]?.options[0]
}
