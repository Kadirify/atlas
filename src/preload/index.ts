import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/types'

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  documents: {
    get: (id) => call('documents:get', id),
    original: (id) => call('documents:original', id),
    save: (id, text) => call('documents:save', id, text),
    reset: (id) => call('documents:reset', id),
    export: (id, format) => call('documents:export', id, format)
  },
  lock: {
    state: () => call('lock:state'),
    setPin: (pin, current) => call('lock:setPin', pin, current),
    disable: (current) => call('lock:disable', current),
    lock: () => call('lock:lock'),
    unlock: (pin) => call('lock:unlock', pin),
    onChanged: (cb) => on('lock:changed', cb)
  },
  hardware: {
    scan: () => call('hardware:scan')
  },
  ollama: {
    status: () => call('ollama:status'),
    start: () => call('ollama:start'),
    install: () => call('ollama:install'),
    onInstallProgress: (cb) => on('ollama:installProgress', cb)
  },
  models: {
    recommend: () => call('models:recommend'),
    installed: () => call('models:installed'),
    supportsVision: (model) => call('models:supportsVision', model),
    supportsTools: (model) => call('models:supportsTools', model),
    pull: (model) => call('models:pull', model),
    cancelPull: (model) => call('models:cancelPull', model),
    remove: (model) => call('models:remove', model),
    benchmark: (model) => call('models:benchmark', model),
    loaded: () => call('models:loaded'),
    unload: (model) => call('models:unload', model),
    onPullProgress: (cb) => on('models:pullProgress', cb)
  },
  conversations: {
    list: () => call('conversations:list'),
    create: (options) => call('conversations:create', options),
    setFolder: (id, folderId) => call('conversations:setFolder', id, folderId),
    setSql: (id, sqlId) => call('conversations:setSql', id, sqlId),
    rename: (id, title) => call('conversations:rename', id, title),
    setPinned: (id, pinned) => call('conversations:setPinned', id, pinned),
    setModel: (id, model) => call('conversations:setModel', id, model),
    remove: (id) => call('conversations:remove', id),
    messages: (id) => call('conversations:messages', id),
    search: (query) => call('conversations:search', query),
    export: (id, format) => call('conversations:export', id, format),
    onUpdated: (cb) => on('conversations:updated', cb)
  },
  chat: {
    send: (conversationId, content, attachmentIds) => call('chat:send', conversationId, content, attachmentIds),
    regenerate: (conversationId) => call('chat:regenerate', conversationId),
    edit: (messageId, content) => call('chat:edit', messageId, content),
    stop: (conversationId) => call('chat:stop', conversationId),
    onChunk: (cb) => on('chat:chunk', cb),
    onThinking: (cb) => on('chat:thinking', cb),
    onStep: (cb) => on('chat:step', cb),
    onDone: (cb) => on('chat:done', cb),
    onError: (cb) => on('chat:error', cb)
  },
  personas: {
    list: () => call('personas:list'),
    save: (draft, id) => call('personas:save', draft, id),
    remove: (id) => call('personas:remove', id)
  },
  folders: {
    list: () => call('folders:list'),
    capability: () => call('folders:capability'),
    add: () => call('folders:add'),
    remove: (id) => call('folders:remove', id),
    index: (id) => call('folders:index', id),
    actions: (folderId) => call('folders:actions', folderId),
    onIndexProgress: (cb) => on('folders:indexProgress', cb),
    onApproval: (cb) => on('folders:approval', cb),
    respond: (approvalId, approved, remember) => call('folders:respond', approvalId, approved, remember),
    trust: (conversationId) => call('folders:trust', conversationId),
    revokeTrust: (conversationId) => call('folders:revokeTrust', conversationId),
    undo: (messageId) => call('folders:undo', messageId),
    onCommandOutput: (cb) => on('folders:commandOutput', cb)
  },
  code: {
    list: (folderId, rel) => call('code:list', folderId, rel),
    read: (folderId, rel) => call('code:read', folderId, rel),
    open: (folderId, rel) => call('code:open', folderId, rel),
    reveal: (folderId, rel) => call('code:reveal', folderId, rel)
  },
  sql: {
    list: () => call('sql:list'),
    save: (input, id) => call('sql:save', input, id),
    remove: (id) => call('sql:remove', id),
    test: (id) => call('sql:test', id),
    pickFile: () => call('sql:pickFile'),
    schema: (id) => call('sql:schema', id),
    definition: (id, object) => call('sql:definition', id, object),
    run: (id, sql) => call('sql:run', id, sql),
    respond: (approvalId, approved) => call('sql:respond', approvalId, approved),
    onApproval: (cb) => on('sql:approval', cb),
    onResult: (cb) => on('sql:result', cb)
  },
  whatsapp: {
    parse: (name, bytes) => call('whatsapp:parse', name, bytes),
    build: (request) => call('whatsapp:build', request),
    profile: (personaId) => call('whatsapp:profile', personaId),
    setSimilarity: (personaId, level) => call('whatsapp:setSimilarity', personaId, level),
    onProgress: (cb) => on('whatsapp:progress', cb)
  },
  memory: {
    list: () => call('memory:list'),
    status: () => call('memory:status'),
    add: (text, category) => call('memory:add', text, category),
    update: (id, text, category) => call('memory:update', id, text, category),
    remove: (id) => call('memory:remove', id),
    clear: () => call('memory:clear'),
    enableSemantic: () => call('memory:enableSemantic'),
    onLearned: (cb) => on('memory:learned', cb)
  },
  attachments: {
    add: (name, mime, bytes) => call('attachments:add', name, mime, bytes),
    remove: (id) => call('attachments:remove', id)
  },
  apps: {
    list: () => call('apps:list'),
    save: (draft, id) => call('apps:save', draft, id),
    remove: (id) => call('apps:remove', id),
    setFavorite: (id, favorite) => call('apps:setFavorite', id, favorite),
    setModel: (id, model) => call('apps:setModel', id, model),
    run: (request) => call('apps:run', request),
    runs: (appId) => call('apps:runs', appId),
    removeRun: (id) => call('apps:removeRun', id),
    toConversation: (runId) => call('apps:toConversation', runId),
    exportFile: (id) => call('apps:exportFile', id),
    importFile: () => call('apps:importFile')
  },
  studio: {
    improve: (request) => call('studio:improve', request),
    buildApp: (prompt, model) => call('studio:buildApp', prompt, model)
  },
  jobs: {
    stop: (jobId) => call('jobs:stop', jobId),
    onChunk: (cb) => on('jobs:chunk', cb),
    onDone: (cb) => on('jobs:done', cb),
    onError: (cb) => on('jobs:error', cb)
  },
  settings: {
    get: () => call('settings:get'),
    set: (patch) => call('settings:set', patch)
  },
  app: {
    version: () => call('app:version'),
    dataPath: () => call('app:dataPath'),
    setTitleBarTheme: (dark) => call('app:setTitleBarTheme', dark),
    checkUpdates: () => call('app:checkUpdates'),
    isPackaged: () => call('app:isPackaged'),
    onNewChat: (cb) => on('app:newChat', () => cb()),
    onOpenConversation: (cb) => on('app:openConversation', cb),
    downloadUpdate: () => call('app:downloadUpdate'),
    onUpdateProgress: (cb) => on('app:updateProgress', cb),
    installUpdate: () => call('app:installUpdate'),
    whatsNew: () => call('app:whatsNew'),
    dismissWhatsNew: () => call('app:dismissWhatsNew'),
    showMain: () => call('app:showMain')
  },
  panel: {
    request: () => call('panel:request'),
    onOpen: (cb) => on('panel:open', cb),
    run: (action, text, instruction) => call('panel:run', action, text, instruction),
    replace: (text) => call('panel:replace', text),
    copy: (text) => call('panel:copy', text),
    hide: () => call('panel:hide'),
    toChat: (question, answer) => call('panel:toChat', question, answer),
    shortcutStatus: () => call('panel:shortcutStatus')
  }
}

contextBridge.exposeInMainWorld('api', api)
