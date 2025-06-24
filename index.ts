import { Keypair, Connection, Commitment, LAMPORTS_PER_SOL, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js"
import base58 from "bs58"

import { PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "./constants"
import { getVolume } from "./src/photon"
import { DEX } from "./src/dex/pumpswap"
import { PumpSwapProgram } from "./contract/pumpswap"

export const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "confirmed"
})
export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))



const main = async () => {
  const pumpswapDex = new DEX(connection, PumpSwapProgram)
  pumpswapDex.fetchTransactions()

  setInterval(() => {
    console.log(pumpswapDex.getAllTrades())
    console.log(pumpswapDex.getAllTrades().size, "pairs")
  }, 5000)
  


}




main()
