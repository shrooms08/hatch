// Unit tests: holder counting, holdings filter, image proxy validation, launch copy. Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countHolders, hasTraded } from '../src/lib/server/holders.ts';
import { holdingsFrom } from '../src/lib/server/holdings.ts';
import { imageTypeOf, proxyableUrl } from '../src/lib/server/imageProxy.ts';
import { feeSentence } from '../src/lib/dbc/feeSchedule.ts';
import { copyKey, howItWorksText } from '../src/lib/presets/copy.ts';

const AUTH = 'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM';

test('holders: Token-2022 accounts counted, vaults/authority and zero balances excluded, owners deduped', () => {
  const n = countHolders(
    [
      { address: 'vault', owner: AUTH, amount: 902_927_741_375_392n }, // the curve's base vault
      { address: 'buyerAta', owner: 'buyer1', amount: 97_072_258_624_608n },
      { address: 'buyer1Other', owner: 'buyer1', amount: 5n },
      { address: 'emptyAta', owner: 'buyer2', amount: 0n },
      { address: 'quoteVault', owner: 'someone', amount: 10n },
    ],
    { owners: [AUTH], accounts: ['vault', 'quoteVault'] }
  );
  assert.equal(n, 1);
  // GCHIP today: the only buyer sold out, so 0 holders, and the pool has traded (fees).
  assert.equal(countHolders([{ address: 'v', owner: AUTH, amount: 10n ** 15n }, { address: 'a', owner: '8Fux', amount: 0n }], { owners: [AUTH], accounts: ['v'] }), 0);
  assert.equal(hasTraded({ quoteReserveRaw: '0', feesRaw: ['6715368', '0'] }), true);
  assert.equal(hasTraded({ quoteReserveRaw: '0', feesRaw: ['0', '0'] }), false);
});

test('holdings: only Hatch pools, zero balances excluded, accounts of one mint summed', () => {
  const pools = new Map([
    ['hatchA', { presetId: 'MEME', name: 'A' }],
    ['hatchB', { presetId: 'STOCK', name: 'B' }],
    ['notHatch', { presetId: null, name: 'X' }],
  ]);
  const out = holdingsFrom(
    [
      { mint: 'hatchA', amountRaw: '100', decimals: 6 },
      { mint: 'hatchA', amountRaw: '50', decimals: 6 },
      { mint: 'hatchB', amountRaw: '0', decimals: 6 },
      { mint: 'notHatch', amountRaw: '999', decimals: 6 },
      { mint: 'USDC', amountRaw: '5000000', decimals: 6 },
      { mint: 'hatchA', amountRaw: 'garbage', decimals: 6 },
    ],
    pools
  );
  assert.deepEqual(out.map((h) => [h.mint, h.amountRaw]), [['hatchA', 150n]]);
});

test('image proxy: only http(s) URLs, only real image bytes up to 2 MB', () => {
  assert.equal(proxyableUrl('https://pbs.twimg.com/media/x.jpg'), 'https://pbs.twimg.com/media/x.jpg');
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:image/png;base64,AA', 'https://u:p@x.com/a.png', '', 'x'.repeat(3000), 42]) assert.equal(proxyableUrl(bad), null);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(imageTypeOf(png), 'image/png');
  assert.equal(imageTypeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(imageTypeOf(Buffer.from('<html><body>hotlinking not allowed</body></html>')), null);
  assert.equal(imageTypeOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(imageTypeOf(Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)])), null);
});

test('launch copy: shield wording for v2, "1% fee per trade" only for legacy, real split', () => {
  assert.equal(feeSentence({ shield: true, creatorPct: 80 }), 'Fees start at 50% for the first minute so bots pay, then 1% per trade, split with Hatch (80% to you).');
  assert.equal(feeSentence({ shield: false, creatorPct: 50 }), '1% fee per trade, split with Hatch (50% to you).');
  assert.equal(
    howItWorksText({ quoteSymbol: 'TSLAx', stockPaired: true, threshold: '2.52', fee: feeSentence({ shield: true, creatorPct: 50 }) }),
    'Buyers pay with TSLAx or SOL. Every buy nudges the price up. At 2.52 TSLAx it hatches into a Meteora pool. Fees start at 50% for the first minute so bots pay, then 1% per trade, split with Hatch (50% to you).'
  );
  assert.equal(copyKey('STOCK', 'tsla'), 'STOCK:TSLA');
  assert.equal(copyKey('MEME', 'NVDA'), 'MEME');
});
