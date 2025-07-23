import { ComputeBudgetProgram, Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { Program } from "@coral-xyz/anchor";
import { PumpSwap } from "../../contract/pumpswap";
import { PumpSwapProgram } from "../../contract";
import bs58 from 'bs58';
import { PrivateKey, wallet } from "../../constants";
import { TradeParams, TradeResult } from './types';

export class TradingPair {
  private pool: PublicKey;
  private tokenMint: PublicKey;
  private mainKp: Keypair;
  private connection: Connection;
  private solPerWallet: number;

  constructor(
    connection: Connection,
    mainKp: Keypair,
    pool: PublicKey,
    tokenMint: PublicKey,
    solPerWallet: number
  ) {
    // this.pool = pool;
    this.tokenMint = tokenMint;
    this.pool = pool;
    this.mainKp = mainKp;
    this.connection = connection;
    this.solPerWallet = solPerWallet;
  }

  async runTrades(percent: number) {


    let retry = 0
    while (retry < 3) {
      const result = await buyPumpswapToken(this.connection, this.tokenMint, this.pool, wallet, new BN(this.solPerWallet * 10 ** 9), new BN(0), PumpSwapProgram, NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID)
      if (result === null) {
        console.log("Buy failed")
        retry++
      } else {
        break
      }
    }

    while (retry < 3) {
      const result = await sellPumpswapTokenBySDK(this.connection, wallet, this.tokenMint, this.pool, this.solPerWallet, percent, true, new BN(0), NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID)
      if (result === null) {
        console.log("Buy failed")
        retry++
      } else {
        break
      }
    }


  }
}

export const buyPumpswapToken = async (
  connection: Connection,
  token: PublicKey,
  poolAddress: PublicKey,
  buyerKp: Keypair,
  buyAmount: BN,
  maxQuoteIn: BN,
  PumpProgram: Program<PumpSwap>,
  quoteToken: PublicKey = NATIVE_MINT,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
  quoteTokenProgram: PublicKey = TOKEN_PROGRAM_ID
): Promise<string | null> => {
  try {
    const tokenAta = getAssociatedTokenAddressSync(token, buyerKp.publicKey)
    const quoteAta = getAssociatedTokenAddressSync(quoteToken, buyerKp.publicKey)
    const buyTx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
      createAssociatedTokenAccountIdempotentInstruction(
        buyerKp.publicKey,
        tokenAta,
        buyerKp.publicKey,
        token,
        tokenProgram
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        buyerKp.publicKey,
        quoteAta,
        buyerKp.publicKey,
        quoteToken,
        quoteTokenProgram
      ),
      SystemProgram.transfer({
        fromPubkey: buyerKp.publicKey,
        toPubkey: quoteAta,
        lamports: buyAmount.toNumber()
      }),
      createSyncNativeInstruction(quoteAta, quoteTokenProgram),
      await PumpProgram.methods
        .buy(buyAmount, maxQuoteIn)
        .accounts({
          user: buyerKp.publicKey,
          userBaseTokenAccount: tokenAta,
          userQuoteTokenAccount: quoteAta,
          baseTokenProgram: tokenProgram,
          quoteTokenProgram: quoteTokenProgram,
          globalConfig: GLOBAL_CONFIG,
          pool: poolAddress,
          program: PUMP_AMM_PROGRAM_ID,
          protocolFeeRecipient: PROTOCOL_FEE_RECIPIENT
        })
        .instruction(),
      createCloseAccountInstruction(quoteAta, buyerKp.publicKey, buyerKp.publicKey)
    )

    const blockhash = await connection.getLatestBlockhash()
    buyTx.recentBlockhash = blockhash.blockhash
    buyTx.feePayer = buyerKp.publicKey
    console.log(await connection.simulateTransaction(buyTx))
    const sig = await sendAndConfirmTransaction(connection, buyTx, [buyerKp])
    console.log(`Buy transaction signature: https://solscan.io/tx/${sig}`)
    return sig
  } catch (error) {
    console.log("Buy transaction failed", error)
    return null
  }
}

