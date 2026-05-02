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
  entityType,
  type GatheredContext,
} from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';
import {
  confirm,
  pick,
  close as closeInteractive,
  isInteractive,
} from '../../src/interactive.js';

const ENTITY_TYPES = (
  process.env.ENTITY_TYPES ??
  'Author,CitedPaper,Method,Dataset,Benchmark,Concept,Affiliation'
)
  .split(',')
  .map((t) => entityType(t.trim()));

const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 30);
const BORDERLINE_BAND = 15;

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function main(): Promise<void> {
  const arxivId = process.argv.find((a) => !a.startsWith('-') && /^\d{4}\./.test(a)) ?? process.argv[2];
  if (!arxivId || arxivId.startsWith('-')) {
    console.error('Usage: tsx skills/paper-graph/script.ts <arxiv-id> [--interactive]');
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

  // Tier-3 checkpoint: budget gate. With dozens of unresolved refs, this can
  // mean dozens of yield.fromAnnotation calls (which run inference). Confirm
  // the scope before committing.
  if (unresolved.length > 0) {
    const proceed = await confirm(
      `Will run gather + match + (bind or yield) per annotation — up to ${unresolved.length} iterations, each making inference calls. Proceed?`,
      true,
    );
    if (!proceed) {
      console.log('Aborted before resolution loop.');
      semiont.dispose();
      closeInteractive();
      return;
    }
  }

  let bound = 0;
  let synthesized = 0;
  let skipped = 0;

  for (const ann of unresolved) {
    const text = ann.target?.selector?.exact ?? '';

    const gather = await semiont.gather.annotation(ann.id, rId, {
      contextWindow: 2000,
    });
    const context = gather.response as GatheredContext;

    const matchResult = await semiont.match.search(rId, ann.id, context, {
      limit: 10,
      useSemanticScoring: true,
    });
    const candidates = matchResult.response;
    const top = candidates[0];
    const topScore = top?.score ?? 0;

    // Tier-3 checkpoint: borderline match disambiguation.
    let chosen = top && topScore >= MATCH_THRESHOLD ? top : null;
    const borderline =
      isInteractive() &&
      candidates.length > 0 &&
      topScore < MATCH_THRESHOLD + BORDERLINE_BAND &&
      topScore >= MATCH_THRESHOLD - BORDERLINE_BAND;
    if (borderline) {
      const picked = await pick(
        `Borderline match for "${text}" (top score ${topScore}, threshold ${MATCH_THRESHOLD}):`,
        candidates.slice(0, 5),
        (c) => `${c.name ?? '(unnamed)'} [score ${c.score ?? '?'}, id ${c['@id'] ?? '?'}]`,
      );
      chosen = picked ?? null;
    }

    if (chosen) {
      // Step 3 path — bind to existing
      await semiont.bind.body(rId, ann.id, [
        {
          op: 'add',
          item: {
            type: 'SpecificResource',
            source: chosen['@id'],
            purpose: 'linking',
          },
        },
      ]);
      bound++;
      console.log(`  bound       "${text}" -> ${chosen.name} (score ${chosen.score})`);
    } else {
      // Step 4 path — synthesize a new resource and bind.
      // Tier-3 checkpoint (interactive only): confirm per-synthesis. Lets the
      // user steer which entities get stub resources vs. left unresolved.
      const proceedYield = isInteractive()
        ? await confirm(`No confident match for "${text}". Synthesize a new resource for it?`, true)
        : true;
      if (!proceedYield) {
        skipped++;
        console.log(`  skipped     "${text}"`);
        continue;
      }

      const yieldEvent = await semiont.yield.fromAnnotation(rId, ann.id, {
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

      await semiont.bind.body(rId, ann.id, [
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
    `\nDone. ${bound} bound to existing, ${synthesized} synthesized, ${skipped} skipped.`,
  );
  console.log(
    `Paper-graph rooted at ${rId} with ${bound + synthesized} bound annotations.`,
  );
  semiont.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
