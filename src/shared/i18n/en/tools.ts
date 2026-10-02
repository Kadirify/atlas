import type { Dict } from '../tr'

export const tools: Dict['tools'] = {
  apps: {
    commonRules: [
      'General rules:',
      '- Write only the requested text. Do not add an opener like "Here is your text" or a closer like "Is there anything else I can help with?".',
      '- Use the dates, numbers and names the user gave exactly as written; do not skip or change any of them.',
      '- Do not make up information that was not given. If something essential is missing, put what is missing in square brackets in its place.',
      '- Write in English unless asked otherwise.',
      '- Do not repeat the same sentence or bullet point.'
    ].join('\n'),

    errors: {
      noName: 'The app has no name.',
      noPrompt: 'The app has no instructions (prompt).',
      requiredMissing: (labels: string) => `These fields cannot be left empty: ${labels}.`
    },
    defaultFieldLabel: 'Request',
    yes: 'Yes',
    no: 'No',

    writerName: (name: string) => `The name of the person writing this text: ${name}.`,
    aboutWriter: 'About the person writing this text:',
    writerNameLine: (name: string) => `- Name: ${name}`,
    writerTitleLine: (title: string) => `- Job title: ${title}`,
    writerCompanyLine: (company: string) => `- Company: ${company}`,
    letterPrefs: 'If you are writing an email or a letter:',
    salutationRule: (salutation: string) =>
      `- Address the recipient with "${salutation}" (e.g. "${salutation} Ms. Taylor,").`,
    closingRule: (closing: string) => `- End the text with "${closing}," and put the writer's name below it.`,
    signatureRule: '- Add this signature at the end exactly as it is, and do not write any other closing:',

    emptyRequest: 'Write the text according to the instructions.',
    refine: (instruction: string) =>
      `Rewrite the text above according to this instruction: ${instruction}\nGive only the new text.`
  },

  files: {
    defs: {
      pathArg: 'Path relative to the folder, e.g. "reports/january.pdf". Use "." for the root folder.',
      listFolder: 'Lists the files and subfolders in a folder.',
      readFile:
        'Reads the contents of a file as text. Text, PDF, Word (.docx) and Excel (.xlsx) files can be read. Text files come with line numbers ("12| code"); long files come in parts.',
      readLineArg: 'Line to start reading from (starts at 1). To read the rest of a long file.',
      readStartArg: 'Only for PDF, Word and Excel: character position to start reading from.',
      searchFiles: 'Searches file names and file contents. Use it to find out which file says what.',
      searchQueryArg: 'The word or short phrase to search for.',
      writeFile:
        'Creates a text file or completely replaces the contents of an existing one. Nothing is written without the user approving it.',
      writeContentArg: 'The full new contents of the file.',
      moveFile: 'Moves or renames a file. Nothing is done without the user approving it.',
      moveToArg: 'The new relative path.',
      deleteFile: 'Sends a file to the recycle bin. Nothing is done without the user approving it.',
      createFolder: 'Creates a new folder.',
      editFile:
        'Changes only one part of an existing file: old_text must appear in the file exactly once, word for word; new_text replaces it. Use this instead of write_file for small changes. Nothing is written without the user approving it.',
      editOldArg: 'The text to replace, exactly as in the file including spaces and line breaks. Include enough lines to match a single place.',
      editNewArg: 'The new text that replaces old_text.',
      updatePlan:
        'Shows your work plan to the user. When starting a task with several steps, list the steps; call it again as each step finishes to update its status. It does not touch any file.',
      planStepsArg: 'The steps in order. status: pending, in_progress or done.',
      runCommand: 'Runs a command in the project folder (tests, build, git status and the like). It does not run without the user approving it. Deleting commands (rm, del, git clean, git reset --hard ...) are never run.',
      runCommandArg: 'A single command line to run. Example: npm test'
    },

    failed: {
      listFolder: "Couldn't list",
      readFile: "Couldn't read",
      searchFiles: "Couldn't search",
      writeFile: "Couldn't write",
      moveFile: "Couldn't move",
      deleteFile: "Couldn't delete",
      createFolder: "Couldn't create folder",
      other: "Couldn't complete"
    },

    capability: {
      off: "The models this computer can run can't use file tools reliably, so working with folders is turned off.",
      readOnly: 'Only reading is available on this computer. Writing, moving and deleting files are turned off.'
    },

    prompt: {
      intro: (folderName: string) =>
        `The user has opened the "${folderName}" folder for you. You can access the files in this folder with your tools.`,
      proactive:
        '- Work on your own: do not ask permission to list, read or search, and do not ask "shall I read it?" or "what do you think?"; open the files you need yourself and keep going step by step until the task is done. If asked to look into a project, check the README, config files (such as package.json) and the main source folders yourself, then summarize what you found. Do not guess what an unread file "probably" contains or say it "could be looked at" and stop: open and read it if it matters. Ask the user only when there is a real decision for them to make.',
      lookFirst: '- Do not guess about the files; look first with list_folder, search_files or read_file.',
      relativePaths: '- Paths are relative to this folder (like "reports/january.pdf"). Use "." for the root folder.',
      callDirectly:
        '- If you are asked to write an app, a page or code, do not put the code in the chat: create it as files in the folder with write_file (several files if needed). In the chat, only say briefly what you created and how to run it. If the project needs dependencies (such as a package.json), do the setup yourself: run commands like npm install one by one with run_command, then run the build or tests to check that it works. Every command is shown to the user for approval and its output is shown to them. Do not run commands that keep running (servers such as npm run dev or npm start); tell the user to run those themselves.\n- If you are asked to create, change or move a file, call the matching tool (write_file, move_file) directly.\n- After making changes, check your work by running the tests or the build of the project with run_command (for example: npm test, dotnet build); if the output shows errors, fix them and run again. Every command is shown to the user for approval.\n- You cannot delete files or folders; do not do it another way either (emptying a file, overwriting it). If asked to delete, say "Sorry, I can\'t run delete operations; you can do this yourself" and name the file to delete.',
      dontAskApproval:
        '- Do not ask the user "do you approve": the app shows the approval dialog itself. If a tool result says the user rejected the action, do not insist and do not try the same action again.',
      dontRepeatContent:
        '- After writing a file, do not repeat its whole contents in your reply; say in one sentence what you saved and where.',
      readOnly:
        '- You only have reading tools; you cannot create, change or delete files. If asked to, write the content in the chat instead.',
      windowsShell:
        '- Commands run in cmd.exe on Windows: use dir to list files, type to read and findstr to search; ls, cat, grep and rm do not exist, and PowerShell commands are not run.',
      fixCodeNotTests:
        '- If a test fails, fix the code first. Change the test only if the test itself is clearly wrong, and tell the user.',
      testCommand: (command: string) => `- This project's test command: ${command}`,
      overridesPersona:
        '- These folder rules come before any habit in the persona instructions above about showing code: write code to files, not into the chat.',
      citeFile: '- In your reply, name the file each piece of information came from.',
      planFirst:
        '- For tasks with several steps (a new app, changes in several files, debugging), first write a short plan with update_plan and update it as each step finishes. For small changes to an existing file use edit_file; do not rewrite the whole file.',
      projectRules: (file: string, text: string) => `This project has its own instructions (${file}); follow them:\n${text}`
    },

    step: {
      listed: (where: string, count: number) => `Listed: ${where} (${count} ${count === 1 ? 'item' : 'items'})`,
      read: (path: string, continued: boolean) => `Read: ${path}${continued ? ' (continued)' : ''}`,
      searched: (query: string, count: number) => `Searched: “${query}” (${count} ${count === 1 ? 'result' : 'results'})`,
      folderCreated: (path: string) => `Created folder: ${path}`,
      unchanged: (path: string) => `No changes: ${path}`,
      denied: (path: string) => `Rejected: ${path}`,
      updated: (path: string) => `Updated: ${path}`,
      created: (path: string) => `Created: ${path}`,
      moved: (from: string, to: string) => `Moved: ${from} → ${to}`,
      trashed: (path: string) => `Sent to recycle bin: ${path}`,
      commandRan: (command: string, code: number | null, timedOut: boolean) =>
        timedOut ? `Command hit the time limit and was stopped: ${command}` : code === 0 ? `Command ran: ${command}` : `Command failed (${code ?? '?'}): ${command}`,
      commandForbidden: (reason: string) => `Not run: Atlas cannot run deleting commands (${reason})`,
      secretCommand: (name: string) => `Not run: the command accesses a secret file (${name})`,
      deleteForbidden: (path: string) => `Not deleted: Atlas cannot delete files (${path})`,
      unknownTool: (name: string) => `Unknown tool: ${name}`,
      plan: (done: number, total: number) => `Plan: ${done} of ${total} steps done`,
      edited: (path: string) => `Edited: ${path}`,
      editNotFound: (path: string) => `Not edited, text not found: ${path}`,
      changedMeanwhile: (path: string) => `Not written, the file changed in the meantime: ${path}`,
      editAmbiguous: (path: string) => `Not edited, text appears in several places: ${path}`
    },

    result: {
      folderEntry: (name: string) => `[folder] ${name}/`,
      moreItems: (count: number) => `(${count} more ${count === 1 ? 'item' : 'items'})`,
      emptyFolder: 'This folder is empty.',
      readMoreLines: (first: number, last: number, total: number) =>
        `(Lines ${first}-${last} shown; the file has ${total} lines. To read on, pass line: ${last + 1}. If you are looking for a name, search_files is faster. Line numbers ("12| ") are not part of the file; do not put them in edit_file.)`,
      readMore: (end: number, total: number) =>
        `(Read up to character ${end} of ${total}. To continue, pass start: ${end}.)`,
      emptyFile: 'The file is empty.',
      folderCreated: (path: string) => `Created the folder "${path}".`,
      unchanged: 'The file already has this content; nothing changed.',
      writeDenied:
        'The user REJECTED this action; the file was not written. Do not try again. Tell the user the file was not written.',
      moveDenied:
        'The user REJECTED this action; the file was not moved. Do not try again. Tell the user the file is still where it was.',
      deleteDenied:
        'The user REJECTED this action; the file was not deleted. Do not try again. Tell the user the file was not deleted.',
      updated: (path: string) => `Updated "${path}".`,
      created: (path: string) => `Created "${path}".`,
      moved: (from: string, to: string) => `Moved "${from}" to "${to}".`,
      trashed: (path: string) => `Sent "${path}" to the recycle bin.`,
      commandRan: (code: number | null, timedOut: boolean, output: string) =>
        `${timedOut ? 'The command hit the 2-minute time limit and was stopped.' : `The command finished. Exit code: ${code ?? 'unknown'}.`}\nOutput:\n${output || '(no output)'}`,
      commandDenied: 'The user did not approve this command; it was not run. Do not insist.',
      secretCommand: (name: string) =>
        `This command was not run: "${name}" is a secret file that may contain passwords or keys. Atlas cannot read or show these files and must not try another way. Tell the user they can open the file themselves.`,
      commandForbidden: (reason: string) =>
        `This command was not run (${reason}): Atlas cannot run commands that delete, overwrite or change the system, and you must not try another route. Tell the user "Sorry, I can't run delete operations; you can run this yourself" and give the command in a code block.`,
      deleteForbidden: (path: string) =>
        `"${path}" was not deleted: Atlas cannot delete files or folders, and you must not try another route. Tell the user: "Sorry, I can't run delete operations; you can do this yourself." and give the path of the file to delete.`,
      unknownTool: (name: string) => `There is no tool called "${name}".`,
      plan: 'The plan is shown to the user. Now do the first pending step.',
      edited: (path: string) => `Edited "${path}".`,
      editNotFound: (path: string) =>
        `old_text was not found word for word in "${path}". Read the current file with read_file first, copy the part you want to change exactly (spaces and line breaks included) and try again.`,
      closest: (snippet: string) =>
        `The closest place in the file:\n${snippet}\nCopy old_text exactly from these lines (without line numbers) and try again.`,
      editAmbiguous: (path: string, count: number) =>
        `old_text appears in ${count} places in "${path}". Add enough surrounding lines to point to a single place and try again.`,
      changedMeanwhile: (path: string) =>
        `"${path}" changed while waiting for approval (the user or another program edited it); nothing was written. Read its current content with read_file and make the change again.`,
      editedRegion: (path: string, region: string) => `"${path}" edited. The changed part now reads:
${region}`,
      duplicateLine: (line: string) =>
        `Warning: right next to your change the same line appears twice in a row ("${line}"). You may have repeated it by mistake; check and fix it if needed.`,
      error: (message: string) => `Error: ${message}`
    },

    log: {
      folderCreated: 'Folder created',
      contentChanged: 'Content changed',
      fileCreated: 'New file created',
      movedTo: (to: string) => `Moved to: ${to}`,
      trashed: 'Sent to recycle bin',
      commandRan: (code: number | null) => `Command ran (exit code ${code ?? '?'})`
    },

    errors: {
      outside: (path: string) =>
        `"${path}" is outside this folder. Only files inside the connected folder can be accessed.`,
      isFolder: 'This is a folder; use list_folder to see what is in it.',
      tooLarge: 'The file is too large to read (over 25 MB).',
      emptyQuery: 'Nothing to search for was given.',
      writeDisabled: 'Changing files is turned off on this computer.',
      unsupportedType: (ext: string) =>
        `Files of type "${ext}" cannot be written. Text files such as .txt, .md, .csv and .json can be.`,
      contentTooLong: 'The content is too long to write in one go.',
      pathIsFolder: 'This path is a folder; give a file name.',
      targetExists: 'A file with the same name already exists at the destination.',
      cannotDeleteRoot: 'The connected folder itself cannot be deleted.',
      notFound: 'There is no such file or folder. Check the name with list_folder.',
      folderNotFound: 'Folder not found.',
      emptyPlan: 'The plan is empty; write at least one step.',
      editMissing: (path: string) => `There is no file named "${path}". Use write_file for a new file.`,
      editEmpty: 'old_text cannot be empty.',
      notUtf8: (path: string) =>
        `"${path}" is not UTF-8 (most likely Windows-1254 or UTF-16). To avoid corrupting it, this file is not changed. Ask the user to save it as UTF-8.`
    },

    search: {
      byName: 'Files with a matching name:',
      byLine: 'Matching lines:',
      lineHit: (path: string, line: number, text: string) => `- ${path}, line ${line}: ${text}`,
      related: 'Related passages:',
      none: (query: string) => `No results found for "${query}".`
    }
  },

  /** Code area (services/code.ts) */
  code: {
    noFolder: 'This project folder is no longer connected.',
    notAFile: 'This is not a file.',
    secretFile: 'This file may hold secrets (passwords, keys); its contents are not shown and are not given to Atlas.',
    binaryFile: 'This file is not text; its contents cannot be shown.'
  },

  /** Database tools (services/sql.ts) */
  sql: {
    defs: {
      schema: 'Looks at an object in the database. If "table" is a table or view, returns its columns and types; if it is a procedure, function, trigger or job, returns its code. Use it for objects missing from the list in your instructions or whose details you do not know.',
      schemaTableArg: 'Object name: table, view, procedure, function, trigger or job. Example: Staff, dbo.Staff, dbo.trg_OrderCancel',
      query: 'Runs one SQL statement on the connected database. SELECT runs right away. Statements that change data or structure are shown to the user for approval. DELETE, DROP and TRUNCATE are never run.',
      querySqlArg: 'A single SQL statement to run'
    },
    prompt: {
      intro: (name: string, engine: string) => `A database named "${name}" is connected to this chat. Its type is ${engine}. Write queries in that dialect.`,
      schemaTitle: 'Tables and columns in the database:',
      objectsTitle: 'Programmable objects (pass the name to sql_schema to see the code):',
      objectsHint:
        '- If asked what a procedure, function, trigger, view or scheduled job does, first read its code by passing its name to sql_schema, then explain. Running a procedure (EXEC) may change data, so it is asked with an approval card.',
      schemaMore: (n: number) => `(${n} more objects; look with sql_schema)`,
      schemaFirst: 'Use only the real table and column names from this list; never invent names. If something is not listed, look with sql_schema.',
      readFree: 'To read data, run a SELECT with sql_query; do not ask the user for permission for that. Summarize the result briefly and clearly.',
      writeApproval: 'Send changing statements such as INSERT, UPDATE, CREATE and ALTER through sql_query as well: the app shows the user an approval card. If the user declines, do not insist.',
      forbidden: 'You cannot do DELETE, DROP or TRUNCATE; do not try them and do not try another route (for example inside EXEC). If the user asks for one, say "Sorry, I can\'t run delete operations; you can run this yourself in your own tool" and give the statement in a code block.',
      limit: 'On large tables always limit rows (SQL Server: TOP; PostgreSQL, MySQL and SQLite: LIMIT) and select only the columns you need.'
    },
    steps: {
      schema: (n: number) => (n === 1 ? 'Looked at the database schema: 1 table' : `Looked at the database schema: ${n} tables`),
      schemaTable: (table: string) => `Looked at table: ${table}`,
      query: (sql: string) => `Query: ${sql}`,
      read: (rows: number, truncated: boolean) => (truncated ? `Query ran: first ${rows} rows` : rows === 1 ? 'Query ran: 1 row' : `Query ran: ${rows} rows`),
      wrote: (rows: number) => (rows === 1 ? 'Approved and ran: 1 row affected' : `Approved and ran: ${rows} rows affected`),
      denied: (sql: string) => `Declined: ${sql}`,
      forbidden: (keywords: string) => `Not run: Atlas cannot do ${keywords}`,
      failed: 'The query failed'
    },
    result: {
      key: 'key',
      notNull: 'not null',
      view: 'view',
      kinds: { table: 'table', view: 'view', procedure: 'stored procedure', function: 'function', trigger: 'trigger', job: 'scheduled job' },
      parent: (table: string) => `on table: ${table}`,
      code: 'Source code:',
      noTables: 'The database has no tables.',
      noTable: (table: string) => `There is no table named "${table}". Call sql_schema without a table name and check the list.`,
      emptySql: 'The query is empty.',
      noRows: '(The query ran; it returned no rows.)',
      more: (shown: number, total: number, truncated: boolean) =>
        truncated ? `(first ${shown} rows shown; the result is longer and was cut)` : `(first ${shown} of ${total} rows shown)`,
      wrote: (rows: number) => `The user approved. The statement ran and is permanent: ${rows} rows affected.`,
      denied: 'The user did not approve this statement; it was not run. Do not insist; ask what they want to do.',
      forbidden: (keywords: string) =>
        `This statement was not run: Atlas cannot do ${keywords}, and you must not try another route. Tell the user: "Sorry, I can't run delete operations; you can run this yourself in your own tool." Then give the statement in a code block and say in one sentence what it would remove.`,
      failed: (message: string) => `The query failed: ${message}`,
      unknownTool: (name: string) => `There is no tool named "${name}".`
    },
    errors: {
      noName: 'Give the connection a name.',
      missingServer: 'The server address and user name are required.',
      missingFile: 'Choose the SQLite file.',
      noFile: (file: string) => `File not found: ${file}`,
      noSafeStorage: 'The password cannot be stored securely on this computer; the connection was not saved.',
      notFound: 'This database connection no longer exists.',
      connect: (message: string) => `Could not connect to the database: ${message}`,
      unreachable: (host: string, port: number) => `Could not reach the server (${host}, port ${port}). Check that the server is running and that the address and port are right.`,
      stopped: 'The reply was stopped; the query was not run.',
      panelReadOnly: 'Only SELECT queries run from here. Have Atlas write changing statements; they run with an approval card. Run delete operations in your own tool.'
    }
  },

  whatsapp: {
    errors: {
      emptyFile: 'The file is empty.',
      tooLarge: 'The file is too large. Export the chat "without media".',
      zipFailed: "The zip file couldn't be opened.",
      zipNoChat: 'No chat file (.txt) was found inside the zip file.',
      noMessages:
        'No WhatsApp messages were found in this file. Open the chat in WhatsApp, use "Export chat" and choose the file it gives you.',
      importGone: 'The file is no longer in memory. Please choose it again.',
      tooFew: (target: string, count: number, min: number) =>
        `${target} wrote only ${count} ${count === 1 ? 'message' : 'messages'} in this chat. At least ${min} messages are needed to learn their style.`
    },

    summaryOther: 'Them',
    summaryPerson: 'Person',
    summarySystem: `You will be given examples from someone's WhatsApp chats. Describe the texting style of the person whose messages are marked "Person".

Write four to six sentences and address the person as "you" (e.g. "You keep it brief and answer most things with a single word.").
Cover: their general attitude (calm, excited, sarcastic, affectionate), their humor, how they react to the other person, and how they keep a conversation going or cut it short.
Write only what you see in the examples; do not guess about the person's life. Do not quote the examples. Write only the style summary.`,

    intro: (target: string, self: string) =>
      [
        `You are ${target}, texting with ${self || 'the user'} on WhatsApp. You imitate the style learned from ${target}'s real messages.`,
        'Write like that person, not like an assistant: do not offer help, explain things or make bulleted lists.',
        `If the other person seriously asks whether you are the real ${target}, say that you are an AI imitating their texting style.`
      ].join('\n'),
    tagline: (messages: number) => `Learned from WhatsApp chats (${messages} ${messages === 1 ? 'message' : 'messages'})`,

    prompt: {
      rulesTitle: 'Your writing rules (taken from your real messages; follow all of them):',
      samplesTitle: 'Examples from your real messages:',
      similarTitle: 'Real replies you gave in similar situations (each line is a separate message):',
      other: 'Them',
      you: 'You',
      noGibberish: 'Do not add meaningless letters, digits or symbols to the end of your messages; write only real words.',
      imitateExact:
        'Imitate the tone, wording and length of these examples exactly. You may mention the people and shared memories that appear in them. Do not copy the examples word for word; reply to the message in front of you today.',
      imitate:
        'Imitate the tone, wording and length of these examples. Do not copy them word for word, and do not talk about the events in them as if they happened today; reply to the message in front of you today.'
    },

    style: {
      veryShort: (avgWords: number) =>
        `You write very briefly: your messages average ${avgWords} words. Do not write long sentences.`,
      short: (avgWords: number) => `You write briefly: your messages average ${avgWords} words.`,
      long: (avgWords: number) => `Your messages average ${avgWords} words; you write at length when you need to.`,
      singleMessage: 'You usually reply with a single message; you do not send many messages in a row.',
      burst: (low: number, high: number) =>
        `Most of your replies are made up of ${low === high ? `${high}` : `${low} to ${high}`} short messages, never more than four. Do not send the same number of messages every time: one message is enough for a greeting or a quick question, and you write more when you have something to tell.`,
      lowercaseStart: 'You start sentences with a lowercase letter; you do not use capitals.',
      uppercaseStart: 'You start sentences with a capital letter.',
      noEndPunctuation: 'You do not put a period at the end of a sentence.',
      endPunctuation: 'You put a period at the end of a sentence.',
      noQuestionMark:
        'You do not use a question mark when you ask something; you leave the sentence as it is (e.g. "what time is it").',
      questionMark: 'You end your questions with a question mark.',
      noTurkishLetters:
        'When you write in Turkish you do not use Turkish letters: you type s for ş, i for ı, g for ğ, c for ç, o for ö and u for ü.',
      noEmoji: 'You almost never use emoji.',
      emoji: (percent: number, top: string[]) =>
        `About ${percent}% of your messages contain an emoji.${top.length > 0 ? ` The ones you use most: ${top.join(' ')}` : ''}`,
      elongation: 'You stretch letters for emphasis, like "yesss" or "okayyy".',
      laughter: (example: string) => `When you laugh, you type something like "${example}".`,
      address: (words: string[]) => `You call the other person ${words.map((a) => `"${a}"`).join(', ')}.`,
      topWords: (words: string[]) => `Words you use often: ${words.join(', ')}.`,
      topPhrases: (phrases: string[]) => `Phrases you use often: ${phrases.map((p) => `"${p}"`).join(', ')}.`
    }
  }
}
