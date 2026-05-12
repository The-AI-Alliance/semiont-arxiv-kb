/**
 * Tag schemas owned by semiont-arxiv-kb.
 *
 * Schemas are runtime-registered per KB via `frame.addTagSchema(...)`.
 * The `register-tag-schemas` skill registers all of them at once for KB
 * bootstrap. Skills that use a specific schema can also self-register
 * idempotently at startup.
 */

import type { TagSchema } from '@semiont/sdk';

export const SCIENTIFIC_IMRAD_SCHEMA: TagSchema = {
  id: 'scientific-imrad',
  name: 'Scientific Paper (IMRAD)',
  description: 'Introduction, Methods, Results, Discussion structure for research papers',
  domain: 'scientific',
  tags: [
    {
      name: 'Introduction',
      description: 'Background, context, and research question',
      examples: [
        'What is the research question?',
        'Why is this important?',
        'What is the hypothesis?',
      ],
    },
    {
      name: 'Methods',
      description: 'Experimental design and procedures',
      examples: [
        'How was the study conducted?',
        'What methods were used?',
        'What was the experimental design?',
      ],
    },
    {
      name: 'Results',
      description: 'Findings and observations',
      examples: [
        'What did the study find?',
        'What are the data?',
        'What were the observations?',
      ],
    },
    {
      name: 'Discussion',
      description: 'Interpretation and implications of results',
      examples: [
        'What do the results mean?',
        'What are the implications?',
        'How do these findings relate to prior work?',
      ],
    },
  ],
};

export const ALL_SCHEMAS: TagSchema[] = [SCIENTIFIC_IMRAD_SCHEMA];
