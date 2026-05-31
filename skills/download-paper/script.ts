/**
 * download-paper — fetch an arXiv paper and create one resource.
 *
 * Usage: tsx skills/download-paper/script.ts <arxiv-id>
 * Example: tsx skills/download-paper/script.ts 1706.03762
 */

import { SemiontSession, InMemorySessionStorage, type KnowledgeBase } from '@semiont/sdk';
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

  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KnowledgeBase = {
    id: 'arxiv-download-paper',
    label: 'arxiv download-paper',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
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

    console.log('Uploading to backend...');
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
