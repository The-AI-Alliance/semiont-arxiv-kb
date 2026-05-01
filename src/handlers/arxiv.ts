/**
 * ArXiv Handler
 *
 * Downloads and processes research papers from arXiv.org
 */

import { writeFileSync, readFileSync } from 'node:fs';
import type { DatasetHandler, DatasetYamlConfig } from './types.js';
import { fetchArxivPaper, formatArxivPaper } from '../arxiv.js';
import { printInfo, printSuccess } from '../display.js';

export const arxivHandler: DatasetHandler = {
  download: async (config: DatasetYamlConfig) => {
    if (!config.dataset) {
      throw new Error('ArXiv handler requires dataset (arxiv ID) in config');
    }
    if (!config.cacheFile) {
      throw new Error('ArXiv handler requires cacheFile in config');
    }

    printInfo(`Fetching arXiv:${config.dataset}...`);
    const paper = await fetchArxivPaper(config.dataset);
    printSuccess(`Fetched paper: ${paper.title}`);

    writeFileSync(config.cacheFile, JSON.stringify(paper, null, 2));
    printSuccess(`Saved to ${config.cacheFile}`);
  },

  load: async (config: DatasetYamlConfig) => {
    if (!config.cacheFile) {
      throw new Error('ArXiv handler requires cacheFile in config');
    }

    printInfo(`Loading from ${config.cacheFile}...`);
    const data = readFileSync(config.cacheFile, 'utf-8');
    const paper = JSON.parse(data);
    printSuccess('Loaded paper metadata');

    printInfo('Formatting with markdown...');
    const formattedText = formatArxivPaper(paper);
    printSuccess(`Formatted paper: ${formattedText.length.toLocaleString()} characters`);

    return formattedText;
  },
};
