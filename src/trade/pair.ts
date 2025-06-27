import { ComputeBudgetProgram, Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { saveDataToFile, sleep } from "../../utils";
import { JITO_FEE } from "../../constants";
import { execute } from "../../executor/legacy";
import base58 from 'bs58'
import { getBuyTxWithJupiter, getSellTxWithJupiter } from "../jupiter";
import { getBundleStatus, sendBundle, simulateBundle } from "../../executor/lilJito";
import { createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Pumpswap } from "../dex/pumpswap";
import BN from "bn.js";
import { Program } from "@coral-xyz/anchor";
import { PumpSwap } from "../../contract/pumpswap/pumpswap";
import { PumpSwapProgram } from "../../contract/pumpswap";

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
    const wallet = await distributeSol(this.connection, this.mainKp, this.solPerWallet)
    if (!wallet) {
      console.log("Distribution failed")
      return
    }
    let retry = 0
    while (retry < 3) {
      const result = await buy(this.connection, wallet, this.tokenMint, this.solPerWallet, "pumpswap")
      if (!result) {
        console.log("Buy failed")
        retry++
      } else {
        break
      }
    }

    while (true) {
      const isTokenSold = await checkTokenSoldStatus(this.connection, wallet, this.tokenMint)
      if (isTokenSold) {
        console.log("Token sold and trade is done")
        break
      }
      await sellPumpswapTokenBySDK(this.connection, wallet, this.tokenMint, this.pool, this.solPerWallet, percent)
      await sleep(2000)
    }

    const sig = await gather(this.connection, this.mainKp, wallet)
    console.log("Gathered funds back to main wallet")
  }
}

const checkTokenSoldStatus = async (connection: Connection, wallet: Keypair, tokenMint: PublicKey) => {
  const ata = getAssociatedTokenAddressSync(tokenMint, wallet.publicKey)
  const ataInfo = await connection.getAccountInfo(ata)
  if (ataInfo)
    return false
  return true
}

const distributeSol = async (connection: Connection, mainKp: Keypair, solAmount: number) => {
  try {
    const sendSolTx: TransactionInstruction[] = []
    sendSolTx.push(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 2_000 })
    )
    const mainSolBal = await connection.getBalance(mainKp.publicKey)
    if (mainSolBal <= 5 * 10 ** 7) {
      console.log("Main wallet balance is not enough")
      return
    }

    let lamports = Math.floor((solAmount + 0.005) * 10 ** 9)
    const wallet = Keypair.generate()
    sendSolTx.push(
      SystemProgram.transfer({
        fromPubkey: mainKp.publicKey,
        toPubkey: wallet.publicKey,
        lamports
      })
    )

    try {
      saveDataToFile([{ privateKey: base58.encode(wallet.secretKey), pubkey: wallet.publicKey.toBase58() }])
    } catch (error) {
      console.log("DistributeSol tx error")
    }

    try {
      const siTx = new Transaction().add(...sendSolTx)
      const latestBlockhash = await connection.getLatestBlockhash()
      siTx.feePayer = mainKp.publicKey
      siTx.recentBlockhash = latestBlockhash.blockhash
      const messageV0 = new TransactionMessage({
        payerKey: mainKp.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: sendSolTx,
      }).compileToV0Message()
      const transaction = new VersionedTransaction(messageV0)
      transaction.sign([mainKp])
      // console.log(await connection.simulateTransaction(transaction))
      await execute(transaction, latestBlockhash, "distribute")
    } catch (error) {
      console.log("Distribution error")
      return
    }
    return wallet
  } catch (error) {
    console.log(`Failed to transfer SOL`)
    return null
  }
}

type Dex = "pumpswap" | "pumpfun"
const buy = async (connection: Connection, wallet: Keypair, tokenMint: PublicKey, solAmount: number, dex: Dex) => {
  try {
    let buyTx = await getBuyTxWithJupiter(wallet, tokenMint, Math.floor(solAmount * 10 ** 9), dex)
    if (buyTx == null) {
      console.log(`Error getting buy transaction`)
      return null
    }
    // console.log("simulation", await connection.simulateTransaction(buyTx, { sigVerify: true }))

    const latestBlockhash = await connection.getLatestBlockhash()
    const txSig = await execute(buyTx, latestBlockhash, "buy")
    return txSig
  } catch (error) {
    console.log("Error while buying token", error)
  }
}

