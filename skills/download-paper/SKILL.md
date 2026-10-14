---
name: download-paper
description: Fetch a research paper from arXiv and ingest it as a resource in the knowledge base — one paper, one resource, no annotations.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Write
---

You are helping a user ingest an arXiv paper into a Semiont knowledge base.

Given an arXiv ID (e.g. `1706.03762`), this skill:

1. Fetches the paper's metadata from the arXiv API using `fetchArxivPaper` from [`src/arxiv.ts`](../../src/arxiv.ts).
2. Formats it as a markdown document with title, authors, abstract, and links.
3. Uploads it to the gateway via `yield.resource(...)` from `@semiont/sdk`.

The result is one new resource in the KB, tagged with the entity type `research-paper`. **No annotations are created** — for that, run [`mark-entities`](../mark-entities/) after this.

## SDK verbs

- `frame.addEntityTypes` — declares this KB's entity-type vocabulary on every run (idempotent). The constant `KB_ENTITY_TYPES` at the top of `script.ts` is the published vocabulary.
- `yield.resource` — create the new resource

## Code

The full script lives at [`script.ts`](script.ts) in this directory. Heart of it:

```typescript
import { SemiontSession, InMemorySessionStorage, httpKb } from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';

const paper = await fetchArxivPaper(process.argv[2]);
const markdown = formatArxivPaper(paper);

const gateway = new URL(process.env.SEMIONT_API_URL ?? 'http://localhost:4000');
const session = await SemiontSession.signInDevice({
  kb: httpKb({
    id: 'arxiv-download-paper',
    label: 'arxiv download-paper',
    host: gateway.hostname,
    port: Number(gateway.port) || 4000,
    protocol: gateway.protocol === 'https:' ? 'https' : 'http',
  }),
  storage: new InMemorySessionStorage(),
  onCode: ({ verificationUri, verificationUriComplete, userCode }) => {
    console.error(`Approve this script at ${verificationUriComplete ?? verificationUri}`);
    if (!verificationUriComplete) console.error(`Code: ${userCode}`);
  },
});
const semiont = session.client;

const { resourceId } = await semiont.yield.resource({
  name: paper.title,
  file: Buffer.from(markdown, 'utf-8'),
  format: 'text/markdown',
  entityTypes: ['research-paper'],
  storageUri: `file://papers/arxiv-${paper.id}.md`,
});

semiont.dispose();
```

## Run it

**Prerequisite: the Semiont stack is running** — see [AGENTS.md › Stack setup](../../AGENTS.md#stack-setup) for the full instructions. Typically `semiont start` then `semiont useradd --email admin@example.com --admin` from the repo root.

From the repo root, with the stack up:

```bash
# Discover the host's bridge-gateway IP — same probe `semiont start` uses.
# `localhost` from inside a freshly-spawned container is its own loopback,
# not the host's; the stack lives at the bridge gateway.
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  node:24-alpine \
  sh -c 'npm ci --no-audit --no-fund && npx tsx skills/download-paper/script.ts 1706.03762'
```

The script prints an address: open it in a browser and approve the sign-in. [Signing in](https://github.com/The-AI-Alliance/semiont/blob/main/docs/builder/SIGN-IN.md) has the other ways a script can sign in.

The npm install happens *inside* the throwaway container — nothing lands on your host. Substitute `docker run` or `podman run` for `container run` if those are your runtimes; the `HOST_ADDR` discovery uses the same shape against any of them.

If you're already on the host shell (not in a container) and the gateway is reachable directly — e.g., a codespace port forwarded to your host with `gh codespace ports forward 4000:4000` — you can skip the discovery and run a Node directly *inside* a single container against `http://localhost:4000` by adding `--network host` (Linux Docker) or by setting `SEMIONT_API_URL=http://host.docker.internal:4000` (Docker Desktop / Podman macOS).

## Output

The script prints the new resource's identifier. Note it down (or query `semiont.browse.resources({ search: '<paper title>' })` later) — the next skills (`mark-entities`, `resolve-entities`, `paper-graph`) take that ID as their argument.

## Guidance for the AI assistant

- **Validate the arXiv ID** before fetching. `1706.03762` is the modern format; `arXiv:1706.03762` and `arXiv:1706.03762v5` are also accepted (the script strips the prefix and version suffix is currently passed through to the API).
- **The paper resource is light.** It contains metadata (title, authors, abstract, dates, categories) and links to the canonical arXiv URLs. The full PDF content is *not* ingested by this skill. If you need the full body, fetch the PDF separately and create an additional resource pointing at it.
- **Re-running with the same arXiv ID** will create a duplicate resource. The script does not deduplicate. Use `semiont.browse.resources({ search: '<title>' })` first if you want to check.
