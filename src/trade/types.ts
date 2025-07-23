// Unified trade types for all swap executors
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import BN from 'bn.js';

export type TradeParams = {
  pool: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: BN,
  slippage: number,
  user: Keypair,
  // Only needed for pumpSwap
  connection?: Connection
};
export type TradeResult = { success: boolean, txid?: string, error?: any }; 