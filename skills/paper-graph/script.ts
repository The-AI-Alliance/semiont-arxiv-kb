/**
 * paper-graph — full enrichment pipeline for an arXiv paper.
 *
 * Combines all four steps:
 *   1. Download the paper from arXiv and create the central resource (yield.resource)
 *   2. Detect entity references across many entity types (mark.assist)
 *   3. Resolve each reference against the KB (gather.annotation, match.search, bind.body)
 *   4. Synthesize a new resource for any reference that didn't match (yield.fromAnnotation, then bind.body)
 *
 * The end state is a paper-graph: the central paper resource, plus one
 * resource per unresolved entity, with the original paper's annotations
 * all bound to either an existing or newly-synthesized resource.
 *
 * Usage: tsx skills/paper-graph/script.ts <arxiv-id>
 */

import {
  SemiontClient,
  annotationId,
  entityType,
  type GatheredContext,
} from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';

const ENTITY_TYPES = (
  process.env.ENTITY_TYPES ??
  'Author,CitedPaper,Method,Dataset,Benchmark,Concept,Affiliation'
)
  .split(',')
  .map((t) => entityType(t.trim()));

const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 30);

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function main(): Promise<void> {
  const arxivId = process.argv[2];
  if (!arxivId) {
    console.error('Usage: tsx skills/paper-graph/script.ts <arxiv-id>');
    process.exit(1);
  }

  const paper = await fetchArxivPaper(arxivId);
  console.log(`Paper: ${paper.title}`);

  const semiont = await SemiontClient.signInHttp({
    baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
    email: process.env.SEMIONT_USER_EMAIL!,
    password: process.env.SEMIONT_USER_PASSWORD!,
  });

  // Step 1 — yield the central paper resource
  const { resourceId: rId } = await semiont.yield.resource({
    name: paper.title,
    file: Buffer.from(formatArxivPaper(paper), 'utf-8'),
    format: 'text/markdown',
    entityTypes: ['research-paper'],
    storageUri: `file://papers/arxiv-${paper.id}.md`,
  });

  // Step 2 — mark entity references
  console.log('Detecting entity references...');
  await semiont.mark.assist(rId, 'linking', { entityTypes: ENTITY_TYPES });

  // Steps 3 + 4 — resolve or synthesize, per annotation
  const annotations = await semiont.browse.annotations(rId);
  const unresolved = annotations.filter(
    (ann) =>
      ann.motivation === 'linking' &&
      !ann.body?.some((b) => b.type === 'SpecificResource'),
  );
  console.log(`${unresolved.length} unresolved references to process`);

  let bound = 0;
  let synthesized = 0;

  for (const ann of unresolved) {
    const annId = annotationId(ann.id);
    const text = ann.target?.selector?.exact ?? '';

    const gather = await semiont.gather.annotation(annId, rId, {
      contextWindow: 2000,
    });
    const context = gather.response as GatheredContext;

    const matchResult = await semiont.match.search(rId, annId, context, {
      limit: 10,
      useSemanticScoring: true,
    });
    const top = matchResult.response[0];

    if (top && (top.score ?? 0) >= MATCH_THRESHOLD) {
      // Step 3 path — bind to existing
      await semiont.bind.body(rId, annId, [
        {
          op: 'add',
          item: {
            type: 'SpecificResource',
            source: top['@id'],
            purpose: 'linking',
          },
        },
      ]);
      bound++;
      console.log(`  bound       "${text}" -> ${top.name} (score ${top.score})`);
    } else {
      // Step 4 path — synthesize a new resource and bind
      const yieldEvent = await semiont.yield.fromAnnotation(rId, annId, {
        title: text,
        storageUri: `file://generated/${slugify(text)}.md`,
        context,
      });

      // The final emission of yield.fromAnnotation is { kind: 'complete', data: JobCompleteCommand }
      // where data.result is a JobGenerationResult carrying the new resourceId.
      if (yieldEvent.kind !== 'complete') {
        console.warn(`  unexpected yield event kind for "${text}": ${yieldEvent.kind}`);
        continue;
      }
      const newResourceId = (
        yieldEvent.data.result as { resourceId?: string } | undefined
      )?.resourceId;
      if (!newResourceId) {
        console.warn(`  yield.fromAnnotation gave no resourceId for "${text}"`);
        continue;
      }

      await semiont.bind.body(rId, annId, [
        {
          op: 'add',
          item: {
            type: 'SpecificResource',
            source: newResourceId,
            purpose: 'linking',
          },
        },
      ]);
      synthesized++;
      console.log(`  synthesized "${text}" -> ${newResourceId}`);
    }
  }

  console.log(
    `\nDone. ${bound} bound to existing, ${synthesized} synthesized.`,
  );
  console.log(
    `Paper-graph rooted at ${rId} with ${bound + synthesized} bound annotations.`,
  );
  semiont.dispose();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
