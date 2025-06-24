import { BN, Program } from "@coral-xyz/anchor";
import { PumpSwap } from "../../contract/pumpswap/pumpswap";
import { PumpFun } from "../../contract/pumpfun/pumpfun";
import { PumpSwapProgram } from "../../contract/pumpswap";
import { Connection, PublicKey } from "@solana/web3.js";

type PumpswapTradesSum = {
  pool: PublicKey,
  baseAmountIn: BN,
  quoteAmountIn: BN,
  baseAmountOut: BN,
  quoteAmountOut: BN,
  tradeNum: number,
  startTime: BN,
};

type TrendingPair = {
  pool: PublicKey,
  tokenMint: PublicKey,
  buyVolume: BN,
  sellVolume: BN,
}

type DEXs = Program<PumpSwap> | Program<PumpFun>;

export class DEX {
  private allTrades: Set<PumpswapTradesSum>;
  private trendingPairs: Set<TrendingPair>;
  private targetPairs: Set<TrendingPair>;
  private volumeThreshold: number;
  private program: DEXs;
  private connection: Connection;

  constructor(connection: Connection, program: DEXs, number = 10000) {
    this.allTrades = new Set();
    this.trendingPairs = new Set();
    this.targetPairs = new Set();
    this.volumeThreshold = number; // Norm to identify target pairs
    this.program = program;
    this.connection = connection;
  }

  /** Fetch raw transactions from Pumpswap */
  async fetchTransactions(): Promise<void> {
    if (this.program.programId == PumpSwapProgram.programId) {

      // buy listener
      const buyListenerId = (this.program as Program<PumpSwap>).addEventListener('buyEvent', async (event, slot, signature) => {
        const { pool, baseAmountOut, quoteAmountIn, timestamp } = event

        const existing = Array.from(this.allTrades).find(
          (trade) => trade.pool.equals(pool)
        );
        if (existing) {
          this.allTrades.delete(existing);
          this.allTrades.add({
            ...existing,
            baseAmountOut: existing.baseAmountOut.add(baseAmountOut),
            quoteAmountIn: existing.quoteAmountIn.add(quoteAmountIn),
            tradeNum: existing.tradeNum + 1
          });
        } else {
          // Add new trade
          this.allTrades.add({
            pool,
            baseAmountIn: new BN(0),
            quoteAmountIn,
            baseAmountOut,
            quoteAmountOut: new BN(0),
            tradeNum: 0,
            startTime: timestamp,
          });
        }
        // this.program.removeEventListener(buyListenerId);
      })

      // sell listener
      const sellListenerId = (this.program as Program<PumpSwap>).addEventListener('sellEvent', async (event, slot, signature) => {
        const {pool, timestamp, baseAmountIn, quoteAmountOut} = event
        const existing = Array.from(this.allTrades).find(
          (trade) => trade.pool.equals(pool)
        );
        if (existing) {
          this.allTrades.delete(existing);
          this.allTrades.add({
            ...existing,
            baseAmountIn: existing.baseAmountIn.add(baseAmountIn),
            quoteAmountOut: existing.quoteAmountOut.add(quoteAmountOut),
            tradeNum: existing.tradeNum + 1
          });
        } else {
          // Add new trade
          this.allTrades.add({
            pool,
            baseAmountIn,
            quoteAmountIn: new BN(0),
            baseAmountOut: new BN(0),
            quoteAmountOut,
            tradeNum: 0,
            startTime: timestamp,
          });
        }
        // this.program.removeEventListener(sellListenerId);
      })

    }
  }

  /** Fetch price history for trending pairs */
  async fetchPriceHistory(pair: TrendingPair): Promise<number[]> {
    // TODO: implement price fetch logic (API, historical data, etc.)
    throw new Error(`fetchPriceHistory for ${pair} not implemented.`);
  }

  /** Determine and set target pairs based on custom criteria */
  async setTargetPairs(): Promise<void> {
    for (const pair of this.trendingPairs) {
      const priceHistory = await this.fetchPriceHistory(pair);
      const isTarget = this.evaluatePricePattern(priceHistory);

      if (isTarget) {
        this.targetPairs.add(pair);
      }
    }
  }

  /** Define custom logic to evaluate whether a pair is a target */
  private evaluatePricePattern(priceHistory: number[]): boolean {
    // Example logic: upward trend check
    if (priceHistory.length < 2) return false;
    return priceHistory[priceHistory.length - 1] > priceHistory[0];
  }

  getAllTrades(): Set<PumpswapTradesSum> {
    return this.allTrades;
  }

  // Optional: getters
  getTrendingPairs(): Set<TrendingPair> {
    return this.trendingPairs;
  }

  getTargetPairs(): Set<TrendingPair> {
    return this.targetPairs;
  }
}
