import type { Dict } from '../tr'

export const panel: Dict['panel'] = {
  close: 'Close the panel (Esc)',
  locked: 'Atlas is locked. To use the panel, open Atlas and enter your password first.',
  openAtlas: 'Open Atlas',

  askTitle: 'Ask Atlas',
  askPlaceholder: 'Type your question. Enter sends, Shift + Enter adds a new line.',
  ask: 'Ask',
  askAgain: 'New question',

  selectionTitle: 'Selected text',
  selectionEmpty: 'No selected text was found. You can paste or type the text here.',
  selectionPlaceholder: 'The text to work on',
  words: (n: number) => (n === 1 ? '1 word' : `${n} words`),
  actionsLabel: 'What should be done with the text?',
  actions: {
    fix: 'Fix spelling',
    formal: 'Make formal',
    shorter: 'Shorten',
    translate: 'Translate',
    summarize: 'Summarize',
    explain: 'Explain'
  },
  customPlaceholder: 'Ask for something else: "make it friendlier", "turn it into bullet points"…',
  customSend: 'Apply',

  resultTitle: 'Result',
  writing: 'Writing…',
  stop: 'Stop',
  replace: 'Replace',
  replaceHint: 'Writes the result over your selection in the program you selected the text in.',
  copy: 'Copy',
  copied: 'Copied',
  toChat: 'Continue in chat',
  replaceFailed: 'The program could not be brought to the front. The result was copied; paste it with Ctrl+V.',
  noChange: 'No spelling mistakes were found; the text is unchanged.',

  prompts: {
    system:
      'Do what is asked with the text the user gives you. Write only the result: no explanation, no introduction, no heading and no quotation marks. Unless a translation is asked for, the result must be in the same language as the text.',
    fix: (text: string) =>
      `Fix the spelling and punctuation mistakes in this text without changing its meaning or tone. If there are no mistakes, write the text as it is. Write only the corrected text:\n\n${text}`,
    formal: (text: string) =>
      `Rewrite this text in formal, polite language. Do not change the meaning or add information. Write only the new version:\n\n${text}`,
    shorter: (text: string) => `Make this text clearly shorter while keeping its meaning. Write only the shortened text:\n\n${text}`,
    translate: (text: string) =>
      `If this text is in English, translate it into Turkish; if it is in another language, translate it into English. Write only the translation:\n\n${text}`,
    summarize: (text: string) => `Summarize this text in a few sentences. Do not add information that is not in the text:\n\n${text}`,
    explain: (text: string) => `Explain this text in plain language: what it says and what its main point is:\n\n${text}`,
    custom: (instruction: string, text: string) => `${instruction}\n\nText:\n${text}`
  }
}
