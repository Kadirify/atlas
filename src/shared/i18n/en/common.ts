import type { Dict } from '../tr'

export const common: Dict['common'] = {
  appName: 'Atlas',
  languageName: { tr: 'Türkçe', en: 'English' },

  tier: { baslangic: 'Entry', orta: 'Mid', iyi: 'Good', guclu: 'Powerful' },
  tierSummary: {
    baslangic: 'Runs small models. Fine for chat and short texts.',
    orta: 'Runs mid-size models comfortably. Fine for chat, email and summaries.',
    iyi: 'Runs large models smoothly on the graphics card. Every feature is available.',
    guclu: 'Runs even the largest models smoothly. Every feature at the highest quality.'
  },
  fit: { rahat: 'Runs smoothly', yavas: 'Runs, but slowly', sigmaz: "Won't fit on this computer" },
  speed: { good: 'Smooth', ok: 'Adequate', slow: 'Slow' },

  units: { second: 's', minute: 'min', hour: 'h', bytes: 'bytes', wordsPerSecond: 'words/s' },

  groups: { pinned: 'Pinned', today: 'Today', yesterday: 'Yesterday', lastWeek: 'Last 7 days', older: 'Older' },

  newChat: 'New chat',

  actions: {
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    yesDelete: 'Yes, delete',
    back: 'Back',
    continue: 'Continue',
    close: 'Close',
    copy: 'Copy',
    copied: 'Copied',
    retry: 'Try again',
    add: 'Add',
    apply: 'Apply',
    stop: 'Stop',
    approve: 'Approve',
    reject: 'Reject'
  },

  memoryCategory: {
    Kişisel: 'Personal',
    İş: 'Work',
    Tercih: 'Preference',
    Proje: 'Project',
    Tarih: 'Date',
    Diğer: 'Other'
  },

  openSourceNote: (appName: string) =>
    `${appName} is free and open source. It runs entirely on this computer, and your data stays with you.`
}
