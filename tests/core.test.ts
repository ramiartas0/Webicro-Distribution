import { describe, it, expect } from 'vitest';
import { generateReleaseId } from '../packages/core/src/release-id.js';
import { ReleaseStateMachine } from '../packages/core/src/state-machine.js';

describe('Core State Machine & Release ID', () => {
  it('should generate valid release IDs matching pattern', () => {
    const id = generateReleaseId();
    expect(id).toMatch(/^REL-\d{4}-\d{2}-\d{2}-[0-9A-F]{6}$/);
  });

  it('should enforce state machine lifecycle transitions', () => {
    const sm = new ReleaseStateMachine('DRAFT');
    expect(sm.currentStatus).toBe('DRAFT');

    sm.transitionTo('ANALYZING');
    expect(sm.currentStatus).toBe('ANALYZING');

    sm.transitionTo('PLANNED');
    expect(sm.currentStatus).toBe('PLANNED');

    sm.transitionTo('VALIDATING');
    expect(sm.currentStatus).toBe('VALIDATING');

    expect(() => sm.transitionTo('RELEASED')).toThrow();
  });
});
