/**
 * mark-entities — download a paper, then auto-detect entity references.
 *
 * Combines `download-paper` with `mark.assist` for the seven arXiv-typical
 * entity types (Author, CitedPaper, Method, Dataset, Benchmark, Concept,
 * Affiliation). Detected references are stored as unresolved `linking`
 * annotations — they have entity types but are not yet bound to specific
 * resources. `resolve-entities` and `paper-graph` handle resolution.
 *
 * Usage: tsx skills/mark-entities/script.ts <arxiv-id>
 */

import { SemiontClient, entityType } from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';

const ENTITY_TYPES = (
  process.env.ENTITY_TYPES ??
  'Author,CitedPaper,Method,Dataset,Benchmark,Concept,Affiliation'
)
  .split(',')
  .map((t) => entityType(t.trim()));

async function main(): Promise<void> {
  const arxivId = process.argv[2];
  if (!arxivId) {
    console.error('Usage: tsx skills/mark-entities/script.ts <arxiv-id>');
    process.exit(1);
  }

  console.log(`Fetching arXiv:${arxivId}...`);
  const paper = await fetchArxivPaper(arxivId);
  console.log(`  ${paper.title}`);

  const markdown = formatArxivPaper(paper);

  const semiont = await SemiontClient.signInHttp({
    baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
    email: process.env.SEMIONT_USER_EMAIL!,
    password: process.env.SEMIONT_USER_PASSWORD!,
  });

  console.log('Uploading to backend...');
  const { resourceId: rId } = await semiont.yield.resource({
    name: paper.title,
    file: Buffer.from(markdown, 'utf-8'),
    format: 'text/markdown',
    entityTypes: ['research-paper'],
    storageUri: `file://papers/arxiv-${paper.id}.md`,
  });

  console.log(`Detecting entity references for ${ENTITY_TYPES.length} types...`);
  // `mark.assist` with motivation 'linking' creates unresolved-reference
  // annotations — spans tagged with entity types, ready to be resolved later.
  const progress = await semiont.mark.assist(rId, 'linking', {
    entityTypes: ENTITY_TYPES,
  });

  console.log(
    `Created ${progress.progress?.createdCount ?? 0} unresolved references on ${rId}`,
  );

  semiont.dispose();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
