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

import { SemiontSession, InMemorySessionStorage, type KnowledgeBase, entityType } from '@semiont/sdk';
import { fetchArxivPaper, formatArxivPaper } from '../../src/arxiv.js';
import { confirm, close as closeInteractive } from '../../src/interactive.js';
import { createdCount } from '../../src/mark-result.js';

const ENTITY_TYPES = (
  process.env.ENTITY_TYPES ??
  'Author,CitedPaper,Method,Dataset,Benchmark,Concept,Affiliation'
)
  .split(',')
  .map((t) => entityType(t.trim()));

async function main(): Promise<void> {
  const arxivId = process.argv.find((a) => !a.startsWith('-') && /^\d{4}\./.test(a)) ?? process.argv[2];
  if (!arxivId || arxivId.startsWith('-')) {
    console.error('Usage: tsx skills/mark-entities/script.ts <arxiv-id> [--interactive]');
    process.exit(1);
  }

  console.log(`Fetching arXiv:${arxivId}...`);
  const paper = await fetchArxivPaper(arxivId);
  console.log(`  ${paper.title}`);

  const markdown = formatArxivPaper(paper);

  const baseUrl = process.env.SEMIONT_API_URL ?? 'http://localhost:4000';
  const email = process.env.SEMIONT_USER_EMAIL!;
  const password = process.env.SEMIONT_USER_PASSWORD!;
  const u = new URL(baseUrl);
  const kb: KnowledgeBase = {
    id: 'arxiv-mark-entities',
    label: 'arxiv mark-entities',
    email,
    endpoint: { kind: 'http', host: u.hostname, port: Number(u.port) || 4000, protocol: u.protocol.replace(':', '') as 'http' | 'https' },
  };
  const session = await SemiontSession.signInHttp({ kb, storage: new InMemorySessionStorage(), baseUrl, email, password });
  const semiont = session.client;

  try {
    // Tier-3 checkpoint: confirm parameters before running mark.assist. Lets
    // the user catch a bad ENTITY_TYPES override before paying for detection.
    const proceedDetection = await confirm(
      `About to upload paper and run mark.assist with ${ENTITY_TYPES.length} entity types: [${ENTITY_TYPES.join(', ')}]. Proceed?`,
      true,
    );
    if (!proceedDetection) {
      console.log('Aborted before detection.');
      closeInteractive();
      return;
    }

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
      `Created ${createdCount(progress)} unresolved references on ${rId}`,
    );

    // Tier-3 informational: surface what was detected so the user can see what
    // the model produced before deciding whether to proceed with downstream skills.
    const annotations = await semiont.browse.annotations(rId);
    const linking = annotations.filter((a) => a.motivation === 'linking');
    console.log(`\nResource ${rId} now carries ${linking.length} linking annotations.`);
    if (linking.length > 0) {
      const sample = linking.slice(0, 10);
      console.log('Sample (first 10):');
      for (const ann of sample) {
        const target = ann.target;
        const selectors =
          typeof target === 'string' || !target.selector
            ? []
            : Array.isArray(target.selector)
              ? target.selector
              : [target.selector];
        let text = '(no text)';
        for (const s of selectors) {
          if (s.type === 'TextQuoteSelector') { text = s.exact; break; }
        }
        console.log(`  - "${text}"`);
      }
      if (linking.length > 10) console.log(`  … and ${linking.length - 10} more.`);
    }

    closeInteractive();
  } finally {
    await session.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
