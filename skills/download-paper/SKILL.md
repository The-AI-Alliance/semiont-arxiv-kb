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
3. Uploads it to the backend via `yield.resource(...)` from `@semiont/sdk`.

The result is one new resource in the KB, tagged with the entity type `research-paper`. **No annotations are created** — for that, run [`mark-entities`](../mark-entities/) after this.

## SDK verbs

- `yield.resource` — create the new resource

## Code

The full script lives at [`script.ts`](script.ts) in this directory. Heart of it:

```typescript
import { SemiontClient } from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';

const paper = await fetchArxivPaper(process.argv[2]);
const markdown = formatArxivPaper(paper);

const semiont = await SemiontClient.signInHttp({
  baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
  email: process.env.SEMIONT_USER_EMAIL!,
  password: process.env.SEMIONT_USER_PASSWORD!,
});

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

**Prerequisite: the Semiont backend is running** — see [AGENTS.md › Backend setup](../../AGENTS.md#backend-setup) for the full instructions. Typically `.semiont/scripts/start.sh --email admin@example.com --password password --observe` from the repo root.

From the repo root, with the backend up:

```bash
# Discover the host's bridge-gateway IP — same probe `start.sh` uses.
# `localhost` from inside a freshly-spawned container is its own loopback,
# not the host's; the backend lives at the bridge gateway.
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/download-paper/script.ts 1706.03762'
```

The npm install happens *inside* the throwaway container — nothing lands on your host. Substitute `docker run` or `podman run` for `container run` if those are your runtimes; the `HOST_ADDR` discovery uses the same shape against any of them.

If you're already on the host shell (not in a container) and the backend is reachable directly — e.g., a codespace port forwarded to your host with `gh codespace ports forward 4000:4000` — you can skip the discovery and run a Node directly *inside* a single container against `http://localhost:4000` by adding `--network host` (Linux Docker) or by setting `SEMIONT_API_URL=http://host.docker.internal:4000` (Docker Desktop / Podman macOS).

## Output

The script prints the new resource's identifier. Note it down (or query `semiont.browse.resources({ search: '<paper title>' })` later) — the next skills (`mark-entities`, `resolve-entities`, `paper-graph`) take that ID as their argument.

## Guidance for the AI assistant

- **Validate the arXiv ID** before fetching. `1706.03762` is the modern format; `arXiv:1706.03762` and `arXiv:1706.03762v5` are also accepted (the script strips the prefix and version suffix is currently passed through to the API).
- **The paper resource is light.** It contains metadata (title, authors, abstract, dates, categories) and links to the canonical arXiv URLs. The full PDF content is *not* ingested by this skill. If you need the full body, fetch the PDF separately and create an additional resource pointing at it.
- **Re-running with the same arXiv ID** will create a duplicate resource. The script does not deduplicate. Use `semiont.browse.resources({ search: '<title>' })` first if you want to check.
