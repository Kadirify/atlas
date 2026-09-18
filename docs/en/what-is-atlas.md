# What is Atlas?

Atlas is an AI assistant that runs on your own computer. It chats, writes and proofreads, reads documents, writes code and queries databases, all without an internet connection, using your computer's processor and graphics card.

Your questions, the files you attach and your chats never go to a server. There is no account to create, no subscription and no terms of service you have to trust.

## Why we built it

Cloud AI assistants are very capable, but they don't fit every job:

- **Company data must not leave the building.** Pasting a contract, a customer list, a payroll sheet or source code into a cloud service is forbidden in many companies.
- **The internet is not always there.** On a plane, on site or on a closed network there is no cloud assistant.
- **Subscriptions are not for everyone.** Students, small businesses and occasional users find monthly fees heavy.
- **Turkish comes second.** Most small open models make spelling mistakes in Turkish, mix up suffixes and struggle with formal writing.

Atlas fills that gap: a free assistant that is good at Turkish and keeps everything on your machine.

## What it does

| Task | Example |
| --- | --- |
| Chat and writing | "Write a short apology email for the delay", "Make this paragraph more formal" |
| Proofreading | Fixes Turkish spelling and punctuation; the Atlas models were trained specifically for this |
| Documents | Attach a PDF, Word or Excel file, ask questions, get summaries; open it side by side and fix a selected passage |
| Mini apps | One-click apps for minutes, formal letters, translation, summaries; build your own |
| Code | Open a project folder; Atlas reads files, proposes changes, runs the tests and checks the result |
| Databases | Connects to SQL Server, PostgreSQL, MySQL or SQLite; reads tables, procedures and triggers, writes queries for your questions |
| Desktop | Fix or translate text selected in any program with a shortcut; a small quick-ask window from anywhere |

## Its own models

Atlas comes with its own model family: **Atlas Light, Medium, Strong and Code.** They are not trained from scratch. They are fine-tunes of open, Apache 2.0 licensed base models (Google's Gemma 4 and Alibaba's Qwen), trained for Turkish on a single home computer with a 12 GB graphics card.

The result: the Atlas models keep their base models' general ability while being clearly better at Turkish proofreading. For example, on a test of 300 rule-corrupted Turkish sentences, Atlas Strong gets 85% right versus 66% for its base model.

See [How the Atlas models were trained](training.md) for the full story, including what did not work.

## What it doesn't do

- **It is not as strong as cloud models.** 4 to 14 billion parameter models are good for everyday work but make mistakes on long, complex tasks.
- **It doesn't know current events.** It never goes online, so it doesn't know today's news or new libraries.
- **It needs hardware.** The smallest model runs with 8 GB of RAM; an 8 GB+ graphics card is recommended for comfortable use.
- **Windows only, for now.**

## In short

Atlas is for people who want to use AI without handing their data to anyone. Install it, pick a model, and everything else stays on your computer.
