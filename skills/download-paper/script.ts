/**
 * download-paper — fetch an arXiv paper and create one resource.
 *
 * Usage: tsx skills/download-paper/script.ts <arxiv-id>
 * Example: tsx skills/download-paper/script.ts 1706.03762
 */

import { SemiontSession, InMemorySessionStorage, httpKb } from '@semiont/sdk';
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
  // mark.delegate entity types used by mark-entities, resolve-entities, paper-graph
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

  try {
    // Declare this KB's entity-type vocabulary via frame. Idempotent.
    await semiont.frame.addEntityTypes(KB_ENTITY_TYPES);

    // Tier-3 checkpoint: confirm before yield. Non-interactive mode auto-proceeds.
    const proceed = await confirm(
      `About to upload "${paper.title}" as a Resource (text/markdown, ${markdown.length} bytes). Proceed?`,
      true,
    );
    if (!proceed) {
      console.log('Aborted before upload.');
      closeInteractive();
      return;
    }

    console.log('Uploading to gateway...');
    const { resourceId } = await semiont.yield.resource({
      name: paper.title,
      file: Buffer.from(markdown, 'utf-8'),
      format: 'text/markdown',
      entityTypes: ['research-paper'],
      storageUri: `file://papers/arxiv-${paper.id}.md`,
    });

    console.log(`Created resource: ${resourceId}`);
    closeInteractive();
  } finally {
    await session.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
