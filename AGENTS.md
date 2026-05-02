# AGENTS.md — semiont-arxiv-kb

This is an arXiv-flavored Semiont knowledge base. The corpus is research papers from arXiv, organized for entity-rich annotation and resource synthesis. If you're an AI assistant working in this repo, this file is your orientation.

## What's here

- **`src/arxiv.ts`** — small helper module for fetching paper metadata via the arXiv API (`fetchArxivPaper`) and rendering it as markdown (`formatArxivPaper`). Reusable from any skill.
- **`skills/`** — four ready-to-run skills, increasing in complexity. Each ships a `SKILL.md` (orientation + frontmatter for skill-aware tools like Claude Code) plus a `script.ts` that uses `@semiont/sdk` against the running backend.

| Skill | What it does | New SDK verbs |
|---|---|---|
| [`download-paper`](skills/download-paper/) | Fetch a paper from arXiv and create one resource | `yield.resource` |
| [`mark-entities`](skills/mark-entities/) | + auto-detect entity references for several entity types | `mark.assist` |
| [`resolve-entities`](skills/resolve-entities/) | + link each detected reference to an existing KB resource where possible | `gather.annotation`, `match.search`, `bind.body` |
| [`paper-graph`](skills/paper-graph/) | + generate a new resource for any reference that didn't match — synthesizing a paper-graph around the central paper | `yield.fromAnnotation` |

The four skills are a progression: each layer composes on top of the prior one. `paper-graph` is the full pipeline.

## Entity types used in this KB

For research-paper synthesis, the demo skills target seven entity types:

- `Author` — paper authors (people)
- `CitedPaper` — references in the bibliography
- `Method` — techniques and architectures (e.g., scaled dot-product attention, multi-head attention)
- `Dataset` — datasets used in experiments (e.g., WMT 2014 EN-DE)
- `Benchmark` — benchmarks the paper reports against (e.g., BLEU score on translation)
- `Concept` — underlying concepts the paper builds on (e.g., positional encoding, layer normalization)
- `Affiliation` — institutions/organizations the authors are affiliated with

These map naturally to the structure of an AI/ML research paper: who wrote it, what it builds on, what techniques and data it uses, what it claims to advance, where the authors work, and the underlying ideas it leans on. Override per-skill via the `ENTITY_TYPES` env var.

## Worked example: Attention Is All You Need

`arXiv:1706.03762` (Vaswani et al., 2017) is the canonical demo target — the paper that introduced the Transformer architecture. Run any of the four skills with `1706.03762` as the argument to walk through the pipeline. A full `paper-graph` run will end with one resource for the paper itself, several `Author` resources, several `CitedPaper` resources (some of which may match other papers already in your KB), `Method` resources for "scaled dot-product attention" and "multi-head attention," and so on.

## Working in containers — do not install npm packages on the host

This template assumes a containerized workflow. The backend stack runs in containers (`.semiont/scripts/start.sh` brings it up); the skills run in containers too. There is **no need** to install Node, the SDK, or any other tooling on the host machine.

Each skill's `SKILL.md` shows a `docker run` invocation that:

1. Mounts the repo as `/work` inside a throwaway `node:24-alpine` container
2. Installs `@semiont/sdk` and `tsx` *inside* the container
3. Runs the skill's `script.ts` against the env-configured backend

Apple Container, Docker, and Podman all accept the same `run --rm -v ... -w ... <image> <cmd>` form. The skills show `docker run`; substitute `container run` or `podman run` as your runtime requires. (Auto-detection à la the start.sh `for rt in container docker podman` loop is left to a wrapper if you want one.)

## Backend setup

Before running any skill, the Semiont backend stack (PostgreSQL, Neo4j, Qdrant, Ollama, the API server, the worker pool, the smelter — and optionally Jaeger for traces) must be up. There are two paths.

### Local: `start.sh`

Recommended runtime: [Apple Container](https://github.com/apple/container). Docker and Podman work too — `start.sh` auto-detects.

```bash
.semiont/scripts/start.sh --email admin@example.com --password password --observe
```

Flags:
- `--email` / `--password` — admin user to seed (creates if absent, idempotent on re-run)
- `--observe` — also start a Jaeger sidecar so you can watch OTel traces at http://localhost:16686 while skills run
- `--config anthropic` — switch to cloud inference if you've exported `ANTHROPIC_API_KEY`; default is fully-local Ollama with Gemma models (~24 GB of model pulls on first run)
- `--force-kill-ports` — if a previous run leaked something, kill whatever's holding the ports
- `--no-cache` — force a fresh image build (use after pulling a new `@semiont/*` package release)

`--help` lists everything. Bring the stack down with Ctrl-C in the same terminal, or `<runtime> stop semiont-backend semiont-worker semiont-smelter ...` from another shell.

Once the script reports `Backend healthy` (and Worker/Smelter), the API is at `http://localhost:4000` and the four KB skills below can hit it.

### Codespaces

Open the repo in a Codespace — `post-create.sh` builds the stack, `post-start.sh` brings it up, and admin credentials are auto-generated into `.devcontainer/admin.json`. Print them any time:

```bash
cat .devcontainer/admin.json
```

To reach the backend from your local Semiont browser (or from another container), forward the port:

```bash
gh codespace ports forward 4000:4000
```

(If `gh` rejects this with `must have admin rights to Repository`, run `gh auth refresh -h github.com -s codespace` once.)

### Skill env vars

The skills read three env vars on every invocation:

| Var | Purpose |
|---|---|
| `SEMIONT_API_URL` | Base URL of the backend (default `http://localhost:4000`) |
| `SEMIONT_USER_EMAIL` | Email of the authenticating user |
| `SEMIONT_USER_PASSWORD` | Password for that user |

For local with `start.sh`, that's the email/password you passed to `--email` / `--password`. For Codespaces, those are in `.devcontainer/admin.json`.

## Background reading

| Where | What |
|---|---|
| [`@semiont/sdk` README](https://github.com/The-AI-Alliance/semiont/tree/main/packages/sdk) | The TypeScript surface — eight verbs (frame, yield, mark, match, bind, gather, browse, beckon) plus admin/auth/job. |
| [SDK Usage docs](https://github.com/The-AI-Alliance/semiont/tree/main/packages/sdk/docs) | Cache semantics, reactive model, state units, error handling. |
| [Semiont protocol docs](https://github.com/The-AI-Alliance/semiont/tree/main/docs/protocol) | The eight-flow framing — what each verb does and why. |
| [Semiont protocol skills](https://github.com/The-AI-Alliance/semiont/tree/main/docs/protocol/skills) | Reference skill packs (`semiont-wiki`, `semiont-comment`, `semiont-highlight`, `semiont-session`, `semiont-worker`, etc.). The skills in this repo borrow their format and patterns. |
