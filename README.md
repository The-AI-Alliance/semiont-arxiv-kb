# ArXiv Research Papers Knowledge Base

[![Lint](https://github.com/The-AI-Alliance/semiont-arxiv-kb/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/The-AI-Alliance/semiont-arxiv-kb/actions/workflows/lint.yml?query=branch%3Amain)
[![License](https://img.shields.io/github/license/The-AI-Alliance/semiont-arxiv-kb)](https://github.com/The-AI-Alliance/semiont-arxiv-kb/blob/main/LICENSE)

A starting point for collecting and annotating research papers from [arXiv](https://arxiv.org/) — sourced via the arXiv API and formatted for analysis, annotation, and knowledge extraction with [Semiont](https://github.com/The-AI-Alliance/semiont).

## About This Dataset

This repository tracks research papers from arXiv as Semiont resources — with paper metadata, cleanly formatted markdown content, and entity tagging for downstream knowledge work.

The current corpus features:

- **Attention Is All You Need** (Vaswani et al., 2017, [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)) — the foundational paper introducing the Transformer architecture that underpins modern large language models.

Papers are tagged with entity types like `research-paper`, `ai`, `transformers`, `deep-learning` to support downstream search, filtering, and citation graph construction. The configuration in [`config.yaml`](config.yaml) and the per-source handler in [`src/handlers/arxiv.ts`](src/handlers/arxiv.ts) define how papers are fetched and ingested.

This corpus is well-suited for entity recognition across research authors, methods, datasets, and concepts; building paper citation graphs; tracing the evolution of ideas across the literature; and demonstrating how dense scientific text can be annotated with semantic structure.

## Skills

This repo ships four skills that build a paper-graph KB on top of the Semiont SDK. See [AGENTS.md](AGENTS.md) for the full design discussion.

| Skill | What it does |
|---|---|
| [`download-paper`](skills/download-paper/SKILL.md) | Fetch a paper from arXiv and create one resource. |
| [`mark-entities`](skills/mark-entities/SKILL.md) | Auto-detect entity references — Author, CitedPaper, Method, Dataset, Benchmark, Concept, Affiliation. |
| [`resolve-entities`](skills/resolve-entities/SKILL.md) | Link each detected reference to an existing KB resource where a confident match is found. |
| [`paper-graph`](skills/paper-graph/SKILL.md) | Full enrichment pipeline — detect, resolve, then synthesize new resources for unmatched references. |

## Quick Start

Explore this dataset using [Semiont](https://github.com/The-AI-Alliance/semiont), an open-source knowledge base platform for annotation and knowledge extraction.

This repo follows the same layout and startup flow as [`semiont-template-kb`](https://github.com/The-AI-Alliance/semiont-template-kb). See its README for full setup instructions:

- [Quick Start: Local](https://github.com/The-AI-Alliance/semiont-template-kb#quick-start-local) — run the Semiont stack on your machine via `semiont start`
- [Quick Start: Codespaces](https://github.com/The-AI-Alliance/semiont-template-kb#quick-start-codespaces) — launch a preconfigured stack in the cloud
- [Inference Configuration](https://github.com/The-AI-Alliance/semiont-template-kb#inference-configuration) — Ollama (local) vs. Anthropic (cloud) configs

### Open in Codespaces

**Prerequisites:** the [Semiont launcher](https://github.com/The-AI-Alliance/semiont/tree/main/apps/launcher) (`brew install the-ai-alliance/semiont/semiont`) and the [GitHub CLI (`gh`)](https://cli.github.com/), signed in with `gh auth login`.

> **Before creating:** add `ANTHROPIC_API_KEY` as a [user secret](https://github.com/settings/codespaces) with this repo selected. Otherwise the backend comes up but inference is non-functional until you add the secret and rebuild the container.

One command creates the codespace (or resumes the one you already have), waits for the stack to answer, forwards the KB to your machine, and prints the auto-generated admin credentials:

```bash
semiont start --runtime codespace --repo The-AI-Alliance/semiont-arxiv-kb
```

The browser runs **locally** and connects to any number of knowledge bases — cloud or local:

```bash
semiont start --service frontend
```

Open **http://localhost:3000** and add the KB in the **Knowledge Bases** panel, using the port and credentials the launcher printed (`semiont status` re-prints them). `semiont stop --repo The-AI-Alliance/semiont-arxiv-kb` halts billing and keeps your state; add `--delete` to destroy the codespace.

<details>
<summary>Without the launcher: the raw <code>gh</code> recipe</summary>

```bash
gh codespace create --repo The-AI-Alliance/semiont-arxiv-kb --machine premiumLinux
gh codespace ports forward 3000:3000 4000:4000   # leave running
gh codespace ssh -- cat .devcontainer/admin.json # in another terminal
```

This forwards the codespace's own browser as well, so you open **http://localhost:3000** and sign in with those credentials. If `gh` rejects the forward with `must have admin rights to Repository`, grant the scope once: `gh auth refresh -h github.com -s codespace`.

</details>

## License

Apache 2.0 — See [LICENSE](LICENSE) for details.
