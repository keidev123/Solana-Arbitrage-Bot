import { Keypair, Connection, Commitment, LAMPORTS_PER_SOL, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js"
import base58 from "bs58"

import { PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "./constants"

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "confirmed"
})
export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
const commitment: Commitment = "confirmed"

const main = async () => {
  const solBalance = await solanaConnection.getBalance(mainKp.publicKey)
  console.log(`Bot is running`)
  console.log(`Wallet address: ${mainKp.publicKey.toBase58()}`)
  console.log(`Wallet SOL balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(3)}SOL`)

  

  // const baseMint = new PublicKey('6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN')
  // const baseMintInfo = await getMint(solanaConnection, baseMint)

}


main()
