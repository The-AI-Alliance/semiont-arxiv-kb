---
name: mark-entities
description: Download an arXiv paper and auto-detect entity references — produces unresolved-reference annotations for several entity types (Author, CitedPaper, Method, Dataset, Benchmark, Concept, Affiliation) without resolving them.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Write
---

You are helping a user ingest an arXiv paper *and* mark entity mentions in it.

This skill builds on [`download-paper`](../download-paper/) by adding a `mark.assist` call that detects entity-typed references in the paper text. The result: one resource for the paper, plus a set of `linking`-motivation annotations on text spans that mention authors, cited papers, methods, datasets, benchmarks, concepts, or affiliations.

The annotations are **unresolved** — each one carries an entity type but is not yet bound to a specific KB resource. `resolve-entities` and `paper-graph` handle that next step.

## SDK verbs

- `yield.resource` — create the paper resource (same as `download-paper`)
- `mark.assist` — detect entity references via the backend's AI-assist pipeline

## Code

The full script lives at [`script.ts`](script.ts). The new piece on top of `download-paper`:

```typescript
import { SemiontClient, entityType } from '@semiont/sdk';

const ENTITY_TYPES = (
  process.env.ENTITY_TYPES ??
  'Author,CitedPaper,Method,Dataset,Benchmark,Concept,Affiliation'
)
  .split(',')
  .map((t) => entityType(t.trim()));

// ... after creating the paper resource (rId):
const progress = await semiont.mark.assist(rId, 'linking', {
  entityTypes: ENTITY_TYPES,
});
console.log(`Created ${progress.progress?.createdCount ?? 0} unresolved references`);
```

## Run it

**Prerequisite: the Semiont backend is running** — see [AGENTS.md › Backend setup](../../AGENTS.md#backend-setup).

```bash
# Discover the host's bridge-gateway IP (see download-paper for the why).
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/mark-entities/script.ts 1706.03762'
```

Override the entity types per run with `-e ENTITY_TYPES='Author,CitedPaper'` for a faster pass focused on bibliographic structure.

(See [`download-paper`'s "Run it" section](../download-paper/SKILL.md#run-it) for the host-gateway/networking discussion — same patterns apply.)

## Output

After running, query the backend to see what was detected:

```typescript
const annotations = await semiont.browse.annotations(rId);
const linking = annotations.filter((a) => a.motivation === 'linking');
console.log(`${linking.length} linking annotations created`);
```

For *Attention Is All You Need* with all seven entity types enabled, expect on the order of dozens of annotations — most authors named in the by-line, several method/concept mentions in the abstract (attention, transformer, encoder-decoder), a few dataset/benchmark mentions if the abstract discusses results.

## Guidance for the AI assistant

- **Entity types are the key parameter.** The default seven cover most arXiv research-paper structure; pare down with `ENTITY_TYPES=...` if a particular pass should be narrower (e.g., authors-only pre-resolution).
- **The format matters.** `mark.assist` works on `text/plain` and `text/markdown`. The paper resource we create is markdown — ✓.
- **The abstract is short.** Detection runs on the resource's content, which (for a vanilla `download-paper` resource) is just the title + authors + abstract. To detect entities throughout the *full* paper body, you'd need a richer ingest path — e.g., fetch the PDF, convert to markdown, upload the body as the resource. That's out of scope for this skill, which focuses on the metadata.
- **Detection is non-deterministic.** Re-running on the same resource will produce a similar but not identical set of annotations. Currently no deduplication is performed.
- **Timeout handling is built in.** `mark.assist` times out after 180s without progress; subscribe to the returned StreamObservable for a progress bar.
