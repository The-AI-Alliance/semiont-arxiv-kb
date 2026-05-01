# ArXiv Research Papers Knowledge Base

A starting point for collecting and annotating research papers from [arXiv](https://arxiv.org/) — sourced via the arXiv API and formatted for analysis, annotation, and knowledge extraction with [Semiont](https://github.com/The-AI-Alliance/semiont).

## About This Dataset

This repository tracks research papers from arXiv as Semiont resources — with paper metadata, cleanly formatted markdown content, and entity tagging for downstream knowledge work.

The current corpus features:

- **Attention Is All You Need** (Vaswani et al., 2017, [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)) — the foundational paper introducing the Transformer architecture that underpins modern large language models.

Papers are tagged with entity types like `research-paper`, `ai`, `transformers`, `deep-learning` to support downstream search, filtering, and citation graph construction. The configuration in [`config.yaml`](config.yaml) and the per-source handler in [`src/handlers/arxiv.ts`](src/handlers/arxiv.ts) define how papers are fetched and ingested.

This corpus is well-suited for entity recognition across research authors, methods, datasets, and concepts; building paper citation graphs; tracing the evolution of ideas across the literature; and demonstrating how dense scientific text can be annotated with semantic structure.

## Quick Start

Explore this dataset using [Semiont](https://github.com/The-AI-Alliance/semiont), an open-source knowledge base platform for annotation and knowledge extraction.

This repo follows the same layout and startup flow as [`semiont-template-kb`](https://github.com/The-AI-Alliance/semiont-template-kb). See its README for full setup instructions:

- [Quick Start: Local](https://github.com/The-AI-Alliance/semiont-template-kb#quick-start-local) — run the backend stack on your machine via `.semiont/scripts/start.sh`
- [Quick Start: Codespaces](https://github.com/The-AI-Alliance/semiont-template-kb#quick-start-codespaces) — launch a preconfigured backend in the cloud
- [Inference Configuration](https://github.com/The-AI-Alliance/semiont-template-kb#inference-configuration) — Ollama (local) vs. Anthropic (cloud) configs

### Open in Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new/The-AI-Alliance/semiont-arxiv-kb)

> **Before launching:** add `ANTHROPIC_API_KEY` as a [user secret](https://github.com/settings/codespaces) with this repo selected. Otherwise the backend comes up but inference is non-functional until you add the secret and rebuild the container.

## License

Apache 2.0 — See [LICENSE](LICENSE) for details.
