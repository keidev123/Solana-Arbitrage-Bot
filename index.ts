import { Keypair, Connection} from "@solana/web3.js"
import base58 from "bs58"

import { PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "./constants"
import { Pumpswap } from "./src/dex/pumpswap"
import { PumpSwapProgram } from "./contract/pumpswap"

export const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "confirmed"
})
export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const main = async () => {
  const pumpswapDex = new Pumpswap(connection, PumpSwapProgram, 200, 5)
  pumpswapDex.fetchTransactions()

  setTimeout(async () => {
    const trendingPair = await pumpswapDex.filterTrendingPairs()
    console.log("trending pair number fetched by trading volume ranking ", pumpswapDex.getTrendingPairs().size)
    const miagratedPairs = await pumpswapDex.filterMigratedToken()
    console.log("pumpfun miagrated token pairs:", miagratedPairs.size)
    const targetPairs = await pumpswapDex.filterByHistoryForTargetToken();
    console.log("target pairs number fetched by history", targetPairs.size)
    
    console.log("TARGET PAIRS:", targetPairs)
  }, 10000)



}



main()
