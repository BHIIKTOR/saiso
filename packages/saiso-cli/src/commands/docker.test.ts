import { describe, expect, it } from 'bun:test';
import { getDockerDoctorChecks } from './docker.js';

describe('docker command helpers', () => {
  it('returns required docker doctor checks in deterministic order', () => {
    const checks = getDockerDoctorChecks();
    expect(checks.map((check) => check.name)).toEqual([
      'Docker CLI',
      'Docker Daemon',
      'Docker Compose',
    ]);
    expect(checks[0].required).toBe(true);
    expect(checks[1].required).toBe(true);
    expect(checks[2].required).toBe(false);
  });
});
