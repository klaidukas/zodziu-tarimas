import nspell from 'nspell'
import usAff from '../node_modules/dictionary-en/index.aff?url'
import usDic from '../node_modules/dictionary-en/index.dic?url'
import gbAff from '../node_modules/dictionary-en-gb/index.aff?url'
import gbDic from '../node_modules/dictionary-en-gb/index.dic?url'

type EnglishCheck = (word: string) => boolean
let dictionary: Promise<EnglishCheck> | undefined
// Spell-check dictionaries also accept abbreviations such as "pt" and "ct".
const shortWords = new Set('a i ah am an as at aw be by do eh go ha he hi if in is it ma me my no of oh on or ow ox pa so to uh up us we yo'.split(' '))

export function loadEnglish(): Promise<EnglishCheck> {
  dictionary ??= Promise.all([usAff, usDic, gbAff, gbDic].map(async url => {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Could not load the English dictionary')
    return response.text()
  })).then(([usRules, usWords, gbRules, gbWords]) => {
    const us = nspell(usRules, usWords)
    const gb = nspell(gbRules, gbWords)
    return (word: string) => word.split('-').every(part =>
      part.length < 3 ? shortWords.has(part) : us.correct(part) || gb.correct(part))
  }).catch(error => {
    dictionary = undefined
    throw error
  })
  return dictionary
}
