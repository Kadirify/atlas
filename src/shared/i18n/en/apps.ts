import type { Dict } from '../tr'

export const apps: Dict['apps'] = {
  backToApps: 'Back to apps',
  addFavorite: 'Add to favorites',
  removeFavorite: 'Remove from favorites',
  promptText: 'Instructions text',

  gallery: {
    title: 'Apps',
    importApp: 'Import',
    newApp: 'New app',
    search: 'Search apps',
    noMatch: (query: string) => `No apps match “${query}”.`,
    favorites: 'Favorites',
    mine: 'Your apps',
    builtin: 'Built-in apps',
    addFavoriteFor: (name: string) => `${name}: add to favorites`,
    removeFavoriteFor: (name: string) => `${name}: remove from favorites`,
    corporateNote: 'Email, meeting, announcement and document apps appear when business use is turned on.',
    enableCorporate: 'Turn on business apps'
  },

  run: {
    notFound: 'This app could not be found. It may have been deleted, or business use may be turned off.',
    formSection: 'Details',
    resultSection: 'Result',
    attachFile: 'Attach file',
    attachHint: 'Instead of pasting text, you can attach the file: PDF, Word, Excel or plain text.',
    generate: 'Generate',
    regenerate: 'Regenerate',
    continueInChat: 'Continue in chat',
    empty: 'Fill in the form and select “Generate”. The result will appear here.',
    writing: 'Writing',
    history: 'History',
    fromFile: 'Generated from a file',
    removeRun: 'Remove this result from history',
    quickRefines: ['Shorten', 'Make it longer', 'Make it more formal', 'Make it friendlier'],
    refinePlaceholder: 'Ask for another change, e.g. remove the last paragraph',
    refineLabel: 'Ask for a change to the result',
    menu: {
      label: 'App options',
      confirmDelete: 'Permanently delete this app and its history?',
      duplicate: 'Duplicate and edit',
      copyName: (name: string) => `${name} (copy)`,
      edit: 'Edit',
      exportApp: 'Export',
      exported: 'Saved to file.'
    }
  },

  studio: {
    titleNew: 'New app',
    titleReview: 'Review and save your app',
    titleEdit: (name: string) => `Edit ${name}`,
    backToApp: 'Back to app',
    heading: 'What should your app do?',
    lead: 'Describe it in a sentence. Atlas turns it into detailed instructions, then builds an app with a form from them.',
    requestPlaceholder: 'E.g. write emails like a corporate IT director',
    requestLabel: 'What the app should do',
    examplesLabel: 'Example requests',
    examples: [
      'Write emails like a corporate IT director',
      'Reply to a customer complaint politely, with a focus on solutions',
      'Prepare a weekly status report',
      'Write a short, professional LinkedIn post'
    ],
    improve: 'Improve instructions',
    improveAgain: 'Start over',
    writeMyself: "I'll write the instructions myself",
    promptTemplate: '## Role\nYou are ...\n\n## Goal\n...\n\n## Rules\n- Do not make up information that was not provided.',
    prompt: 'Instructions',
    versions: 'Instruction versions',
    version: (n: number) => `Version ${n}`,
    promptHint: 'You can also edit the text by hand. The app runs on these instructions.',
    promptRefines: ['More formal', 'Shorter', 'More detailed', 'Tighten the rules'],
    refinePlaceholder: 'Ask for another change, e.g. add the support line to the end of every email',
    refineLabel: 'Ask for a change to the instructions',
    buildTitle: 'Turn this into an app?',
    buildLead: 'Atlas suggests a name, icon and form fields based on the instructions. You can change them before saving.',
    build: 'Create app',
    building: 'Preparing the form'
  },

  editor: {
    backToPrompt: 'Back to instructions',
    appSection: 'App',
    name: 'Name',
    description: 'Description',
    descriptionHint: 'Shown under the name in the gallery.',
    icon: 'Icon',
    fieldsSection: 'Form fields',
    fieldsLead: 'The details you fill in each time you use the app.',
    addField: 'Add field',
    promptSection: 'Instructions',
    promptLead: 'Tells the model how to write. The form details are sent along with these instructions on every run.',
    saveChanges: 'Save changes',
    saveApp: 'Save app',
    preview: 'Preview',
    unnamed: 'Untitled app',
    noDescription: 'No description',
    fieldType: {
      text: 'Short text',
      textarea: 'Long text',
      select: 'Dropdown',
      toggle: 'Yes / No'
    },
    fieldNamePlaceholder: 'Field name',
    fieldNameLabel: (n: number) => `Field ${n} name`,
    fieldTypeLabel: (n: number) => `Field ${n} type`,
    optionsPlaceholder: 'Options, separated by commas: Formal, Friendly',
    optionsLabel: (n: number) => `Field ${n} options`,
    samplePlaceholder: 'Placeholder text (optional)',
    sampleLabel: (n: number) => `Field ${n} placeholder text`,
    required: 'Required',
    moveUp: 'Move up',
    moveDown: 'Move down',
    removeField: 'Delete field',
    problems: {
      name: 'Give your app a name.',
      prompt: 'Instructions cannot be empty.',
      fieldLabel: 'Every field needs a name.',
      options: 'Dropdowns need at least two options.'
    }
  },

  form: {
    optional: (label: string) => `${label} (optional)`
  },

  modelPicker: {
    label: 'Model used for this app',
    defaultModel: 'Default model',
    defaultWith: (model: string) => `Default (${model})`,
    notInstalled: (model: string) => `${model} (not installed)`
  }
}
