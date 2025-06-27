import { Keypair, Connection} from "@solana/web3.js"
import base58 from "bs58"

import { PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "./constants"
import { Pumpswap } from "./src/dex/pumpswap"
import { PumpSwapProgram } from "./contract/pumpswap"
import { sellPumpswapTokenBySDK, TradingPair } from "./src/trade/pair"
import { PublicKey } from "@solana/web3.js"
import { readJson } from "./utils"

export const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "confirmed"
})
export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const main = async () => {
  // const pumpswapDex = new Pumpswap(connection, PumpSwapProgram, 200, 5)
  // pumpswapDex.fetchTransactions()

  // setTimeout(async () => {
  //   const trendingPair = await pumpswapDex.filterTrendingPairs()
  //   console.log("trending pair number fetched by trading volume ranking ", pumpswapDex.getTrendingPairs().size)
  //   const miagratedPairs = await pumpswapDex.filterMigratedToken()
  //   console.log("pumpfun miagrated token pairs:", miagratedPairs.size)
  //   const targetPairs = await pumpswapDex.filterByHistoryForTargetToken();
  //   console.log("target pairs number fetched by history", targetPairs.size)
    
  //   console.log("TARGET PAIRS:", targetPairs)
  // }, 60_000)

  const tokenMint = new PublicKey("4C1ETR4XK1Ys3JFhMz6At66kRrWLVvUFUSLLQmMwpump")
  const pool = new PublicKey("9jn88tz8q54dSgZdGnGBXTjYbPYBxAuUvhJPs5e37jSG")
  const pair = new TradingPair(connection, mainKp, pool, tokenMint, 0.1)
  pair.runTrades(5)

  // const walletData = readJson()
  // const wallet = Keypair.fromSecretKey(base58.decode(walletData[0].privateKey))
  // await sellPumpswapTokenBySDK(connection, wallet, tokenMint, pool, 0.01, 0)


}






main()
