/**
 * resolve-entities — like mark-entities, but also try to resolve each
 * unresolved reference against existing KB resources.
 *
 * For each unresolved annotation: gather LLM context, search the KB for
 * candidates, and bind to the best match if its score crosses the
 * threshold. References that don't match anything stay unresolved
 * (paper-graph synthesizes resources for those).
 *
 * Usage: tsx skills/resolve-entities/script.ts <arxiv-id>
 */

import {
  SemiontClient,
  annotationId,
  entityType,
  type GatheredContext,
} from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';
import { pick, close as closeInteractive, isInteractive } from '../../src/interactive.js';

const ENTITY_TYPES = (
  process.env.ENTITY_TYPES ??
  'Author,CitedPaper,Method,Dataset,Benchmark,Concept,Affiliation'
)
  .split(',')
  .map((t) => entityType(t.trim()));

const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 30);

// Borderline band around the threshold where interactive disambiguation is most
// useful. With default MATCH_THRESHOLD=30 this means scores in [15, 45) are
// surfaced to the user; clearly-above (≥45) auto-bind, clearly-below (<15) skip.
const BORDERLINE_BAND = 15;

async function main(): Promise<void> {
  const arxivId = process.argv.find((a) => !a.startsWith('-') && /^\d{4}\./.test(a)) ?? process.argv[2];
  if (!arxivId || arxivId.startsWith('-')) {
    console.error('Usage: tsx skills/resolve-entities/script.ts <arxiv-id> [--interactive]');
    process.exit(1);
  }

  const paper = await fetchArxivPaper(arxivId);
  console.log(`Paper: ${paper.title}`);

  const semiont = await SemiontClient.signInHttp({
    baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
    email: process.env.SEMIONT_USER_EMAIL!,
    password: process.env.SEMIONT_USER_PASSWORD!,
  });

  const { resourceId: rId } = await semiont.yield.resource({
    name: paper.title,
    file: Buffer.from(formatArxivPaper(paper), 'utf-8'),
    format: 'text/markdown',
    entityTypes: ['research-paper'],
    storageUri: `file://papers/arxiv-${paper.id}.md`,
  });

  console.log('Detecting entity references...');
  await semiont.mark.assist(rId, 'linking', { entityTypes: ENTITY_TYPES });

  const annotations = await semiont.browse.annotations(rId);
  const unresolved = annotations.filter(
    (ann) =>
      ann.motivation === 'linking' &&
      !ann.body?.some((b) => b.type === 'SpecificResource'),
  );
  console.log(`${unresolved.length} unresolved references to attempt resolution`);

  let bound = 0;
  let stillUnresolved = 0;

  for (const ann of unresolved) {
    const annId = annotationId(ann.id);
    const text = ann.target?.selector?.exact ?? '';

    // Gather LLM context for this annotation
    const gather = await semiont.gather.annotation(annId, rId, {
      contextWindow: 2000,
    });
    const context = gather.response as GatheredContext;

    // Search the KB for candidate matches
    const matchResult = await semiont.match.search(rId, annId, context, {
      limit: 10,
      useSemanticScoring: true,
    });
    const candidates = matchResult.response;
    const top = candidates[0];
    const topScore = top?.score ?? 0;

    let chosen = top && topScore >= MATCH_THRESHOLD ? top : null;

    // Tier-3 checkpoint: borderline scores get user disambiguation.
    // Clearly-above auto-bind; clearly-below auto-skip; in-between asks.
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
      // Bind — link the annotation to the chosen resource
      await semiont.bind.body(rId, annId, [
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
      console.log(`  bound  "${text}" -> ${chosen.name} (score ${chosen.score})`);
    } else {
      stillUnresolved++;
      console.log(`  unresolved  "${text}"`);
    }
  }

  console.log(`Done. Bound ${bound}, still unresolved ${stillUnresolved}.`);
  semiont.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
