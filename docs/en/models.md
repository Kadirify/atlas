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

## Use them anywhere

```bash
ollama run kadirify/atlas-strong
```

The GGUF files on Hugging Face also work with llama.cpp, LM Studio and similar tools.

## Licenses

All base models (Qwen 3.5, Gemma 4, Qwen2.5-Coder) are Apache 2.0; the Atlas models are released under the same license.
