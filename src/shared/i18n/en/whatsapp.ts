import type { Dict } from '../tr'

export const whatsapp: Dict['whatsapp'] = {
  pageTitle: 'Add a person from WhatsApp',
  styleTitle: (name: string) => `${name}: writing style`,
  backToChat: 'Back to chat',

  intro: {
    title: 'Create a persona that writes like someone you know',
    lead: 'Give Atlas your WhatsApp chat with them. It learns how they write and messages you in their style. The file is processed on this computer and is never sent anywhere.',
    steps: [
      'Open your chat with that person in WhatsApp.',
      'Tap the name at the top (iPhone) or the three dots (Android), then choose “Export chat”.',
      'Choose “Without media” and send the exported file to your computer.'
    ],
    reading: 'Reading file…',
    drop: 'Drop the file here or choose one',
    fileTypes: '.txt or .zip',
    learnedBefore: 'Already learned'
  },

  pick: {
    title: 'Who should it write like?',
    summary: (fileName: string, total: string, from: string, to: string) =>
      `${fileName}: ${total} messages, ${from} to ${to}.`,
    targetLabel: 'Person to imitate',
    messageCount: (count: number, formatted: string) => `${formatted} ${count === 1 ? 'message' : 'messages'}`,
    selfLabel: 'Which one are you in this chat?',
    mergeTitle: (name: string) => `Add to the existing ${name} persona`,
    mergeDescription:
      'New messages from this chat are combined with what was learned before. Leave this unchecked to create a separate persona with the same name.',
    learn: 'Learn their style',
    otherFile: 'Choose another file'
  },

  building: {
    title: (name: string) => `Learning how ${name} writes`,
    lead: 'This can take a few minutes. Everything happens on this computer.',
    starting: 'Starting…',
    stage: {
      analiz: 'Counting messages',
      ozet: 'Summarizing the writing style',
      ornekler: 'Preparing example replies'
    },
    progress: (stage: string, percent: number) => `${stage} (${percent}%)`
  },

  sheet: {
    learned: 'Writing style learned',
    summary: (messages: string, examples: string, from: string, to: string, name: string) =>
      `${messages} messages and ${examples} example replies, ${from} to ${to}. This is an imitation, not the real ${name}.`,
    topWords: 'Words they use often',
    style: 'Their style',
    samples: 'From their real messages',
    similarityTitle: 'How close should it be?',
    similarityLabel: 'Similarity',
    similarity: [
      { label: 'Style only', hint: 'Imitates only the way they write. It never brings up events from past chats.' },
      { label: 'Balanced', hint: 'Imitates their style and draws on real replies they gave in similar situations.' },
      {
        label: 'Full imitation',
        hint: 'Uses more of their real replies, and may mention people and memories from past chats.'
      }
    ],
    startChat: (name: string) => `Start chatting with ${name}`,
    addConversation: 'Add another chat'
  },

  stats: {
    sometimes: 'Sometimes',
    unclear: 'No clear pattern',
    length: {
      label: 'Message length',
      average: (words: string) => `${words} words on average`
    },
    burst: {
      label: 'Per reply',
      mostly: (n: number) => `Usually ${n} ${n === 1 ? 'message' : 'messages'}`,
      mostlyRange: (from: number, to: number) => `Usually ${from} to ${to} messages`,
      average: (messages: string) => `${messages} messages on average`
    },
    capitals: { label: 'Capital letters', no: 'Skips them', yes: 'Uses them' },
    period: { label: 'Ending period', no: 'Leaves it out', yes: 'Uses it' },
    question: { label: 'Question mark', no: 'Leaves it out', yes: 'Uses it' },
    turkishChars: { label: 'Turkish letters', no: 'Skips them: s for ş, i for ı', yes: 'Uses them' },
    emoji: {
      label: 'Emoji',
      rare: 'Almost never',
      rate: (percent: number, emojis: string) =>
        emojis ? `In ${percent}% of messages: ${emojis}` : `In ${percent}% of messages`
    },
    laughter: { label: 'Laughter' },
    address: { label: 'Calls you' }
  },

  files: {
    tooLarge: (name: string) => `"${name}" is too large. Files can be up to 25 MB.`,
    imageOpenFailed: (name: string) => `Couldn't open the image "${name}".`,
    imageProcessFailed: (name: string) => `Couldn't process the image "${name}".`,
    defaultImageName: 'image'
  }
}