export const sellPumpswapTokenBySDK = async (
  connection: Connection,
  sellerKp: Keypair,
  token: PublicKey,
  poolAddress: PublicKey,
  solAmount: number,
  profitPercent: number,
  sellAll: boolean = true,
  sellTokenAmount: BN = new BN(0),
  quoteToken: PublicKey = NATIVE_MINT,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
  quoteTokenProgram: PublicKey = TOKEN_PROGRAM_ID
) => {
  try {
    const minQuoteOut: BN = new BN(solAmount * (1 + profitPercent / 100) * 10 ** 9)
    const tokenAta = getAssociatedTokenAddressSync(token, sellerKp.publicKey)
    const tokenBalance = await connection.getTokenAccountBalance(tokenAta)
    const amount = sellAll ? new BN(tokenBalance.value.amount) : sellTokenAmount
    const quoteAta = getAssociatedTokenAddressSync(quoteToken, sellerKp.publicKey)

    const instructions = [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 175_000 }),
      createAssociatedTokenAccountIdempotentInstruction(
        sellerKp.publicKey,
        quoteAta,
        sellerKp.publicKey,
        quoteToken,
        quoteTokenProgram
      ),
      await PumpSwapProgram.methods
        .sell(new BN(amount), minQuoteOut)
        .accounts({
          user: sellerKp.publicKey,
          userBaseTokenAccount: tokenAta,
          userQuoteTokenAccount: quoteAta,
          baseTokenProgram: tokenProgram,
          quoteTokenProgram: quoteTokenProgram,
          globalConfig: GLOBAL_CONFIG,
          pool: poolAddress,
          program: PUMP_AMM_PROGRAM_ID,
          protocolFeeRecipient: PROTOCOL_FEE_RECIPIENT,

        })
        .instruction(),
      createCloseAccountInstruction(quoteAta, sellerKp.publicKey, sellerKp.publicKey),
    ]

    if (sellAll)
      instructions.push(createCloseAccountInstruction(tokenAta, sellerKp.publicKey, sellerKp.publicKey))

    const latestBlockhash = await connection.getLatestBlockhash()
    const messageV0 = new TransactionMessage({
      payerKey: sellerKp.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions,
    }).compileToV0Message()
    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([sellerKp])
    // const bundleId = await sendBundle([transaction])

    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false })
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      }
    );

    if (confirmation.value.err) {
      console.log("Confirmtaion error")
      return ""
    } else {
      console.log(`Success in sell transaction: https://solscan.io/tx/${signature}`)
      return signature
    }
  } catch (error) {
    console.log("Error while fetching sell transaction", error)
  }
}


export const buyPumpswapTokenBySDK = async (
  connection: Connection,
  buyerKp: Keypair,
  token: PublicKey,
  poolAddress: PublicKey,
  solAmount: number,
  profitPercent: number,
  sellAll: boolean = true,
  buyTokenAmount: BN = new BN(0),
  quoteToken: PublicKey = NATIVE_MINT,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
  quoteTokenProgram: PublicKey = TOKEN_PROGRAM_ID
) => {
  try {
    const minQuoteOut: BN = new BN(solAmount * (1 + profitPercent / 100) * 10 ** 9)
    const tokenAta = getAssociatedTokenAddressSync(token, buyerKp.publicKey)
    const tokenBalance = await connection.getTokenAccountBalance(tokenAta)
    const amount = buyTokenAmount
    const quoteAta = getAssociatedTokenAddressSync(quoteToken, buyerKp.publicKey)

    const instructions = [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 175_000 }),
      createAssociatedTokenAccountIdempotentInstruction(
        buyerKp.publicKey,
        quoteAta,
        buyerKp.publicKey,
        quoteToken,
        quoteTokenProgram
      ),
      await PumpSwapProgram.methods
        .buy(new BN(amount), minQuoteOut)
        .accounts({
          user: buyerKp.publicKey,
          userBaseTokenAccount: tokenAta,
          userQuoteTokenAccount: quoteAta,
          baseTokenProgram: tokenProgram,
          quoteTokenProgram: quoteTokenProgram,
          globalConfig: GLOBAL_CONFIG,
          pool: poolAddress,
          program: PUMP_AMM_PROGRAM_ID,
          protocolFeeRecipient: PROTOCOL_FEE_RECIPIENT,

        })
        .instruction(),
      createCloseAccountInstruction(quoteAta, buyerKp.publicKey, buyerKp.publicKey),
    ]

    if (sellAll)
      instructions.push(createCloseAccountInstruction(tokenAta, buyerKp.publicKey, buyerKp.publicKey))

    const latestBlockhash = await connection.getLatestBlockhash()
    const messageV0 = new TransactionMessage({
      payerKey: buyerKp.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions,
    }).compileToV0Message()
    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([buyerKp])
    // const bundleId = await sendBundle([transaction])

    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false })
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      }
    );

    if (confirmation.value.err) {
      console.log("Confirmtaion error")
      return ""
    } else {
      console.log(`Success in sell transaction: https://solscan.io/tx/${signature}`)
      return signature
    }
  } catch (error) {
    console.log("Error while fetching sell transaction", error)
  }
}


export const pumpSwapTrade = async (params: TradeParams): Promise<TradeResult> => {
  if (!params.connection) {
    return { success: false, error: 'Connection is required for pumpSwapTrade' };
  }
  try {
    // For simplicity, treat inputMint == NATIVE_MINT as buy, else sell
    const isBuy = params.inputMint.equals(NATIVE_MINT);
    if (isBuy) {
      const sig = await buyPumpswapToken(
        params.connection,
        params.outputMint,
        params.pool,
        params.user,
        params.amount,
        new BN(0),
        PumpSwapProgram,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID
      );
      if (sig) return { success: true, txid: sig };
      return { success: false, error: 'Buy failed' };
    } else {
      const sig = await sellPumpswapTokenBySDK(
        params.connection,
        params.user,
        params.inputMint,
        params.pool,
        params.amount.toNumber() / 1e9,
        params.slippage,
        true,
        new BN(0),
        NATIVE_MINT,
        TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID
      );
      if (sig) return { success: true, txid: sig };
      return { success: false, error: 'Sell failed' };
    }
  } catch (error) {
    return { success: false, error };
  }
};

const PUMP_AMM_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA")
const GLOBAL_CONFIG = new PublicKey("ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw")
const PROTOCOL_FEE_RECIPIENT = new PublicKey("G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP")