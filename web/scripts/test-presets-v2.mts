// Unit tests for presets v2: legacy configs and the Sniper shield fee schedule. Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFeeSchedulerParams } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { loadHatchConfigs, configKeyFor, enabledPresets } from '../src/lib/server/presets.ts';
import { allConfigKeys, isLegacyConfig, presetForConfig, stockForConfig } from '../src/lib/presets/index.ts';
import { baseFeePercentAt, formatFeePercent, hasSniperShield, shieldDuration, shieldRange, type FeeSchedule } from '../src/lib/dbc/feeSchedule.ts';

const V1_STOCK = 'HX9EjDXFjazM5gLyN2hUG5SRsH9BMorKi1EhVVw1BzJ6';
const V1_MEME = 'HjeeZN7aDtgfAoiVh8F17GeAKVAg4DFJsHx8Ap2GUfqv';
const V2_NVDA = 'BMHNjCP16u6Dch1mW6qe1zfHEJJpRkmrXi5aZw1ogL1y';
const V2_TSLA = 'HJKEzsNZGHSgSzfHdFeLfAKWcefYYo4Sd5DNiaDvfWYP';
const V2_MEME = 'HoRw7tSgAXg2XUUDckRG4GWtC3DX21RC4RKB5PNittym';
const V2_AI = 'B9rKSC6vQHrvvzjn4yakiU4euW54SYS1e58QVh8F26CB';
const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const TSLAX = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';

function withEnv<T>(env: Record<string, string>, fn: () => T): T {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

const V2_ENV = {
  POOL_CONFIGS: JSON.stringify({ MEME: V2_MEME, AI_AGENT: V2_AI }),
  STOCK_CONFIGS: JSON.stringify({
    NVDA: { config: V2_NVDA, quoteMint: NVDAX, symbol: 'NVDAx', name: 'NVIDIA' },
    TSLA: { config: V2_TSLA, quoteMint: TSLAX, symbol: 'TSLAx', name: 'Tesla' },
  }),
  LEGACY_CONFIGS: JSON.stringify([{ config: V1_STOCK, preset: 'STOCK', stock: 'NVDA' }, { config: V1_MEME, preset: 'MEME' }]),
};

// ---- legacy configs ----
test('legacy: v1 pools keep their preset and stock; lists include v1 and v2 configs', () => {
  const hc = withEnv(V2_ENV, loadHatchConfigs);
  assert.deepEqual(new Set(allConfigKeys(hc)), new Set([V2_MEME, V2_AI, V2_NVDA, V2_TSLA, V1_STOCK, V1_MEME]));
  assert.equal(presetForConfig(hc, V1_STOCK), 'STOCK');
  assert.equal(presetForConfig(hc, V1_MEME), 'MEME');
  assert.equal(presetForConfig(hc, V2_AI), 'AI_AGENT');
  assert.deepEqual(stockForConfig(hc, V1_STOCK), { ...hc.stocks.NVDA, config: V1_STOCK });
  assert.equal(stockForConfig(hc, V2_TSLA)?.symbol, 'TSLAx');
  assert.ok(isLegacyConfig(hc, V1_STOCK) && !isLegacyConfig(hc, V2_NVDA));
  assert.equal(presetForConfig(hc, 'So11111111111111111111111111111111111111112'), null);
});

test('legacy: new launches only use v2 configs', () => {
  withEnv(V2_ENV, () => {
    assert.equal(configKeyFor('STOCK', 'nvda').toBase58(), V2_NVDA);
    assert.equal(configKeyFor('STOCK', 'TSLA').toBase58(), V2_TSLA);
    assert.equal(configKeyFor('MEME').toBase58(), V2_MEME);
    assert.equal(configKeyFor('AI_AGENT').toBase58(), V2_AI);
    assert.deepEqual(enabledPresets(loadHatchConfigs()).sort(), ['AI_AGENT', 'MEME', 'STOCK']);
  });
});

test('legacy: a malformed LEGACY_CONFIGS entry is refused', () => {
  assert.throws(() => withEnv({ ...V2_ENV, LEGACY_CONFIGS: JSON.stringify([{ config: V1_MEME, preset: 'NOPE' }]) }, loadHatchConfigs));
  assert.throws(() => withEnv({ ...V2_ENV, LEGACY_CONFIGS: JSON.stringify([{ config: 'not-a-key', preset: 'MEME' }]) }, loadHatchConfigs));
});

// ---- sniper shield ----
// Same parameters as scripts/src/mainnet/presets.ts SNIPER_SHIELD: 50% -> 1%, exponential, 12 periods over 60 s.
const p = getFeeSchedulerParams(5000, 100, 1, 12, 60);
const SHIELD: FeeSchedule = {
  mode: 1,
  cliffFeeNumerator: p.cliffFeeNumerator.toString(),
  numberOfPeriod: p.firstFactor,
  periodFrequency: p.secondFactor.toString(),
  reductionFactor: p.thirdFactor.toString(),
  activationType: 1,
};
const FLAT: FeeSchedule = { mode: 0, cliffFeeNumerator: '10000000', numberOfPeriod: 0, periodFrequency: '0', reductionFactor: '0', activationType: 1 };

test('shield: 50% at launch, decays, 1% from 60 s on', () => {
  const t0 = 1_800_000_000;
  assert.ok(hasSniperShield(SHIELD));
  assert.equal(shieldDuration(SHIELD), 60);
  assert.equal(baseFeePercentAt(SHIELD, String(t0), t0), 50);
  const mid = baseFeePercentAt(SHIELD, String(t0), t0 + 30);
  assert.ok(mid < 50 && mid > 1, `mid fee ${mid}`);
  assert.ok(Math.abs(baseFeePercentAt(SHIELD, String(t0), t0 + 60) - 1) < 0.01);
  assert.ok(Math.abs(baseFeePercentAt(SHIELD, String(t0), t0 + 3600) - 1) < 0.01);
  // Before activation counts as activation (never above the cliff fee).
  assert.equal(baseFeePercentAt(SHIELD, String(t0), t0 - 10), 50);
  const r = shieldRange(SHIELD);
  assert.equal(formatFeePercent(r.start), '50%');
  assert.equal(formatFeePercent(r.end), '1%');
});

test('shield: v1 flat 1% configs have no shield', () => {
  assert.equal(hasSniperShield(FLAT), false);
  assert.equal(baseFeePercentAt(FLAT, '0', 0), 1);
});
