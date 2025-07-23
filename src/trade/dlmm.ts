import DLMM from "@meteora-ag/dlmm";
import { NATIVE_MINT } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { solanaConnection } from "../../constants";
import { sendAndConfirmTransaction } from "@solana/web3.js";

// Unified trade interface
import { TradeParams, TradeResult } from './types';

export const dlmmTrade = async (params: TradeParams): Promise<TradeResult> => {
  try {
    const dlmmPool = await DLMM.create(solanaConnection, params.pool);
    let swapYtoX = params.inputMint.equals(NATIVE_MINT);
    const binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);
    const swapQuote = dlmmPool.swapQuote(params.amount, swapYtoX, new BN(params.slippage), binArrays);
    const swapTransaction = await dlmmPool.swap({
      inToken: params.inputMint,
      outToken: params.outputMint,
      binArraysPubkey: swapQuote.binArraysPubkey,
      inAmount: params.amount,
      lbPair: dlmmPool.pubkey,
      user: params.user.publicKey,
      minOutAmount: swapYtoX ? swapQuote.minOutAmount : new BN(0),
    });
    swapTransaction.feePayer = params.user.publicKey;
    swapTransaction.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash;
    swapTransaction.lastValidBlockHeight = (await solanaConnection.getLatestBlockhash()).lastValidBlockHeight;
    await solanaConnection.simulateTransaction(swapTransaction);
    const sig = await sendAndConfirmTransaction(solanaConnection, swapTransaction, [params.user]);
    return { success: true, txid: sig };
  } catch (error) {
    return { success: false, error };
  }
};