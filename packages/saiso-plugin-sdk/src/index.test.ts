import { describe, expect, it } from 'bun:test';
import { SAISO_PLUGIN_API_VERSION } from '../src/index.js';

describe('saiso-plugin-sdk', () => {
  it('exposes the plugin API version', () => {
    expect(SAISO_PLUGIN_API_VERSION).toBe('1.0.0');
  });

  it('exports the plugin manifest contract types', () => {
    // Type-level smoke: the module must be importable and expose the version constant.
    const mod = require('../src/index.js') as typeof import('../src/index.js');
    expect(mod.SAISO_PLUGIN_API_VERSION).toBeDefined();
  });
});