---
name: paper-graph
description: Full enrichment pipeline for an arXiv paper — download it, detect entity references, resolve where possible against the KB, and synthesize new resources for everything that didn't match. The end state is a network of cross-linked resources rooted at the central paper.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Write
---

You are helping a user transform a single arXiv paper into a connected paper-graph: the paper itself, plus a constellation of resources representing its authors, cited papers, methods, datasets, benchmarks, concepts, and affiliations.

This is the most elaborate of the four arXiv skills — the full five-verb pipeline. It builds on [`resolve-entities`](../resolve-entities/) by adding a `yield.fromAnnotation` step for every reference that didn't match a confident KB candidate.

The pattern mirrors the upstream [`semiont-wiki` skill](https://github.com/The-AI-Alliance/semiont/tree/main/docs/protocol/skills/semiont-wiki), adapted for research-paper structure.

## Pipeline

| # | Verb | Purpose |
|---|---|---|
| 1 | `yield.resource` | Create the central paper resource |
| 2 | `mark.assist` | Detect entity references across all configured entity types |
| 3 | `gather.annotation` (per annotation) | Fetch LLM context for a reference |
| 4 | `match.search` (per annotation) | Search the KB for candidate matches |
| 5a | `bind.body` (per annotation) | If a candidate scores ≥ threshold, link to it |
| 5b | `yield.fromAnnotation` + `bind.body` (per annotation) | Otherwise, generate a new resource and link to that |

Steps 3-5 run in a per-annotation loop. The threshold between "bind to existing" and "generate new" is configurable via `MATCH_THRESHOLD`.

## SDK verbs

- `yield.resource`, `yield.fromAnnotation`, `mark.assist`, `gather.annotation`, `match.search`, `bind.body`

## Code

The full script lives at [`script.ts`](script.ts). The synthesis step (the bit that distinguishes this skill from `resolve-entities`):

```typescript
if (top && (top.score ?? 0) >= MATCH_THRESHOLD) {
  // Bind to existing
  await semiont.bind.body(rId, annId, [{
    op: 'add',
    item: { type: 'SpecificResource', source: top['@id'], purpose: 'linking' },
  }]);
} else {
  // Synthesize a new resource and bind to it.
  // The final emission of yield.fromAnnotation is { kind: 'complete', data: JobCompleteCommand };
  // the new resource id is at data.result.resourceId (when result is a JobGenerationResult).
  const yieldEvent = await semiont.yield.fromAnnotation(rId, annId, {
    title: text,
    storageUri: `file://generated/${slugify(text)}.md`,
    context,
  });
  const newResourceId = yieldEvent.kind === 'complete'
    ? (yieldEvent.data.result as { resourceId?: string } | undefined)?.resourceId
    : undefined;

  if (newResourceId) {
    await semiont.bind.body(rId, annId, [{
      op: 'add',
      item: { type: 'SpecificResource', source: newResourceId, purpose: 'linking' },
    }]);
  }
}
```

## Run it

**Prerequisite: the Semiont backend is running** — see [AGENTS.md › Backend setup](../../AGENTS.md#backend-setup).

```bash
HOST_ADDR=$(container run --rm node:24-alpine sh -c "ip route | awk '/default/{print \$3}'" 2>/dev/null | tr -d '[:space:]')

container run --rm -v "$(pwd):/work" -w /work \
  -e SEMIONT_API_URL=http://${HOST_ADDR}:4000 \
  -e SEMIONT_USER_EMAIL=admin@example.com \
  -e SEMIONT_USER_PASSWORD=<your-password> \
  -e MATCH_THRESHOLD=30 \
  node:24-alpine \
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/paper-graph/script.ts 1706.03762'
```

(See [`download-paper`'s "Run it"](../download-paper/SKILL.md#run-it) for the why behind the `HOST_ADDR` probe.)

## What you get

For *Attention Is All You Need* (1706.03762) on a fresh KB with all seven entity types and the default threshold:

- **1 central paper resource** ("Attention Is All You Need")
- **~8 Author resources** (Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin)
- **~12 CitedPaper resources** (sequence-to-sequence learning, neural machine translation, RNN encoder-decoder, etc. — the bibliography of the paper)
- **~5 Method resources** (Transformer, multi-head attention, scaled dot-product attention, positional encoding, layer normalization)
- **~2 Dataset resources** (WMT 2014 EN-DE, WMT 2014 EN-FR)
- **~2 Benchmark resources** (BLEU)
- **~3 Concept resources** (recurrence, convolution, self-attention)
- **~1 Affiliation resource** (Google Brain / Google Research)

…all bound to the central paper via `linking` annotations. Numbers vary by abstract content and detection non-determinism.

## When to use this vs. `resolve-entities`

- **Use `paper-graph`** when bootstrapping a new KB or seeding it with a foundational paper. You want the surrounding network to be created.
- **Use `resolve-entities`** when adding to a mature KB and you'd rather avoid generating stub resources for things that aren't yet first-class.

## Long-running script considerations

For papers with many references (or batch ingestion of multiple papers), the loop can run long enough to cross access-token expiry. The example uses `SemiontClient.signInHttp(...)` for simplicity — for genuinely long-running scripts, swap to `SemiontSession.signInHttp(...)`, which owns refresh, validation, and storage.

## Guidance for the AI assistant

- **Generated resources are stubs.** They have a title and a storageUri but minimal body content — the backend's generation step fills in what `gather.annotation` produced. They are AI-generated approximations, not finished articles. Surface this to users.
- **Inspect the result.** After running, `semiont.browse.annotations(rId)` shows every annotation; filter for `SpecificResource` body items to see which got bound. `semiont.browse.resources({ entityType: 'CitedPaper' })` shows the synthesized cited-paper resources.
- **Threshold sets the bind/synthesize ratio.** Higher threshold → more synthesis, fewer binds. Tune to what your KB needs.
- **Re-running on the same paper** will create duplicate resources unless you check first. To re-run safely, delete the previous central resource (and its descendants), or use `semiont.browse.resources({ search: '<title>' })` to detect and skip.
- **Errors should narrow.** Catch `SemiontError`, narrow to `APIError` for HTTP issues or `BusRequestError` for bus-level timeouts/rejections. See [SDK error handling](https://github.com/The-AI-Alliance/semiont/tree/main/packages/sdk/docs).
- **For deeper background**, see the [`semiont-wiki` skill](https://github.com/The-AI-Alliance/semiont/tree/main/docs/protocol/skills/semiont-wiki) — same pattern, less arXiv-specific.
