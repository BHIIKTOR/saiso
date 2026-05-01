import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FeatureConfig } from '@saiso/core';
import { insertUniqueLinesBetweenMarkers, updateFeatureRegistry, updateMainIndex } from './add.js';

describe('add command deterministic feature integration', () => {
  it('inserts unique lines between markers without duplicates', () => {
    const base = [
      '// START',
      'existingLine',
      '// END',
    ].join('\n');

    const updated = insertUniqueLinesBetweenMarkers(base, '// START', '// END', [
      'existingLine',
      'newLine',
    ]);

    expect(updated.includes('newLine')).toBe(true);
    expect(updated.match(/existingLine/g)?.length).toBe(1);
  });

  it('creates and updates feature registry deterministically', async () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'saiso-add-feature-'));
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });

    const config: FeatureConfig = {
      name: 'query_balance',
      displayName: 'Query Balance',
      description: 'Test feature',
      version: '1.0.0',
      category: 'defi',
      dependencies: {},
      files: [
        {
          source: 'action.ts',
          destination: 'src/actions/queryBalance.ts',
        },
      ],
      integration: {
        imports: ["import { queryBalanceAction } from './actions/queryBalance.js';"],
        actions: ['queryBalanceAction'],
      },
      environment: { required: [], optional: [] },
      features: {},
      examples: [],
    };

    await updateFeatureRegistry(projectRoot, config);
    await updateFeatureRegistry(projectRoot, config);

    const registry = await fs.readFile(path.join(projectRoot, 'src/features/registry.ts'), 'utf-8');
    expect(registry.match(/queryBalanceAction/g)?.length).toBe(2); // import + action reference
    expect(registry).toContain("from '../actions/queryBalance.js'");
  });

  it('wires main index to feature registry exactly once', async () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'saiso-add-main-index-'));
    const indexPath = path.join(projectRoot, 'src/index.ts');
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, "import { saisoConfig } from '@saiso/core';\n\nconsole.log(saisoConfig);\n", 'utf-8');

    await updateMainIndex(projectRoot);
    await updateMainIndex(projectRoot);

    const updated = await fs.readFile(indexPath, 'utf-8');
    expect(updated.match(/featureActions/g)?.length).toBe(2); // import + hook usage
    expect(updated.match(/SAISO feature registry hook/g)?.length).toBe(1);
  });
});
