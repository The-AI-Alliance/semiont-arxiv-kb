/**
 * download-paper — fetch an arXiv paper and create one resource.
 *
 * Usage: tsx skills/download-paper/script.ts <arxiv-id>
 * Example: tsx skills/download-paper/script.ts 1706.03762
 */

import { SemiontClient } from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';

async function main(): Promise<void> {
  const arxivId = process.argv[2];
  if (!arxivId) {
    console.error('Usage: tsx skills/download-paper/script.ts <arxiv-id>');
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
