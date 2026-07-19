# AGENTS.md — semiont-arxiv-kb

This is an arXiv-flavored Semiont knowledge base. The corpus is research papers from arXiv, organized for entity-rich annotation and resource synthesis. If you're an AI assistant working in this repo, this file is your orientation.

## What's here

- **`src/arxiv.ts`** — small helper module for fetching paper metadata via the arXiv API (`fetchArxivPaper`) and rendering it as markdown (`formatArxivPaper`). Reusable from any skill.
- **`skills/`** — four ready-to-run skills, increasing in complexity. Each ships a `SKILL.md` (orientation + frontmatter for skill-aware tools like Claude Code) plus a `script.ts` that uses `@semiont/sdk` against the running backend.

| Skill | What it does | New SDK verbs |
|---|---|---|
| [`download-paper`](skills/download-paper/) | Fetch a paper from arXiv, declare the KB's entity-type vocabulary, and create one resource | `frame.addEntityTypes`, `yield.resource` |
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

This template assumes a containerized workflow. The backend stack runs in containers (`semiont start` brings it up); the skills run in containers too. There is **no need** to install Node, the SDK, or any other tooling on the host machine.

Each skill's `SKILL.md` shows a `docker run` invocation that:

1. Mounts the repo as `/work` inside a throwaway `node:24-alpine` container
2. Installs `@semiont/sdk` and `tsx` *inside* the container
3. Runs the skill's `script.ts` against the env-configured backend

Apple Container, Docker, and Podman all accept the same `run --rm -v ... -w ... <image> <cmd>` form. The skills show `docker run`; substitute `container run` or `podman run` as your runtime requires. (Auto-detection à la the launcher's container → docker → podman order is left to a wrapper if you want one.)

## Backend setup

Before running any skill, the Semiont backend stack (PostgreSQL, Neo4j, Qdrant, Ollama, the API server, the worker pool, the smelter — and optionally Jaeger for traces) must be up. There are two paths.

### Local: `semiont start`

Recommended runtime: [Apple Container](https://github.com/apple/container). Docker and Podman work too — `semiont start` auto-detects.

```bash
brew install the-ai-alliance/semiont/semiont   # once
semiont start
semiont useradd --email admin@example.com --password password --admin
```

Flags:
- `--config anthropic` — switch to cloud inference if you've exported `ANTHROPIC_API_KEY`; default is fully-local Ollama with Gemma models (~24 GB of model pulls on first run)
- `--no-observe` — skip the Jaeger sidecar (on by default; OTel traces at http://localhost:16686 while skills run)
- `--runtime <container|docker|podman>` — force a specific runtime instead of auto-detect

`--config`/`--runtime` are sticky — a bare `semiont start` repeats the last explicitly-passed values. `--help` lists everything. Follow logs with `semiont logs`; bring the stack down with `semiont stop`.

Once `semiont start` reports `Backend healthy` (and Worker/Smelter), the API is at `http://localhost:4000` and the four KB skills below can hit it.

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

## Parameterization and interactivity

Skills are parameterized in three tiers.

### Tier 1 — environment configuration

Set once per environment, rarely changes:

| Var | Purpose |
|---|---|
| `SEMIONT_API_URL` | Base URL of the backend (default `http://localhost:4000`) |
| `SEMIONT_USER_EMAIL` | Email of the authenticating user |
| `SEMIONT_USER_PASSWORD` | Password for that user |

For local with `semiont start`, that's the email/password you passed to `semiont useradd`. For Codespaces, those are in `.devcontainer/admin.json`.

### Tier 2 — skill-invocation parameters

Set per skill invocation. Most are env vars; a few are CLI args.

| Skill | Parameter | Default | Purpose |
|---|---|---|---|
| `download-paper` | `<arxivId>` (CLI) | required | The paper to fetch |
| `mark-entities` | `<arxivId>` (CLI) | required | The paper to fetch + mark |
| | `ENTITY_TYPES` (env) | the seven standard arXiv-paper types | Override or pare down (e.g., `ENTITY_TYPES='Author,CitedPaper'` for a faster bibliography-focused pass) |
| `resolve-entities` | (above + `MATCH_THRESHOLD`) | 30 | Tune the bind-vs.-leave-unresolved threshold |
| `paper-graph` | (above + `MATCH_THRESHOLD`) | 30 | Tune the bind-vs.-synthesize threshold |

### Tier 3 — interactive checkpoints

Off by default (batch automation works as before). Enable per-run with `--interactive` (CLI flag) or `SEMIONT_INTERACTIVE=1` (env var). Skills pause at natural decision points and show what they found / what they're about to do, letting the user steer.

The same render-what-found logic runs in non-interactive mode, except the output goes to logs instead of pausing for input — so visibility is preserved without blocking.

| Skill | Checkpoint | What the user sees / chooses |
|---|---|---|
| `download-paper` | Before yield | "About to upload paper '[title]' as a Resource. Proceed?" |
| `mark-entities` | After detection | "X entities across N types. Top by frequency. Proceed / pick types / re-run?" |
| `resolve-entities` | Per borderline match | Top candidates from the KB with scores; "Bind / pick from list / skip?" |
| | After run | "Y bound, Z still unresolved. Show summary?" |
| `paper-graph` | Before bulk yield | "About to synthesize K new resources (M Authors, N CitedPapers, ...). Preview titles / confirm / abort?" |
| | Per unmatched yield (when interactive) | "About to synthesize stub for '[entity]'. Yield / skip / refine context?" |

### Implementation

A small `src/interactive.ts` module exports helpers used by every skill with a checkpoint:

```typescript
export async function confirm(prompt: string, default_?: boolean): Promise<boolean>;
export async function pick<T>(prompt: string, options: T[], render: (t: T) => string): Promise<T | null>;
export async function preview<T>(prompt: string, items: T[], render: (t: T) => string): Promise<'all' | 'none' | T[]>;
```

These read `SEMIONT_INTERACTIVE` once at startup; in non-interactive mode they auto-answer with the default and render the preview to log. Container invocations of interactive skills need `-it` (TTY + STDIN); the `HOST_ADDR` discovery probe doesn't.

Tier-2 env vars can pre-answer tier-3 prompts (e.g., `MATCH_THRESHOLD=30` pre-answers borderline-match disambiguation; `ENTITY_TYPES='Author,CitedPaper'` pre-answers the entity-type filter prompt). The "interactive once, scripted thereafter" workflow falls out naturally: a user runs `paper-graph` interactively to discover the right threshold and entity-type subset for a particular paper, then locks them in via env vars for batch runs over a paper collection.

## Background reading

| Where | What |
|---|---|
| [`@semiont/sdk` README](https://github.com/The-AI-Alliance/semiont/tree/main/packages/sdk) | The TypeScript surface — eight verbs (frame, yield, mark, match, bind, gather, browse, beckon) plus admin/auth/job. |
| [SDK Usage docs](https://github.com/The-AI-Alliance/semiont/tree/main/packages/sdk/docs) | Cache semantics, reactive model, state units, error handling. |
| [Semiont protocol docs](https://github.com/The-AI-Alliance/semiont/tree/main/docs/protocol) | The eight-flow framing — what each verb does and why. |
| [Semiont protocol skills](https://github.com/The-AI-Alliance/semiont/tree/main/docs/protocol/skills) | Reference skill packs (`semiont-wiki`, `semiont-comment`, `semiont-highlight`, `semiont-session`, `semiont-worker`, etc.). The skills in this repo borrow their format and patterns. |
