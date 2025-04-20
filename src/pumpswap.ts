import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AnchorProvider, BN, Program, setProvider } from '@coral-xyz/anchor'
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import base58 from 'bs58'

import { PRIVATE_KEY,  RPC_ENDPOINT,  RPC_WEBSOCKET_ENDPOINT } from '../constants'
import PumpswapIDL from '../contract/pumpswap.json'
import PumpfunIDL from '../contract/pump-fun.json'
import { PumpSwap } from '../contract/pumpswap'
import { PumpFun } from '../contract/pump-fun'

export const PUMP_AMM_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA")
export const GLOBAL_CONFIG = new PublicKey("ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw")
export const PROTOCOL_FEE_RECIPIENT = new PublicKey("G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP")

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "processed"
})
export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const provider = new AnchorProvider(solanaConnection, new NodeWallet(Keypair.generate()))
setProvider(provider);

export const PumpswapProgram = new Program<PumpSwap>(PumpswapIDL as PumpSwap, provider);
export const PumpfunProgram = new Program<PumpFun>(PumpfunIDL as PumpFun, provider);

export const fetchPools = async () => {

  const launchListenerId = PumpswapProgram.addEventListener("createPoolEvent", (event, slot, signature) => {

    const {creator, baseMint, quoteMint, baseAmountIn, quoteAmountIn, timestamp, lpMint, pool} = event
    console.log("\n\n================ New Pool Created ================")
    console.log(`Pool creation signature: https://solscan.io/tx/${signature}`)
    console.log("Creator:", creator.toBase58())
    console.log("Pool ID:", pool.toBase58())
    console.log("BaseMint:", baseMint.toBase58())
    console.log("QuoteMint:", quoteMint.toBase58())
    console.log("BaseAmountIn:", baseAmountIn.toString())
    console.log("QuoteAmountIn:", quoteAmountIn.toString())
    console.log("Timestamp:", new Date(timestamp.toNumber()))
    console.log("Lp Mint:", lpMint.toBase58())
    console.log("===================================================\n\n")
    
  })

  const migrateListener = PumpfunProgram.addEventListener("completePumpAmmMigrationEvent", (event, slot, signature) => {
    const {creator, timestamp, pool, bondingCurve, mint} = event
    
    console.log("\n\n================ Migration event fetched ================")
    console.log(`Pool creation signature: https://solscan.io/tx/${signature}`)
    console.log("Creator: ", creator?.toBase58())
    console.log("Pool: ", pool?.toBase58())
    console.log("BondingCurve: ", bondingCurve.toBase58())
    console.log("Timestamp:", new Date(timestamp.toNumber()))
    console.log("===================================================\n\n")
  })
  

  const completeListener = PumpfunProgram.addEventListener("completeEvent", (event, slot, signature) => {
    const {user, timestamp, bondingCurve, mint} = event
    
    console.log("\n\n================ Migration event fetched ================")
    console.log(`Pool creation signature: https://solscan.io/tx/${signature}`)
    console.log("User: ", user?.toBase58())
    console.log("Mint: ", mint.toBase58())
    console.log("BondingCurve: ", bondingCurve.toBase58())
    console.log("Timestamp:", new Date(timestamp.toNumber()))
    console.log("===================================================\n\n")
  })
  
  console.log("Listener is running")
}

export const buy = async (
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

export const sell = async (
  connection: Connection,
  token: PublicKey,
  poolAddress: PublicKey,
  sellerKp: Keypair,
  sellTokenAmount: BN,
  minQuoteOut: BN,
  PumpProgram: Program<PumpSwap>,
  sellAll: boolean = false,
  quoteToken: PublicKey = NATIVE_MINT,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
  quoteTokenProgram: PublicKey = TOKEN_PROGRAM_ID
) => {
  const tokenAta = getAssociatedTokenAddressSync(token, sellerKp.publicKey)
  const tokenBalance = await connection.getTokenAccountBalance(tokenAta)
  const amount = sellAll ? new BN(tokenBalance.value.amount) : sellTokenAmount
  const quoteAta = getAssociatedTokenAddressSync(quoteToken, sellerKp.publicKey)

  const sellTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      sellerKp.publicKey,
      quoteAta,
      sellerKp.publicKey,
      quoteToken,
      quoteTokenProgram
    ),
    await PumpProgram.methods
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
        protocolFeeRecipient: PROTOCOL_FEE_RECIPIENT
      })
      .instruction(),
    createCloseAccountInstruction(quoteAta, sellerKp.publicKey, sellerKp.publicKey)
  )

  if (sellAll)
    sellTx.add(
      createCloseAccountInstruction(tokenAta, sellerKp.publicKey, sellerKp.publicKey)
    )

  const blockhash = await connection.getLatestBlockhash()
  sellTx.recentBlockhash = blockhash.blockhash
  sellTx.feePayer = sellerKp.publicKey
  console.log(await connection.simulateTransaction(sellTx))
  const sig = await sendAndConfirmTransaction(connection, sellTx, [sellerKp])
  console.log(`Sell transaction signature: https://solscan.io/tx/${sig}`)
}

export const getPoolsWithBaseMintQuoteWSOL = async (connection: Connection, baseMint: PublicKey, quoteMint: PublicKey, program: Program<PumpSwap>) => {
  const response = await connection.getProgramAccounts(PUMP_AMM_PROGRAM_ID, {
    filters: [
      { "dataSize": 211 },
      {
        "memcmp": {
          "offset": 43,
          "bytes": baseMint.toBase58()
        }
      },
      {
        "memcmp": {
          "offset": 75,
          "bytes": quoteMint.toBase58()
        }
      }
    ]
  }
  )

  const mappedPools = response.map((pool) => {
    const data = Buffer.from(pool.account.data);
    const poolData = program.coder.accounts.decode('pool', data);
    return {
      address: pool.pubkey,
      is_native_base: true,
      poolData
    };
  })
  return mappedPools
}
