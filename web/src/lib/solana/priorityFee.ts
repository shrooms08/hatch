import { ComputeBudgetProgram, Transaction } from '@solana/web3.js';
import { PRIORITY_FEE_MICROLAMPORTS } from '@/lib/config/network';

const SET_CU_LIMIT = 2;
const SET_CU_PRICE = 3;

function hasComputeBudgetIx(tx: Transaction, discriminator: number) {
  return tx.instructions.some(
    (ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === discriminator
  );
}

/**
 * Prepends a compute-unit price (priority fee) and, optionally, a compute-unit limit,
 * unless the transaction already sets them.
 */
export function addPriorityFee(tx: Transaction, computeUnitLimit?: number): Transaction {
  if (computeUnitLimit && !hasComputeBudgetIx(tx, SET_CU_LIMIT)) {
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }));
  }
  if (PRIORITY_FEE_MICROLAMPORTS > 0 && !hasComputeBudgetIx(tx, SET_CU_PRICE)) {
    tx.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS })
    );
  }
  return tx;
}
