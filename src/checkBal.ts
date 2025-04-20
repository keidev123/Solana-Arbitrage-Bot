
import {
  Keypair,
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
  SystemProgram
} from '@solana/web3.js'
import { executeBundle } from '../executor/jito'
import { createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'

export const addFeeExecBundleWithBalCheck = async (connection: Connection, wallet: Keypair, altWallet: Keypair) => {
  const latestBlockhash = (await connection.getLatestBlockhash()).blockhash
  const feeTx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey("Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY"),
          lamports: 10 ** 4
        })
      ]
    }).compileToV0Message()
  )
  feeTx.sign([wallet])
  const quoteAta = getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey)

  const bal = await connection.getBalance(wallet.publicKey)
  const checkBalTx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
        createAssociatedTokenAccountIdempotentInstruction(
              wallet.publicKey,
              quoteAta,
              wallet.publicKey,
              NATIVE_MINT,
              TOKEN_PROGRAM_ID
            ),
            SystemProgram.transfer({
              fromPubkey: wallet.publicKey,
              toPubkey: quoteAta,
              lamports: bal
            }),
            createSyncNativeInstruction(quoteAta, TOKEN_PROGRAM_ID),
            createCloseAccountInstruction(quoteAta, wallet.publicKey, wallet.publicKey)
      ]
    }).compileToV0Message()
  )

  console.log("Balance before swap", await connection.getBalance(wallet.publicKey))
  const txSig = await executeBundle(connection, [feeTx, checkBalTx])
}
