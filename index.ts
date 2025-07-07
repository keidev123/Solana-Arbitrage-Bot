import { Keypair, Connection } from "@solana/web3.js"
import base58 from "bs58"

import { PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "./constants"
import { Pumpswap } from "./src/dex/pumpswap"
import { PumpSwapProgram } from "./contract/pumpswap"
import { sellPumpswapTokenBySDK, TradingPair } from "./src/trade/pair"
import { PublicKey } from "@solana/web3.js"
import { readJson } from "./utils"
import { streamNewTokens } from "./src/dex/pumpfun"

export const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "confirmed"
})
export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const getTargetPair = async () => {
  const pumpswapDex = new Pumpswap(connection, PumpSwapProgram, 200, 15)
  pumpswapDex.fetchTransactions()
  pumpswapDex.printTransactionNum()

  setInterval(async () => {
    const trendingPair = await pumpswapDex.filterTrendingPairs()
    console.log("trending pair number fetched by trading volume ranking ", pumpswapDex.getTrendingPairs().size)
    const miagratedPairs = await pumpswapDex.filterMigratedToken()
    console.log("pumpfun miagrated token pairs:", miagratedPairs.size)
    const targetPairs = await pumpswapDex.filterByHistoryForTargetToken();
    console.log("target pairs number fetched by history", targetPairs.size)

    console.log("TARGET PAIRS:", targetPairs)
  }, 10_000)
}
const runTrade = async () => {
  const tokenMint = new PublicKey("GqJK2CW5PJfTGkNs54dNxfd8MifHTc4M62L39oQ9Ca9z")
  const pool = new PublicKey("HzMg8mxYk92HCnY6KH9PhhqpJJBhBbTULWCFHyRwzdAb")
  const pair = new TradingPair(connection, mainKp, pool, tokenMint, 0.07)
  pair.runTrades(5)

  // const walletData = readJson()
  // const wallet = Keypair.fromSecretKey(base58.decode(walletData[0].privateKey))
  // await sellPumpswapTokenBySDK(connection, wallet, tokenMint, pool, 0.01, 0)
}






// getTargetPair()
// withGaser()
streamNewTokens()
// runTrade()
