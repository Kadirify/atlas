import type { Dict } from '../tr'

export const chat: Dict['chat'] = {
  starters: [
    "Draft a 30-minute agenda for tomorrow's team meeting",
    'Write a short, formal email apologizing to a customer for a delay',
    'Explain how AI models work in simple terms',
    'Suggest three things to do this weekend without leaving town'
  ],

  greeting: (name: string) => (name ? `Hi ${name},` : 'Hi,'),
  greetingQuestion: 'what are we working on?',
  greetingQuestionCasual: "what's up?",
  personaPicker: 'Who would you like to talk to',
  addFromWhatsapp: 'Add a contact from WhatsApp',
  privateOption: "Private chat: doesn't use memory and is deleted when you close the app",
  privateBadge: 'Private',
  privateHint: "This chat doesn't use memory and is deleted when you close the app.",

  dropHere: 'Drop the file here',
  thinking: 'Thinking',
  typing: 'Typing',
  jumpToBottom: 'Jump to bottom',
  writeAnswer: 'Get a response',
  imageBlocked: (alt: string) => (alt ? `Remote image not shown: ${alt}` : 'Remote image not shown'),
  live: {
    writing: 'Atlas is writing',
    approval: 'Atlas is waiting for your approval',
    done: 'Reply ready'
  },

  message: {
    edit: 'Edit message',
    editHint: 'Sending this deletes the responses that follow and writes them again.',
    copyAnswer: 'Copy response',
    regenerate: 'Regenerate response',
    partial: 'Stopped early'
  },

  composer: {
    placeholder: 'Type a message, or / for ready-made prompts',
    label: 'Message',
    send: 'Send',
    sendTitle: 'Send (Enter)',
    stop: 'Stop response',
    stopTitle: 'Stop response (Esc)',
    visionMissing: (model: string) =>
      `The selected model (${model}) can't read images. To ask about an image, pick a model with image support from the list above.`,
    toolsMissing: (model: string) =>
      `The selected model (${model}) can't use file tools. To work with a folder, pick a different model from the list above.`
  },

  doc: {
    paneLabel: 'Document panel',
    open: (name: string) => `Open ${name} on the side`,
    close: 'Close the document panel',
    choose: 'Document shown',
    edited: 'Edited',
    editedHint: 'Atlas sees this version of the document in later questions. Your original file is not changed.',
    reset: 'Back to the original',
    save: 'Save the document',
    saved: 'Saved',
    formats: { docx: 'Word document (.docx)', pdf: 'PDF (.pdf)', md: 'Markdown (.md)', txt: 'Text (.txt)' },
    textLabel: 'Text of the document',
    textNote: 'The text read from the file is shown; page layout and pictures are not.',
    selectHint: 'Select a part: Atlas fixes, shortens or translates only that part.',
    selected: (n: number) => (n === 1 ? '1 word selected' : `${n} words selected`),
    quote: 'Quote in chat',
    proposal: "Atlas's suggestion",
    apply: 'Replace the selection',
    discard: 'Discard',
    undo: 'Undo the last change',
    changed: 'The selection changed; the suggestion belongs to the old one. Try again.',
    notFound: 'This document no longer exists.',
    noDocument: 'This chat has no document to show on the side. Attach a file first.',
    quoteIntro: 'About this part of the document:',
    whole: 'Whole document:',
    progress: (done: number, total: number) => `Working through the document: part ${done} of ${total}`,
    applyAll: 'Apply all',
    showDiff: 'Show changes',
    showNew: 'New text only',
    noChange: 'Atlas found nothing to change.',
    changeCount: (n: number) => (n === 1 ? '1 change. Red is removed, green is added.' : `${n} changes. Red is removed, green is added.`),
    modes: 'How the document is shown',
    modeView: 'View',
    modeText: 'Text',
    selectHintView: 'Select a part: Atlas fixes, shortens or translates it, or you can quote it in the chat.',
    viewNote: 'This is how the file itself looks. Edits are made in the Text tab.',
    viewEdited: 'You edited the text. The view shows the original file; the edited version is in the Text tab.',
    reattach: 'This file was attached before originals were kept. Attach it to the chat again to see it as it looks.',
    applyToText: 'Apply to the text',
    copy: 'Copy',
    copied: 'Copied',
    notInText: 'This part was not found word for word in the text. Copy the suggestion and place it by hand in the Text tab.',
    viewFailed: 'The view of this file could not be opened. You can continue in the Text tab.',
    morePages: (shown: number, total: number) => `Showing the first ${shown} pages (of ${total}).`,
    sheets: 'Sheets',
    emptySheet: 'This sheet is empty.'
  },

  export: {
    button: 'Export the chat',
    formats: { docx: 'Word document (.docx)', pdf: 'PDF (.pdf)', md: 'Markdown (.md)' },
    saved: 'Saved'
  },

  think: {
    label: 'Think',
    onHint: 'Thinking is on: Atlas thinks before answering. More careful but slower. Click to turn it off.',
    offHint: 'Thinking is off: Atlas answers right away. Turn it on for hard questions and coding work.',
    thinking: 'Thinking',
    thought: 'What it thought'
  },

  undo: {
    button: (n: number) => (n === 1 ? 'Undo the change' : `Undo ${n} files`),
    hint: 'Files Atlas changed in this reply go back to how they were; files it created go to the recycle bin.',
    confirm: (n: number) =>
      n === 1
        ? 'The file will go back to how it was. Changes you made afterwards are lost too.'
        : `${n} files will go back to how they were. Changes you made afterwards are lost too.`,
    yes: 'Undo',
    no: 'Cancel',
    done: (n: number) => (n === 1 ? '1 file restored.' : `${n} files restored.`),
    lostWarning: 'The file changes in this reply can no longer be undone. Continue?',
    lostWarningLater: 'The file changes in the later replies can no longer be undone. Continue?',
    continue: 'Continue'
  },

  viewer: {
    close: 'Close the image (Esc)',
    zoomIn: 'Zoom in (+)',
    zoomOut: 'Zoom out (-)',
    copy: 'Copy the image',
    copied: 'Copied',
    save: 'Save the image',
    previous: 'Previous image (left arrow)',
    next: 'Next image (right arrow)',
    zoomLevel: (percent: number) => `${percent}%`
  },

  codeArea: {
    menuOpen: 'Open with the default app',
    menuView: 'Show on the side',
    menuReveal: 'Show in Explorer',
    menuMention: 'Mention the file in chat',
    title: 'Code',
    intro: 'Open a project folder and let Atlas work in it with you: it reads the files, proposes changes, runs the tests to check the result, and connects to the database.',
    ruleEdit: 'It shows file changes line by line; nothing is written until you approve (or choose "always allow").',
    ruleCommand: 'It asks for your approval before running a command such as tests, a build or git. If you always allow a command, it can also run files Atlas has edited.',
    ruleSql: 'In the database it runs SELECT queries by itself and asks for approval before anything that changes data.',
    ruleDelete: 'It has no delete tool: it does not delete files and does not run known deleting commands or DELETE, DROP and TRUNCATE. Those are left to you.',
    noCodeModel: 'Atlas Strong is not installed; the chat starts with your default model. For coding work, install Atlas Strong from Settings → Models (needs a 12 GB graphics card).',
    projects: 'Projects',
    openFolder: 'Open a project folder',
    noProjects: 'No project has been opened yet. Start with "Open a project folder".',
    start: 'Work in this project',
    files: 'Project files',
    hideFiles: 'Hide the file tree',
    refresh: 'Refresh',
    emptyFolder: 'This folder is empty.',
    viewerLabel: 'File viewer',
    closeViewer: 'Close the file',
    lineCount: (n: number) => (n === 1 ? '1 line' : `${n} lines`),
    truncated: 'only the beginning is shown',
    quote: 'Add to chat',
    quoteHint: 'Adds the selection (or the start of the file if nothing is selected) to the message box',
    quoteIntro: (path: string) => `About this part of ${path}:`
  },

  sql: {
    connect: 'Connect a database',
    connected: (name: string) => `Connected database: ${name}`,
    none: 'No database connection has been saved yet.',
    add: 'Add a new connection',
    edit: (name: string) => `Edit the ${name} connection`,
    showTables: 'Show tables and data',
    rules: 'Atlas runs SELECT queries by itself. It asks for your approval before any statement that changes something. It never runs delete operations (DELETE, DROP, TRUNCATE).',
    formNew: 'Add a database connection',
    formEdit: 'Edit the database connection',
    engine: 'Database type',
    name: 'Connection name',
    nameHint: 'Shown in the list under this name. Example: Accounting (test)',
    host: 'Server',
    hostHint: 'Example: localhost, 192.168.1.20 or server\\instance',
    port: 'Port',
    database: 'Database',
    databaseHint: 'Leave empty to open the user\'s default database.',
    user: 'User name',
    password: 'Password',
    passwordKept: 'Saved (type to change it)',
    passwordNote: 'The password is encrypted on this computer with the Windows secure store. It is never sent to the model or kept in chats. The connection uses a user name and password; Windows authentication is not available yet.',
    ssl: 'Use an encrypted connection (SSL)',
    trustCert: 'Trust the server certificate (usually needed for local and in-house servers)',
    file: 'SQLite file',
    browse: 'Choose…',
    remove: 'Delete connection',
    removeConfirm: 'Delete this connection and its saved password?',
    cancel: 'Cancel',
    saveAndConnect: 'Save and connect',
    connecting: 'Connecting…',
    approvalTitle: 'Atlas wants to run this statement',
    approvalBody: 'This statement changes the database. If you approve, it runs and is permanent; if you decline, nothing changes.',
    approvalDoes: 'What it does:',
    approve: 'Approve and run',
    decline: 'Decline',
    paneLabel: 'Database panel',
    closePane: 'Close the database panel',
    filter: 'Find a table, procedure or trigger',
    tableCount: (n: number) => (n === 1 ? '1 object' : `${n} objects`),
    loading: 'Reading tables…',
    noTables: 'No tables found.',
    view: 'view',
    key: 'Primary key',
    kinds: { table: 'Tables', view: 'Views', procedure: 'Stored procedures', function: 'Functions', trigger: 'Triggers', job: 'Scheduled jobs' },
    showCode: 'View code',
    noCode: '(the code could not be read or is encrypted)',
    peek: 'View data',
    queryPlaceholder: 'Write a SELECT query (Ctrl + Enter runs it)',
    run: 'Run',
    runHint: 'Run the query (Ctrl + Enter)',
    readOnlyNote: 'Only SELECT runs from here and the database is not changed. Have Atlas write statements that change things.',
    running: 'Running the query…',
    empty: 'Press "View data" next to a table or write a SELECT query. Results of queries Atlas runs also appear here.',
    noRows: 'The query returned no rows.',
    resultInfo: (rows: number, truncated: boolean, ms: number) => `${truncated ? `First ${rows} rows` : rows === 1 ? '1 row' : `${rows} rows`}, ${ms} ms`
  },

  slash: {
    label: 'Ready-made prompts',
    empty: 'No matching prompt.',
    add: 'Add your own prompt',
    namePlaceholder: 'Short name (e.g. minutes)',
    textPlaceholder: 'Prompt text (e.g. Turn these meeting notes into minutes:)',
    save: 'Save',
    cancel: 'Cancel',
    remove: (name: string) => `Delete the ${name} prompt`,
    builtin: [
      { name: 'summarize', text: 'Summarize this text briefly, as bullet points:\n\n' },
      { name: 'email', text: 'Write a short, formal email about this:\n\n' },
      { name: 'table', text: 'Put this information into a table:\n\n' },
      { name: 'translate', text: 'Translate this text into Turkish:\n\n' },
      { name: 'fix', text: 'Fix the spelling and grammar of this text without changing its meaning:\n\n' },
      { name: 'explain', text: 'Explain this in simple terms, with an example:\n\n' },
      { name: 'bullets', text: 'Rewrite this text as bullet points:\n\n' },
      { name: 'reply', text: 'Write a polite, short reply to this message:\n\n' }
    ]
  },

  find: {
    label: 'Find in this chat',
    placeholder: 'Find in this chat',
    count: (current: number, total: number) => `${current} / ${total}`,
    none: 'None',
    previous: 'Previous match (Shift + Enter)',
    next: 'Next match (Enter)',
    close: 'Close find (Esc)',
    open: 'Find in this chat (Ctrl + F)'
  },

  memory: {
    button: 'Models in memory',
    title: 'Models held in memory',
    empty: 'No model is in memory right now. It loads again on your next question.',
    size: (gb: string) => `about ${gb} GB`,
    onGpu: (percent: number) => (percent >= 100 ? 'on the graphics card' : percent <= 0 ? 'on the processor' : `${percent}% on the graphics card`),
    unload: 'Unload',
    unloadAll: 'Unload all from memory',
    hint: 'Free the memory before starting a game or a heavy program. The model loads again by itself on your next question.',
    ollamaDown: 'Ollama is not running, so Atlas cannot reach the models. It starts by itself when you ask something; you can also start it now.',
    ollamaStart: 'Start Ollama',
    ollamaStarting: 'Starting…'
  },

  model: {
    none: 'No model installed',
    select: 'Model used in this chat'
  },

  learned: {
    title: "I'll remember this",
    dismiss: 'Dismiss',
    forget: 'Forget'
  },

  sidebar: {
    apps: 'Apps',
    code: 'Code',
    search: 'Search chats',
    conversations: 'Chats',
    noResults: (query: string) => `No results for “${query}”.`,
    empty: 'No chats yet. Your first one will show up here once you send a message.',
    settings: 'Settings',
    titleLabel: 'Chat name',
    answering: 'Writing a response',
    privateChat: 'Private chat',
    waitingApproval: 'Waiting for your approval',
    optionsFor: (title: string) => `Options for ${title}`,
    confirmDelete: 'Delete this chat permanently?',
    pin: 'Pin',
    unpin: 'Unpin',
    rename: 'Rename'
  },

  attachments: {
    add: 'Attach files',
    addTitle: 'Attach files: text, PDF, Word, Excel or images',
    remove: (name: string) => `Remove ${name}`,
    enlarge: (name: string) => `Enlarge ${name}`,
    truncated: 'Long file: only the beginning is read',
    reading: 'Reading file…'
  },

  steps: {
    plan: 'Plan',
    planCount: (done: number, total: number) => `${done} of ${total}`,
    running: 'running',
    exitCode: (code: number) => (code === 0 ? 'succeeded' : `failed (${code})`),
    timedOut: 'timed out',
    noOutput: '(no output)',
    effects: (changed: number, deleted: number, created: number) =>
      [changed && `${changed} ${changed === 1 ? 'file' : 'files'} changed`, deleted && `${deleted} deleted`, created && `${created} new`].filter(Boolean).join(', '),
    effectsUndo: 'Undo under the reply undoes these too.',
    effectsLost: (files: string) => `The earlier version was not kept, so this cannot be brought back: ${files}`,
    effectsDeleted: 'deleted',
    effectsCreated: 'new',
    label: 'File tools used'
  },

  diff: {
    tooLarge: 'This file is too large to compare line by line. New content:',
    label: 'Changes',
    unchanged: (count: number) => (count === 1 ? '1 unchanged line' : `${count} unchanged lines`),
    added: 'Added: ',
    removed: 'Removed: '
  },

  approval: {
    alwaysEdits: 'Always allow in this chat',
    alwaysEditsHint: 'Creating, changing and moving files will not be asked again in this chat. Deleting is still not possible.',
    alwaysCommand: 'Always allow this command',
    alwaysCommandHint: 'The exact same command will not be asked again in this chat. Other commands are still asked.',
    trustedNote: 'File edits run without asking in this chat.',
    revoke: 'Revoke',
    create: 'Atlas wants to create a new file',
    change: 'Atlas wants to change a file',
    move: 'Atlas wants to move a file',
    trash: 'Atlas wants to move a file to the trash',
    command: 'Atlas wants to run this command',
    commandNote: 'The command runs in the project folder and its output is given to Atlas. It can take up to 2 minutes.',
    moveTo: 'to:',
    trashNote: "The file isn't deleted permanently. You can restore it from the trash.",
    protectedWarning: 'Other programs may run this file automatically. Review it carefully.'
,
    recheckWarning:
      'You chose "always allow" for this command, but since then Atlas changed files without asking you. The command may run those files, so you are asked again.'
  },

  folder: {
    attach: 'Connect a folder',
    attachHint: 'Connect a folder whose files Atlas can read',
    allowed: "Folders you've allowed",
    pickAnother: 'Choose another folder…',
    detach: 'Disconnect from this chat',
    scopeNote: 'Atlas can only see inside the folder you connect.',
    asksFirst: 'It asks you every time before changing a file.'
  },

  code: 'code',
  logoLabel: (appName: string) => `${appName} logo`
}
