/**
 * download-paper — fetch an arXiv paper and create one resource.
 *
 * Usage: tsx skills/download-paper/script.ts <arxiv-id>
 * Example: tsx skills/download-paper/script.ts 1706.03762
 */

import { SemiontClient } from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';
import { confirm, close as closeInteractive } from '../../src/interactive.js';

/**
 * The full entity-type vocabulary this KB uses across all skills. Declared
 * via `frame.addEntityTypes` once on every download-paper invocation —
 * idempotent, so re-runs are harmless. Centralizing the list here is what
 * makes `browse.entityTypes()` return a coherent published vocabulary.
 */
const KB_ENTITY_TYPES = [
  // Resource type for the paper itself
  'research-paper',
  // mark.assist entity types used by mark-entities, resolve-entities, paper-graph
  'Author',
  'CitedPaper',
  'Method',
  'Dataset',
  'Benchmark',
  'Concept',
  'Affiliation',
];

async function main(): Promise<void> {
  const arxivId = process.argv.find((a) => !a.startsWith('-') && /^\d{4}\./.test(a)) ?? process.argv[2];
  if (!arxivId || arxivId.startsWith('-')) {
    console.error('Usage: tsx skills/download-paper/script.ts <arxiv-id> [--interactive]');
    process.exit(1);
  }

  console.log(`Fetching arXiv:${arxivId}...`);
  const paper = await fetchArxivPaper(arxivId);
  console.log(`  ${paper.title}`);
  console.log(`  by ${paper.authors.join(', ')}`);

  const markdown = formatArxivPaper(paper);

  const semiont = await SemiontClient.signInHttp({
    baseUrl: process.env.SEMIONT_API_URL ?? 'http://localhost:4000',
    email: process.env.SEMIONT_USER_EMAIL!,
    password: process.env.SEMIONT_USER_PASSWORD!,
  });

  // Declare this KB's entity-type vocabulary via frame. Idempotent.
  await semiont.frame.addEntityTypes(KB_ENTITY_TYPES);

  // Tier-3 checkpoint: confirm before yield. Non-interactive mode auto-proceeds.
  const proceed = await confirm(
    `About to upload "${paper.title}" as a Resource (text/markdown, ${markdown.length} bytes). Proceed?`,
    true,
  );
  if (!proceed) {
    console.log('Aborted before upload.');
    semiont.dispose();
    closeInteractive();
    return;
  }

  console.log('Uploading to backend...');
  const { resourceId } = await semiont.yield.resource({
    name: paper.title,
    file: Buffer.from(markdown, 'utf-8'),
    format: 'text/markdown',
    entityTypes: ['research-paper'],
    storageUri: `file://papers/arxiv-${paper.id}.md`,
  });

  console.log(`Created resource: ${resourceId}`);
  semiont.dispose();
  closeInteractive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
