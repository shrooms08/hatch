// Unit tests for the token page lifecycle stepper (src/lib/lifecycle.ts). Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countdownParts, lifecycleSteps, timeAgo, type LifecycleInput } from '../src/lib/lifecycle.ts';

const base: LifecycleInput = { launchedAt: 1791497100, hasShield: true, shieldLive: false, progress: 0.001, isMigrated: false };
const states = (o: Partial<LifecycleInput>) => lifecycleSteps({ ...base, ...o }).map((s) => s.state).join(',');

test('v2 pool in its first 60 s: Shield is the current step', () => {
  assert.equal(states({ shieldLive: true }), 'done,current,future,future,future');
});

test('after the shield: Bonding curve is current, Shield done', () => {
  assert.equal(states({}), 'done,done,current,future,future');
});

test('v1 pool: no shield step (skipped), curve current', () => {
  assert.equal(states({ hasShield: false }), 'done,skipped,current,future,future');
  assert.equal(states({ hasShield: false, shieldLive: true }), 'done,skipped,current,future,future');
});

test('100% but not migrated yet: Graduation current; migrated: DAMM v2 current', () => {
  assert.equal(states({ progress: 1 }), 'done,done,done,current,future');
  assert.equal(states({ progress: 1, isMigrated: true }), 'done,done,done,done,current');
  assert.equal(states({ hasShield: false, progress: 1, isMigrated: true }), 'done,skipped,done,done,current');
});

test('countdown and time-ago helpers', () => {
  assert.deepEqual(countdownParts(42), ['00', '42']);
  assert.deepEqual(countdownParts(41.2), ['00', '42']);
  assert.deepEqual(countdownParts(-3), ['00', '00']);
  assert.equal(timeAgo(1000, 1030), 'just now');
  assert.equal(timeAgo(1000, 1000 + 7200), '2h ago');
  assert.equal(timeAgo(0, 3 * 86400), '3d ago');
});
