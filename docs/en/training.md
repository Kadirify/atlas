# How the Atlas models were trained

This page describes how the Atlas models were made: data, method, hardware, results and the experiments that failed. All scripts are in [`training/`](../../training) so anyone can reproduce the results.

## Fine-tuning, not training from scratch

Training a language model from scratch takes thousands of GPUs and months. The Atlas models were made with **fine-tuning** instead: extra training for Turkish on top of strong, openly licensed base models.

To pick the bases we first compared ten open models on our own benchmark, [Atlas-TR](../olcum.md), including open models trained specifically for Turkish. Google's Gemma 4 family scored best (97); among small models Qwen 3.5 stood out.

| Atlas model | Base | License |
| --- | --- | --- |
| Light | `Qwen/Qwen3.5-4B` | Apache 2.0 |
| Medium | `google/gemma-4-E4B-it` | Apache 2.0 |
| Strong | `google/gemma-4-12b-it` | Apache 2.0 |
| Code | `Qwen/Qwen2.5-Coder-14B-Instruct` | Apache 2.0 |

## What we taught

The weakest area in our benchmark was **Turkish spelling correction**: base models often half-fix a sentence and confuse the conjunction "de/da" with the suffix, the "ki" rules, apostrophes in proper names and the question particle.

The goal had two parts: make spelling correction clearly better, and **not break** anything else. The second part matters as much as the first, because our first experiment did exactly that (see below).

## Data

**Spelling examples (about 3,900).** Sentences from Turkish Wikipedia (CC BY-SA) and hand-written everyday phrases were corrupted with common Turkish spelling mistakes by rules: joined/split "de/da" and "ki", the question particle, missing apostrophes, frequently confused words, English letters instead of Turkish ones, capitalisation and punctuation. One to four mistakes per sentence, short two-to-three-sentence texts, fifteen different request phrasings, and some already-correct examples so the model learns to leave correct text alone.

**General examples (about 5,000).** Summaries, translation, reasoning, knowledge, chat, formal writing, instruction following, code and English. The answers were written by a "teacher" model (Gemma 4 E4B); truncated answers and answers with wrong numeric results were dropped. The aim was not to teach new knowledge but to preserve existing behaviour.

**8,955 examples in total.** No benchmark question or test sentence appears in the training data.

## Method and hardware

- **LoRA / QLoRA**: small adapter layers are trained instead of all weights (r=16, alpha=32, learning rate 1e-4); large models are loaded in 4-bit.
- The loss is computed on the answer only.
- **Hardware**: one home PC with an NVIDIA RTX 5070 (12 GB) and 32 GB of RAM.
- **Time**: Atlas Medium 57 minutes, Atlas Code about 1 hour 45 minutes, Atlas Strong about 10 hours.

After training: merge the LoRA weights into the base model (directly in the weight file, without loading the model into memory), convert to GGUF with llama.cpp, quantise (Q4_K_M, Q5_K_M or Q6_K), create the Ollama model, and run the spelling tests and Atlas-TR. The whole chain is one script: [`training/zincir.sh`](../../training/zincir.sh).

## Results

| Model | Spelling test (300) | Hard spelling test (187) | Atlas-TR |
| --- | ---: | ---: | ---: |
| Qwen 3.5 4B (base) | 35.3% | 25.1% | 90 |
| **Atlas Light** | **82.7%** | **80.7%** | 92 |
| Gemma 4 E4B (base) | 64.7% | 51.3% | 97 |
| **Atlas Medium** | **88.0%** | **83.4%** | 97 |
| Gemma 4 12B (base) | 65.7% | 64.2% | 98 |
| **Atlas Strong** | **85.0%** | **86.6%** | 98 |
| Qwen2.5-Coder 14B (base) | 31.7% | 26.7% | 92 |
| **Atlas Code** | **77.0%** | **62.6%** | 91 |

## What did not work

**Single-topic data broke the first model.** We gave Qwen 3.5 2B only spelling examples. Its spelling score went from 14% to 90%, but its general score fell from 87 to 70: it started treating every request as "fix this sentence". Asked to introduce itself, it proofread the question. That is why general examples were added.

**Atlas Mini stays un-tuned.** In three attempts (less spelling data, a lower learning rate) the 2B model lost 3 to 7 points of general ability while learning to spell. Our rule is simple: a model that is worse than its base is not released.

**Atlas Strong's first training came out broken.** Gemma 4 12B's chat template puts an empty "thinking" block at the start of the answer when thinking is off. We left that block on the wrong side during training; the model learned to open it and never close it, so Ollama hid the whole answer as "thinking" and the general score fell to 38. Fixing the template and running a short 30-step follow-up training solved it.

**Quantisation costs points.** Our conversion chain lost about 2 points compared with Ollama's own files; quantising less (Q5/Q6 instead of Q4) closed the gap, which is why Medium and Strong ship as slightly larger files.

**A 22 GB file would not open on Windows.** Gemma 4 12B's single-file weights hit Windows' virtual memory limit, so we wrote a small tool that splits the file without loading it into memory ([`training/parcala.py`](../../training/parcala.py)).

## Limitations

- The spelling tests are rule-generated; results on real human mistakes may differ. A hand-checked test of real texts is in progress.
- Atlas-TR has 92 questions and cannot reliably separate 1-2 point differences; growing it is on the roadmap.
- No new knowledge was taught; the models know what their base models know.
