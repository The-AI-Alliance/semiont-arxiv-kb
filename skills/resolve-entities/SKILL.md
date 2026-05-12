---
name: resolve-entities
description: Download an arXiv paper, detect entity references, and link each one to an existing KB resource where a confident match is found. References that don't match anything stay unresolved (use paper-graph to synthesize resources for those).
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Write
---

You are helping a user ingest an arXiv paper, mark entity references in it, and *resolve* those references — linking them to existing resources in the knowledge base where a confident match exists.

This skill is the middle of the four arXiv skills. It builds on [`mark-entities`](../mark-entities/) by adding the `gather → match → bind` loop. After this runs, every linking annotation either:

- **is bound to an existing KB resource** (because a candidate scored above the match threshold), or
- **remains unresolved** (no confident match) — these are the references that [`paper-graph`](../paper-graph/) would synthesize new resources for.

## SDK verbs

- `yield.resource` — create the paper resource
- `mark.assist` — detect entity references
- `gather.annotation` — fetch LLM context for each unresolved reference
- `match.search` — search the KB for candidate matches
- `bind.body` — link the annotation to the best match

## The match threshold

`match.search` returns candidates with composite scores (name match alone can be 25 pts, entity-type overlap up to ~35 pts, semantic similarity up to ~25 pts when `useSemanticScoring: true`, etc.). Default threshold is **30** (selective). Set `MATCH_THRESHOLD=15` to be more permissive, `MATCH_THRESHOLD=0` to always bind to the top result if any candidates exist.

## Code

The full script lives at [`script.ts`](script.ts). Per-annotation loop body:

```typescript
const gather = await semiont.gather.annotation(rId, ann.id, { contextWindow: 2000 });
const context = gather.response as GatheredContext;

const matchResult = await semiont.match.search(rId, ann.id, context, {
  limit: 10,
  useSemanticScoring: true,
});
const top = matchResult.response[0];

if (top && (top.score ?? 0) >= MATCH_THRESHOLD) {
  await semiont.bind.body(rId, ann.id, [{
    op: 'add',
    item: { type: 'SpecificResource', source: top['@id'], purpose: 'linking' },
  }]);
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
  sh -c 'npm install --silent --no-fund @semiont/sdk tsx && npx tsx skills/resolve-entities/script.ts 1706.03762'
```

(See [`download-paper`'s "Run it"](../download-paper/SKILL.md#run-it) for the why behind the `HOST_ADDR` probe.)

## When to use this vs. `paper-graph`

- **Use `resolve-entities`** when you want to bring in a paper *without* generating a wave of stub resources for everything mentioned. Good for adding to a mature KB where most named entities (popular methods, common datasets, well-known authors) likely already exist.
- **Use `paper-graph`** when you want to bootstrap a KB from a single paper — generating new resources for every unresolved entity, building out the surrounding network on first ingest.

## Output

The script prints a per-annotation report:

```
bound  "Vaswani"         -> Ashish Vaswani (score 47)
bound  "attention"       -> Attention mechanism (score 38)
unresolved  "WMT 2014 EN-DE"
```

Plus a summary count: `Done. Bound 8, still unresolved 12.`

To inspect more deeply afterward:

```typescript
const annotations = await semiont.browse.annotations(rId);
const stillUnresolved = annotations.filter(
  (a) => a.motivation === 'linking' &&
         !a.body?.some((b) => b.type === 'SpecificResource'),
);
```

## Guidance for the AI assistant

- **Threshold tuning matters.** A threshold of 30 is selective: most arXiv references probably won't cross it on a brand-new KB (no candidates exist yet). If you're getting too few binds, drop to 20 or 15. If you're getting false binds (e.g., a method name binding to an unrelated resource that happens to share a word), raise to 40+.
- **Semantic scoring costs inference.** `useSemanticScoring: true` adds an LLM batch-scoring pass over the top 20 candidates. Worth it for precision. Set to `false` if your inference budget is tight.
- **The threshold is in Matcher score units, not 0-1.** It's a composite of name overlap, entity-type alignment, and (with `useSemanticScoring`) semantic similarity.
- **Run order.** This skill runs the whole pipeline (download + mark + resolve) in one script. If you've already ingested the paper via an earlier skill, adapt the script to skip the upload step and start from `browse.annotations(rId)`.
- **Errors should narrow.** Catch `SemiontError` broadly, or `APIError` (HTTP, with `status`) and `BusRequestError` (bus-mediated) for finer handling. See [SDK error handling](https://github.com/The-AI-Alliance/semiont/tree/main/packages/sdk/docs).
