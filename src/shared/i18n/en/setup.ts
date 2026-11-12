import type { Dict } from '../tr'

export const setup: Dict['setup'] = {
  stepsLabel: 'Setup steps',
  steps: ['Welcome', 'Computer', 'Ollama', 'Model', 'Download', 'Speed test', 'You', 'Privacy', 'Ready'],

  welcome: {
    languageLabel: 'Language',
    title: 'Welcome to Atlas',
    lead: 'Atlas is your AI assistant that runs entirely on this computer. Your chats, files and writing never leave it. You only need the internet once, to download a model. After that, the app works offline.',
    duration: 'Setup takes a few minutes.',
    start: 'Start setup',
    points: [
      'First, Atlas checks how powerful your computer is.',
      'It recommends the AI model that fits best. You can pick a different one if you like.',
      'The model is downloaded, its speed is measured, and your first chat opens.'
    ]
  },

  hardware: {
    titleDone: 'Your computer has been scanned',
    titleScanning: 'Scanning your computer',
    lead: 'Memory and the graphics card decide which models will run smoothly.',
    scanning: 'Reading processor, memory and graphics card…',
    tierHeading: "This computer's level",
    cpu: 'Processor',
    cpuValue: (cpu: string, cores: number) => `${cpu} (${cores} ${cores === 1 ? 'core' : 'cores'})`,
    memory: 'Memory',
    memoryValue: (gb: number) => `${gb} GB RAM`,
    gpu: 'Graphics card',
    noGpu: 'No dedicated graphics card found. The model will run on the processor.',
    freeDisk: 'Free disk space'
  },

  ollama: {
    title: 'Model runner: Ollama',
    lead: 'Ollama is a free, open-source program that runs AI models on your computer. Atlas uses it to run its models.',
    checking: 'Looking for Ollama…',
    starting: 'Ollama is installed. Starting it…',
    downloading: (done: string, total: string) => `Downloading Ollama: ${done} / ${total}`,
    installing: 'Installing Ollama. This can take a minute…',
    downloadStarting: 'Starting download…',
    running: (version?: string | null) => `Ollama is running${version ? ` (version ${version})` : ''}.`,
    notInstalled:
      'Ollama is not installed on this computer. The installer will be downloaded from ollama.com and run.',
    install: 'Download and install Ollama',
    startFailed: "Ollama is installed but couldn't be started. Open Ollama from the Start menu, then try again."
  },

  model: {
    title: 'Choose your model',
    lead: "This recommendation is based on your computer's hardware. A more powerful model writes better but responds more slowly. You can change the model later in Settings.",
    pickerLabel: 'Model selection',
    preparing: 'Preparing models…',
    roleRecommended: 'Recommended',
    roleStronger: 'More powerful',
    roleFaster: 'Faster',
    toDownload: (size: string) => `${size} download`,
    installedHeading: 'Installed on your computer',
    installedHint: 'No download needed. Ready to use right away.',
    showMoreInstalled: (n: number) => `Show ${n} more installed ${n === 1 ? 'model' : 'models'}`,
    downloadableHeading: 'Available to download',
    downloadableHint: "Sorted for this computer's hardware.",
    hideOthers: 'Hide other models',
    showOthers: (n: number) => `Show ${n} more ${n === 1 ? 'model' : 'models'}`,
    continueWithModel: 'Continue with this model',
    download: 'Download',
    downloadWithSize: (size: string) => `Download (${size})`,
    lowDisk: (free: string, needed: string) =>
      `You have ${free} of free disk space, and this model needs ${needed}. Free up some space or choose a smaller model.`
  },

  download: {
    titlePaused: 'Download paused',
    titleDownloading: (name: string) => `Downloading ${name}`,
    modelFallback: 'model',
    lead: 'The model is installed automatically when the download finishes. If you pause, it picks up where it left off.',
    chooseAnother: 'Choose another model',
    resume: 'Resume',
    pause: 'Pause',
    percent: (n: number) => `${n}%`,
    connecting: 'Connecting…',
    rate: (speed: string, remaining: string) => `${speed}/s, ${remaining} left`
  },

  benchmark: {
    titleDone: 'The model is working',
    titleMeasuring: 'Measuring speed',
    lead: 'The model is loading into memory and writing a short test reply. The first load can take up to a minute.',
    wordsPerSecond: 'words per second',
    slowNotice: 'This model runs slowly on this computer. For a smoother experience, you can choose a smaller model.'
  },

  profile: {
    title: 'What should I call you?',
    lead: 'Optional. You can change everything here later in Settings.',
    name: 'Your name',
    namePlaceholder: 'Alex',
    corporateTitle: "I'll use it for work too",
    corporateDescription:
      'Turns on ready-made tools for work writing such as emails, reports, announcements and meeting summaries. Your job title, company and signature are added to them.',
    jobTitle: 'Your job title',
    jobTitlePlaceholder: 'IT Director',
    company: 'Company',
    companyPlaceholder: 'Company name',
    signature: 'Email signature',
    signatureHint: 'Added to the end of the emails Atlas writes for you.',
    signaturePlaceholder: 'Best regards,\nFull Name\nTitle, Company'
  },

  privacy: {
    title: 'Your data stays with you',
    lead: 'This app is not a cloud service. Everything happens on this computer and stays here.',
    confirm: 'Got it, continue',
    stored: {
      title: 'Your chats are stored on this computer',
      text: 'Chats, settings and your profile are kept in a single folder. They are not copied anywhere else.'
    },
    local: {
      title: 'The model runs on this computer',
      text: 'What you write is never sent to a server to generate a reply. The internet is only used to download models. After that, Atlas works without a connection.'
    },
    noTelemetry: {
      title: 'No usage data is collected',
      text: "The app doesn't report what you write, how often you use it, or which model you chose to anyone."
    },
    deletion: {
      title: 'Deleting is up to you',
      text: 'You can delete chats one by one. If you delete the data folder, everything is gone for good.'
    }
  },

  done: {
    title: "You're all set",
    titleWithName: (name: string) => `You're all set, ${name}`,
    lead: 'The model is installed and running on this computer. You can now chat even without the internet.',
    openFirstChat: 'Open your first chat',
    model: 'Model',
    speed: 'Speed',
    speedValue: (words: number | string) => `About ${words} words per second`,
    notMeasured: 'Not measured',
    tier: 'Computer level',
    corporate: 'Work use',
    on: 'On',
    off: 'Off',
    data: 'Data',
    dataValue: 'Stored only on this computer'
  }
}
