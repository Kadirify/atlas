# Atlas models

Atlas only works with its own model family. Each model is an open base model fine-tuned for Turkish.

| Model | Base | Size | Best for | Ollama | Hugging Face |
| --- | --- | ---: | --- | --- | --- |
| **Atlas Light** | Qwen 3.5 4B | 3.5 GB | Most laptops; everyday chat, email, summaries | [`kadirify/atlas-light`](https://ollama.com/kadirify/atlas-light) | [atlas-light-GGUF](https://huggingface.co/kadirify/atlas-light-GGUF) |
| **Atlas Medium** | Gemma 4 E4B | 7.3 GB | 8 GB graphics cards; the most balanced choice, understands images | [`kadirify/atlas-medium`](https://ollama.com/kadirify/atlas-medium) | [atlas-medium-GGUF](https://huggingface.co/kadirify/atlas-medium-GGUF) |
| **Atlas Strong** | Gemma 4 12B | 9.2 GB | 12 GB+ graphics cards; formal writing, long texts, reasoning | [`kadirify/atlas-strong`](https://ollama.com/kadirify/atlas-strong) | [atlas-strong-GGUF](https://huggingface.co/kadirify/atlas-strong-GGUF) |
| **Atlas Code** | Qwen2.5-Coder 14B | 9.0 GB | Software work: code, debugging, SQL (including MSSQL) | [`kadirify/atlas-code`](https://ollama.com/kadirify/atlas-code) | [atlas-code-GGUF](https://huggingface.co/kadirify/atlas-code-GGUF) |
| **Atlas Mini** | Qwen 3.5 2B | 2.7 GB | Computers without a graphics card and 8 GB of RAM | uses the base model | — |

## Results

- **Spelling test**: 300 Turkish sentences corrupted with common spelling mistakes; a point is given only for an exact correct sentence. None of the sentences were seen in training.
- **Atlas-TR**: our 92-question Turkish benchmark in 10 categories (spelling, instruction following, chat, formal writing, reasoning, summarisation, long answers, translation, English, code).

| Model | Spelling test: base → Atlas | Atlas-TR: base → Atlas |
| --- | ---: | ---: |
| Atlas Light | 35% → **83%** | 90 → 92 |
| Atlas Medium | 65% → **88%** | 97 → 97 |
| Atlas Strong | 66% → **85%** | 98 → 98 |
| Atlas Code | 32% → **77%** | 92 → 91 (code and SQL: 98 → 98) |

Known weaknesses: Atlas Code's translation score dropped (100 → 83); Atlas Light lost a few points in casual chat and formal writing; the spelling test is rule-generated, so results on real human mistakes may differ.

## Which one for the code area?

In the code area the model reads and edits files, runs tests and queries databases. We measure this with a separate test suite ([eval/ajan](../../eval/ajan/README.md)): 54 small tasks (find and fix a bug, rename across files, refuse a delete, read a trigger and explain it...). Latest full run (15 November 2026, RTX 5070, each task three times):

| Model | Passed | Code | Reading | Safety | Commands | SQL | Time per task |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Atlas Strong** | 141/162 (87%) | 47/57 | 15/18 | 30/33 | 17/18 | 32/36 | 10 s |

Where Atlas Strong stumbles: counting something in a very long file (it only looks at the beginning), removing an existing setting while adding one to a file such as `package.json`, and some changes that span several files. Every attempt is listed in [RESULTS.md](../../eval/ajan/RESULTS.md) (in Turkish).

Atlas Code has not been run through the 54-task suite from start to finish yet. In the earlier 28-task, single-attempt run (13 November) Atlas Strong passed 26/28 and Atlas Code 18/28; time per task was 6 s for Atlas Strong and 38 s for Atlas Code.

That is why the code area opens with **Atlas Strong** when it is installed (otherwise Atlas Code, then Atlas Medium); you can change it from the chat's model picker. Atlas Code is good at writing code and SQL in chat (Atlas-TR code score 98), but it often stumbles when using tools and is slow because it does not fully fit a 12 GB graphics card. The next training round targets this.

## Use them anywhere

```bash
ollama run kadirify/atlas-strong
```

The GGUF files on Hugging Face also work with llama.cpp, LM Studio and similar tools.

## Licenses

All base models (Qwen 3.5, Gemma 4, Qwen2.5-Coder) are Apache 2.0; the Atlas models are released under the same license.