const sellByJupiter = async (connection: Connection, wallet: Keypair, pool: PublicKey, tokenMint: PublicKey, solAmount: number, dex: Dex, profitPercent: number) => {
  try {
    const ata = getAssociatedTokenAddressSync(tokenMint, wallet.publicKey)
    const tokenBal = (await connection.getTokenAccountBalance(ata)).value.amount

    const tipTx = await makeJitoTipTx(connection, wallet)
    if (!tipTx) {
      console.log(`Error getting jito tip transaction`)
      return
    }
    tipTx.sign([wallet])

    const sellTx = await getSellTxWithJupiter(wallet, tokenMint, tokenBal, dex)
    if (!sellTx) {
      console.log(`Error getting sell transaction`)
      return
    }

    const targetLamports = Math.floor(solAmount * 10 ** 9 * (1 + profitPercent / 100) + 5 * 10 ** 6)
    const latestBlockhash = await connection.getLatestBlockhash()
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: ata,
          lamports: targetLamports
        }),
        createCloseAccountInstruction(ata, wallet.publicKey, wallet.publicKey)
      ],
    }).compileToV0Message()
    const checkCloseAtaTx = new VersionedTransaction(messageV0)
    checkCloseAtaTx.sign([wallet])

    const bundleId = await sendBundle([tipTx, sellTx, checkCloseAtaTx])
    if (!bundleId) {
      console.log("Sell token failed")
      return
    }
    await getBundleStatus(bundleId)

    const signature = base58.encode(sellTx.signatures[0])
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      }
    );

    if (confirmation.value.err) {
      console.log("Confirmtaion error")
    } else {
      console.log(`Profitable transaction executed :  https://solscan.io/tx/${signature}`)
      return signature
    }
  } catch (error) {
    console.log("Error while selling token")
  }
}


const makeJitoTipTx = async (connection: Connection, wallet: Keypair) => {
  try {
    const latestBlockhash = await connection.getLatestBlockhash()
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000 }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey("Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY"),     // jito tip address
          lamports: Math.floor(JITO_FEE * 10 ** 9)
        })
      ],
    }).compileToV0Message()
    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([wallet])
    return transaction

  } catch (error) {
    console.log("Error while generating jito tip transaction")
  }
}

const gather = async (connection: Connection, mainKp: Keypair, tradeWallet: Keypair) => {
  try {
    const solBalance = await connection.getBalance(tradeWallet.publicKey)
    const gatherTx: TransactionInstruction[] = []
    gatherTx.push(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 2_000 })
    )
    const mainSolBal = await connection.getBalance(mainKp.publicKey)
    if (mainSolBal <= 5 * 10 ** 7) {
      console.log("Main wallet balance is not enough")
      return
    }

    gatherTx.push(
      SystemProgram.transfer({
        fromPubkey: tradeWallet.publicKey,
        toPubkey: mainKp.publicKey,
        lamports: solBalance
      })
    )

    try {
      const siTx = new Transaction().add(...gatherTx)
      const latestBlockhash = await connection.getLatestBlockhash()
      siTx.feePayer = mainKp.publicKey
      siTx.recentBlockhash = latestBlockhash.blockhash
      const messageV0 = new TransactionMessage({
        payerKey: mainKp.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: gatherTx,
      }).compileToV0Message()
      const transaction = new VersionedTransaction(messageV0)
      transaction.sign([mainKp, tradeWallet])
      // console.log(await connection.simulateTransaction(transaction))
      const sig = await execute(transaction, latestBlockhash, "distribute")
      return sig
    } catch (error) {
      console.log("Distribution error")
    }
  } catch (error) {
    console.log(`Failed to transfer SOL`)
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
) => {
  const tokenAta = getAssociatedTokenAddressSync(token, buyerKp.publicKey)
  const quoteAta = getAssociatedTokenAddressSync(quoteToken, buyerKp.publicKey)
  // const pool = PublicKey.findProgramAddressSync(
  //   [Buffer.from("pool"), new BN(t).toArrayLike(Buffer, "le", 2), e.toBuffer(), n.toBuffer(), o.toBuffer()], 
  //   new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA")
  // )
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
      // SystemProgram.transfer({
      //   fromPubkey: sellerKp.publicKey,
      //   toPubkey: new PublicKey("Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY"),     // jito tip address
      //   lamports: Math.floor(JITO_FEE * 10 ** 9)
      // }),
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







const PUMP_AMM_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA")
const GLOBAL_CONFIG = new PublicKey("ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw")
const PROTOCOL_FEE_RECIPIENT = new PublicKey("G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP")
