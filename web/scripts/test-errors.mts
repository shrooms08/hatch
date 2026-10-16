// Unit tests for the transaction error mapper and SOL cost estimates. Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TxError, UserError, friendlyTxError } from '../src/lib/txErrors.ts';
import { ACCOUNT_SIZE, CU_LIMIT, buyCostLamports, formatSol, formatSolNeed, launchCostLamports, rentFor } from '../src/lib/costs.ts';
import { PRIORITY_FEE_MICROLAMPORTS } from '../src/lib/config/network.ts';

const PER_BYTE = 5080; // mainnet today: rent(165 B) = 1,488,440
const sim = (logs: string[], err: unknown = { InstructionError: [2, { Custom: 1 }] }) => new TxError('Simulation failed', 'simulate', { err, logs });

test('insufficient lamports (real simulation log): need X, have Y', () => {
  const e = sim(['Program 11111111111111111111111111111111 invoke [2]', 'Transfer: insufficient lamports 1230020, need 1488440', 'Program 11111111111111111111111111111111 failed: custom program error: 0x1']);
  const f = friendlyTxError(e, { balanceLamports: 1_240_110, neededLamports: 8_788_330 });
  assert.equal(f.kind, 'insufficient-sol');
  assert.equal(f.message, 'You need about 0.0098 SOL for this. You have 0.00124. Add SOL and try again.');
  assert.ok(f.details.includes('insufficient lamports 1230020, need 1488440'));
  // Without our estimate: balance + shortfall + fee + buffer.
  const g = friendlyTxError(e, { balanceLamports: 1_240_110 });
  assert.equal(g.message, 'You need about 0.0026 SOL for this. You have 0.00124. Add SOL and try again.'); // 0.00250353 rounded up
  assert.doesNotMatch(g.message, /\{|0x|Program|11111111/);
});

test('insufficient funds for rent / fee', () => {
  assert.equal(friendlyTxError(sim([], { InsufficientFundsForRent: { account_index: 0 } }), { balanceLamports: 500_000, neededLamports: 2_000_000 }).kind, 'insufficient-sol');
  assert.equal(friendlyTxError(new TxError('Simulation failed: "AccountNotFound"', 'simulate', { err: 'AccountNotFound' })).message, 'You need more SOL for this. Add SOL and try again.');
});

test('insufficient token balance', () => {
  const f = friendlyTxError(sim(['Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [3]', 'Program log: Error: insufficient funds']), { symbol: 'NVDAx' });
  assert.equal(f.message, 'Not enough NVDAx in your wallet.');
});

test('cancelled in the wallet', () => {
  const walletErr = Object.assign(new Error('User rejected the request.'), { name: 'WalletSendTransactionError' });
  assert.equal(friendlyTxError(new TxError(walletErr.message, 'wallet', { cause: walletErr })).message, 'You cancelled in your wallet. Nothing was sent.');
  assert.equal(friendlyTxError(Object.assign(new Error('x'), { code: 4001 })).kind, 'cancelled');
  // Adapters nest the real error: WalletSendTransactionError('') -> WalletSignTransactionError -> { code 4001 }.
  const inner = Object.assign(new Error('User rejected the request.'), { code: 4001 });
  const sign = Object.assign(new Error(''), { name: 'WalletSignTransactionError', error: inner });
  const send = Object.assign(new Error(''), { name: 'WalletSendTransactionError', error: sign });
  const f = friendlyTxError(new TxError('', 'wallet', { cause: send, err: sign }));
  assert.equal(f.kind, 'cancelled');
  assert.match(f.details, /cause: Error: User rejected the request\. \(code 4001\)/);
});

test('slippage (DBC, Jupiter, on-chain code)', () => {
  const msg = 'The price moved before your trade landed. Try again, or raise slippage.';
  assert.equal(friendlyTxError(sim(['Program log: AnchorError occurred. Error Code: ExceededSlippage. Error Number: 6002. Error Message: Exceeded slippage tolerance.'])).message, msg);
  assert.equal(friendlyTxError(sim(['Program log: Error: SlippageToleranceExceeded'])).message, msg);
  assert.equal(friendlyTxError(new TxError('Transaction failed', 'onchain', { err: { InstructionError: [3, { Custom: 6002 }] } })).message, msg);
});

test('expired blockhash / not confirmed in time', () => {
  const msg = 'The network was slow and the transaction expired. Nothing was charged. Try again.';
  assert.equal(friendlyTxError(new TxError('Transaction abc expired before it confirmed.', 'expired', { signature: 'abc' })).message, msg);
  assert.equal(friendlyTxError(sim([], 'BlockhashNotFound')).message, msg);
  assert.equal(friendlyTxError(new Error('TransactionExpiredBlockheightExceededError: block height exceeded')).message, msg);
});

test('rate limits and network errors', () => {
  const msg = 'Network busy, try again in a few seconds.';
  assert.equal(friendlyTxError(new Error('429 Too Many Requests: {"error":"Too many requests, try again in 30 s"}')).message, msg);
  assert.equal(friendlyTxError(new Error('Jupiter is busy right now (rate limited). Try again in a few seconds.')).message, msg);
  assert.equal(friendlyTxError(new TypeError('Failed to fetch')).message, msg);
  // A number inside logs is not a 503.
  assert.notEqual(friendlyTxError(sim(['Program X consumed 50300 of 200000 compute units'], 'Weird')).kind, 'busy');
});

test('paused or frozen stock token', () => {
  const msg = 'Trading in this stock token is paused by its issuer right now.';
  assert.equal(friendlyTxError(sim(['Program log: Error: Transferring, minting, and burning is paused on this mint'])).message, msg);
  assert.equal(friendlyTxError(sim(['Program log: Error: Account is frozen'])).message, msg);
});

test('anything else: only promise "nothing charged" when nothing could have been', () => {
  assert.equal(friendlyTxError(sim(['Program log: something odd'], 'Weird')).message, 'Something went wrong. Nothing was charged.');
  assert.equal(friendlyTxError(new Error('Jupiter: route not found')).message, 'Something went wrong. Nothing was charged.');
  assert.equal(friendlyTxError(new TxError('Transaction failed', 'onchain', { err: { InstructionError: [1, { Custom: 9999 }] } })).message, 'Something went wrong. Nothing was charged.');
  assert.equal(friendlyTxError(new TxError('Unexpected wallet error', 'wallet')).message, 'Something went wrong. Check your wallet for details.');
  assert.match(friendlyTxError(new TxError('Still waiting', 'pending', { signature: 's' })).message, /Check your wallet for details\.$/);
});

test('people-facing messages pass through; notes are appended', () => {
  assert.equal(friendlyTxError(new UserError('Ticker is required')).message, 'Ticker is required');
  assert.equal(friendlyTxError(sim(['Program log: Error: SlippageToleranceExceeded']), { note: 'Your NVDAx is in your wallet.' }).message, 'The price moved before your trade landed. Try again, or raise slippage. Your NVDAx is in your wallet.');
});

test('launch cost matches the real HGTEST launch', () => {
  const cost = launchCostLamports({ perByte: PER_BYTE, name: 'Hatch Genesis Test', symbol: 'HGTEST', stockQuote: true });
  const priority = Math.ceil((PRIORITY_FEE_MICROLAMPORTS * CU_LIMIT.launch) / 1e6);
  assert.equal(cost - 10_000 - priority, 2_946_400 + 1_488_440 + 2_804_160 + 1_539_240); // rent of the 4 accounts it created
  assert.equal(rentFor(PER_BYTE, ACCOUNT_SIZE.tokenAccount), 1_488_440);
  const buy = buyCostLamports({ perByte: PER_BYTE, solIn: 100_000_000, needsBaseAccount: true, spendsSol: true, payWithSol: false, needsQuoteAccount: false });
  assert.ok(buy > 100_000_000 + rentFor(PER_BYTE, 170) + rentFor(PER_BYTE, 165));
  assert.equal(formatSol(9_200_000), '0.0092');
  assert.equal(formatSol(1_230_020), '0.00123');
  assert.equal(formatSolNeed(8_798_420), '0.0088');
  assert.equal(formatSolNeed(9_788_330), '0.0098');
  assert.equal(formatSolNeed(1_200_000_000), '1.2');
  assert.equal(formatSolNeed(12_340_000), '0.013');
});
