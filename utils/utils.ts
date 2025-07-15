import { PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import fs from 'fs';
import { solanaConnection } from '../constants';
import DLMM from '@meteora-ag/dlmm';
import { CpAmm, getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk';

dotenv.config();


export const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export const getDlmmPrice = async (poolId: string) => {
  try {
    const USDC_USDT_POOL = new PublicKey(poolId)
    const dlmmPool = await DLMM.create(solanaConnection, USDC_USDT_POOL);

    const activeBin = await dlmmPool.getActiveBin();
    const activeBinPricePerToken = dlmmPool.fromPricePerLamport(
      Number(activeBin.price)
    );
    return activeBinPricePerToken
  } catch (err) {
    return 0
  }

}


export const getDammV2Price = async (poolId: string) => {
  try {
    const USDC_USDT_POOL = new PublicKey(poolId)
    const cpAmm = new CpAmm(solanaConnection);

    const poolState = await cpAmm.fetchPoolState(USDC_USDT_POOL);
    const price = getPriceFromSqrtPrice(
      poolState.sqrtPrice,
      6,  // USDC has 6 decimals
      9   // SOL has 9 decimals
    );
    let tokenPrice = Number(price).toFixed(15)
    return tokenPrice
  } catch (err) {
    return 0
  }

}


