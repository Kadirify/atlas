import type { Dict } from '../tr'

export const settings: Dict['settings'] = {
  title: 'Settings',
  sectionsLabel: 'Settings sections',
  closeLabel: 'Close settings',

  tabs: {
    genel: 'General',
    masaustu: 'Background and lock',
    kisilikler: 'Personas',
    hafiza: 'Memory',
    klasorler: 'Folders',
    modeller: 'Models',
    hakkinda: 'About'
  },

  confirmDelete: 'Delete it?',
  connecting: 'Connecting…',
  downloadProgress: (percent: number, done: string, total: string) => `${percent}%, ${done} / ${total}`,

  general: {
    appearance: 'Appearance',
    themeLabel: 'Theme',
    theme: { system: 'Match system', light: 'Light', dark: 'Dark' },

    language: 'Language',
    languageHint: 'The language of the interface and of the text Atlas writes.',

    addressTitle: 'How should Atlas address you?',
    addressHint: 'Used in chats.',
    yourName: 'Your name',
    addressLabel: 'Informal or formal',
    address: { sen: 'Informal', siz: 'Formal' },

    lettersTitle: 'Greetings and sign-offs',
    lettersHint: 'Used in the emails and letters the apps write. Pick from the list or type your own.',
    salutation: 'Greeting',
    closing: 'Sign-off',
    salutationSuggestions: ['Dear', 'Hello', 'Hi', 'Greetings'],
    closingSuggestions: ['Best regards', 'Kind regards', 'Thank you', 'Best', 'Sincerely'],
    sampleName: 'Ms. Taylor',

    corporateTitle: 'Work use',
    corporateCheck: "I'll use Atlas for work too",
    corporateDescription:
      'Turns on the email, meeting, announcement and document apps. Your job title, company and signature are added to what they write.',
    jobTitle: 'Job title',
    company: 'Company',
    signature: 'Email signature',
    signatureHint: 'If you have a signature, it replaces the sign-off.',

    saveChanges: 'Save changes',
    saved: 'Saved'
  },

  desktop: {
    backgroundTitle: 'Running in the background',
    closeToTray: 'Keep running in the background when I close the window',
    closeToTrayDescription:
      'Atlas waits among the icons at the right of the taskbar, and replies that are being written are not cut off. To close it completely, right-click the icon and choose "Quit Atlas".',
    launchAtLogin: 'Start when the computer starts',
    launchAtLoginDescription: 'Atlas starts in the background without opening a window.',
    launchAtLoginDevNote: 'This setting only works in Atlas installed with the setup file.',

    notifyWhenDone: 'Notify me when a reply is ready',
    notifyWhenDoneDescription: 'Shows a Windows notification for replies that finish while the Atlas window is not in front.',

    shortcutsTitle: 'Atlas from anywhere',
    shortcutsHint:
      'These shortcuts also work while you are in another program and open the Atlas panel at the right of the screen. The key you choose replaces the same shortcut in that program.',
    quickShortcut: 'Ask a question',
    quickShortcutHint: 'Opens an empty question box.',
    selectionShortcut: 'Work with selected text',
    selectionShortcutHint:
      'Select the text first, then press the shortcut: the text appears in the panel, where Atlas can fix, translate or summarize it. To get the text, Ctrl+C is sent to that program.',
    shortcutOff: 'Off',
    spaceKey: 'Space',
    shortcutTaken: (key: string) => `The ${key} shortcut is used by another program. Choose a different key.`,
    shortcutSame: 'The two shortcuts cannot be the same.',
    selectionWindowsOnly: 'Working with selected text is only available on Windows for now.',

    lockTitle: 'App lock',
    lockOff: 'The lock is off. Anyone who opens Atlas can see your chats.',
    lockOn: 'The lock is on. Atlas asks for the password when it starts, when the window is closed and when the computer locks.',
    lockLimits:
      'A forgotten password cannot be reset; there would be no way to reach your chats. The lock protects the screen; it does not encrypt the database file.',
    newPin: 'New password',
    newPinAgain: 'New password (again)',
    currentPin: 'Current password',
    pinHint: (min: number) => `At least ${min} characters. Digits, letters or both.`,
    mismatch: 'The two passwords are not the same.',
    enable: 'Turn on the lock',
    change: 'Change password',
    disable: 'Remove the lock',
    lockNow: 'Lock now',
    enabled: 'The lock is on.',
    changed: 'Password changed.',
    disabled: 'The lock was removed.',
    autoLock: 'Lock when the computer is idle',
    autoLockOff: "Don't lock",
    minutes: (n: number) => (n === 1 ? 'After 1 minute' : `After ${n} minutes`),
    shortcut: 'Shortcut: Ctrl+L'
  },

  lockScreen: {
    title: 'Atlas is locked',
    hint: 'Enter your password to continue.',
    password: 'Password',
    unlock: 'Unlock',
    wait: (seconds: number) => (seconds === 1 ? 'You can try again in 1 second.' : `You can try again in ${seconds} seconds.`)
  },

  models: {
    checking: 'Checking…',
    running: (version: string | null) => `Running (version ${version})`,
    installedNotRunning: 'Installed but not running',
    notInstalled: 'Not installed',
    startOllama: 'Start Ollama',

    installedTitle: 'Installed models',
    installedHint: 'New chats use the default model.',
    noneInstalled: 'No models installed. Download one below.',
    default: 'Default',
    makeDefault: 'Set as default',
    deleteModel: (name: string) => `Delete the ${name} model`,

    downloadableTitle: 'Available models',
    downloadableHint: "Fit is worked out from this computer's hardware.",
    recommended: 'Recommended',
    pause: 'Pause',
    download: 'Download'
  },

  about: {
    version: (version: string) => `Version ${version}`,
    privacy:
      'Your chats and settings are stored only on this computer. The app connects to the internet only to download models and when you check for updates.',
    openSource: (appName: string) =>
      `${appName} is free and open source. The source code is published under the MIT license: you can read it, change it and use it in your own work.`,
    updatesTitle: 'Updates',
    updatesHint: 'Looks for a new version and new Atlas models in the GitHub repository. Nothing is sent to it.',
    checkUpdates: 'Check for updates',
    checking: 'Checking…',
    upToDate: "You're on the latest version.",
    noRelease: 'No version has been released yet.',
    updateAvailable: (version: string) => `A new version is ready: ${version}`,
    download: 'Open the download page',
    notesTitle: "What's new in this version",
    downloadAndInstall: (mb: number) => `Download (${mb} MB)`,
    downloading: (percent: number) => `Downloading… ${percent}%`,
    readyToInstall: 'Downloaded and checked. Atlas closes when setup starts; your chats are kept.',
    install: 'Install and restart Atlas',
    whatsNewTitle: (version: string) => `Atlas ${version} is installed`,
    whatsNewClose: 'OK',
    modelsUpdated: 'The Atlas model list was refreshed.',
    wizardTitle: 'Setup wizard',
    wizardHint: 'Scans this computer again and recommends a model. Your chats are kept.',
    restartWizard: 'Run setup again'
  },

  personas: {
    title: 'Personas',
    description:
      'When you start a new chat, you choose who to talk to. You can copy and adapt the built-in personas or create your own.',
    newPersona: 'New persona',
    addFromWhatsapp: 'Add from WhatsApp',
    viewStyle: 'View style',
    duplicateLabel: (name: string) => `Duplicate the ${name} persona`,
    editLabel: (name: string) => `Edit the ${name} persona`,
    deleteLabel: (name: string) => `Delete the ${name} persona`,
    copyName: (name: string) => `${name} (copy)`,

    editTitle: 'Edit persona',
    name: 'Name',
    tagline: 'Short description',
    taglinePlaceholder: 'E.g. a wise and patient grandfather',
    icon: 'Icon',
    prompt: 'What are they like?',
    promptHint: 'Describe who they are and how they talk, in your own words.',
    promptPlaceholder:
      "E.g. You are the user's wise grandfather. You speak calmly and unhurriedly, you love proverbs, and you answer every worry with a story.",
    warmth: 'Warmth',
    warmthLevels: ['Reserved', 'Balanced', 'Warm'],
    humor: 'Humor',
    humorLevels: ['None', 'A little', 'Witty'],
    length: 'Reply length',
    lengthLevels: ['Short', 'Medium', 'Long'],
    emoji: 'Emoji',
    emojiLevels: ['None', 'A few', 'Lots'],
    multiMessage: 'Write like a text conversation',
    multiMessageDescription:
      'Sends several short messages in a row instead of one long reply, with no headings or lists. Always speaks to you informally.',
    savePersona: 'Save persona'
  },

  memory: {
    enable: 'Let Atlas remember me',
    enableDescription:
      'Atlas picks up the lasting things you say about yourself in chats (your job, the people close to you, your preferences, your ongoing work) and uses them in later chats. This information stays on this computer only.',
    knownTitle: 'What Atlas knows about you',
    empty: 'Nothing learned yet. This fills up as you chat, and you can add things yourself.',
    count: (n: number) =>
      `${n} ${n === 1 ? 'memory' : 'memories'}. You can edit or delete anything that is wrong or no longer needed.`,
    addPlaceholder: 'E.g. The user takes their coffee without sugar.',
    addLabel: 'Information to add to memory',
    textLabel: 'Memory',
    categoryLabel: 'Type',
    rowMeta: (category: string, date: string, manual: boolean) =>
      `${category}, ${date}${manual ? ', added manually' : ''}`,
    editLabel: 'Edit this memory',
    forgetLabel: 'Forget this memory',
    confirmClear: 'Permanently delete all memories?',
    yesDeleteAll: 'Yes, delete all',
    clearAll: 'Delete all memories',

    semanticTitle: 'Search by meaning',
    semanticOn: 'On. As memories add up, the relevant ones are found by meaning.',
    semanticDescription:
      'Up to 20 memories, all of them are used in every chat. Beyond that, a small helper model is needed to find the relevant ones by meaning. Without it, Atlas matches on shared words.',
    downloadHelper: (sizeGb: string) => `Download helper model (${sizeGb} GB)`
  },

  folders: {
    title: 'Folders',
    description:
      'Atlas can only see inside the folders you allow here. To use one in a chat, pick it with the “Connect folder” button above the chat. Atlas asks you every time before it writes, moves or deletes a file.',
    addFolder: 'Add folder',
    empty: 'No folders allowed yet.',

    indexed: (count: number, countText: string, date: string) =>
      `${countText} ${count === 1 ? 'section' : 'sections'} indexed, ${date}`,
    notIndexed: "Not indexed: Atlas can't search inside PDF, Word and Excel files.",
    index: 'Index',
    reindex: 'Reindex',
    removeAccess: 'Remove access',
    removeAccessLabel: (name: string) => `Remove access to the ${name} folder`,
    removeAccessNote: 'Atlas will no longer be able to access this folder. The files in it are not deleted.',
    scanning: 'Scanning files…',
    showChanges: 'Show changes made',
    hideChanges: 'Hide changes',
    noChanges: "Atlas hasn't changed anything in this folder yet.",
    action: { write: 'Written', move: 'Moved', delete: 'Deleted', mkdir: 'Folder', command: 'Command' }
  }
}
