import { TradeParams, TradeResult } from './types';

import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import { solanaConnection } from '../../constants';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

export const dammTrade = async (params: TradeParams): Promise<TradeResult> => {
  try {
    const cpAmm = new CpAmm(solanaConnection);
    const poolState = await cpAmm.fetchPoolState(params.pool);
    const currentSlot = await solanaConnection.getSlot();
    const blockTime = await solanaConnection.getBlockTime(currentSlot);
    const quote = await cpAmm.getQuote({
      inAmount: params.amount,
      inputTokenMint: params.inputMint,
      slippage: params.slippage,
      poolState,
      currentTime: blockTime ?? 0,
      currentSlot
    });
    const swapTx = await cpAmm.swap({
      payer: params.user.publicKey,
      pool: params.pool,
      inputTokenMint: poolState.tokenAMint,
      outputTokenMint: poolState.tokenBMint,
      amountIn: params.amount,
      minimumAmountOut: quote.minSwapOutAmount,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
      referralTokenAccount: null
    });
    // You may want to send/confirm the transaction here if needed
    let txid: string | undefined = undefined;
    if (swapTx?.signature) {
      if (typeof swapTx.signature === 'string') {
        txid = swapTx.signature;
      } else if (Buffer.isBuffer(swapTx.signature)) {
        txid = bs58.encode(swapTx.signature);
      }
    }
    return { success: true, txid };
  } catch (error) {
    return { success: false, error };
  }
};
