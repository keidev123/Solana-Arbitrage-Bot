import { BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { analyzeToken } from "../photon";
import { PumpSwap } from "../../contract/pumpswap/pumpswap";
import { PumpfunProgram } from "../../contract/pumpfun";

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
  buyVolume: number,
  sellVolume: number,
}


export class Pumpswap {
  private connection: Connection;
  private allTrades: Set<PumpswapTradesSum>;
  private trendingPairs: Set<TrendingPair>;
  private targetPairs: Set<TrendingPair>;
  private migratedTrendingPairs: Set<TrendingPair>;
  private program: Program<PumpSwap>;
  private limitByTradeNum: number;
  private targetPairNum: number


  constructor(connection: Connection, program: Program<PumpSwap>, limitByTradeNum: number = 100, targetPairNum: number = 10) {
    this.connection = connection;
    this.program = program;
    this.allTrades = new Set();
    this.trendingPairs = new Set();
    this.migratedTrendingPairs = new Set();
    this.targetPairs = new Set();
    this.limitByTradeNum = limitByTradeNum;
    this.targetPairNum = targetPairNum;
  }

  /** Fetch raw transactions from Pumpswap */
  async fetchTransactions(): Promise<void> {

    // buy listener
    const buyListenerId = this.program.addEventListener('buyEvent', async (event, slot, signature) => {
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
      const { pool, timestamp, baseAmountIn, quoteAmountOut } = event
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

  async filterTrendingPairs(): Promise<Set<TrendingPair>> {
    // Analyze all trades to find trending pairs
    const sortedTrades = Array.from(this.allTrades)
      .sort((a, b) => b.tradeNum - a.tradeNum) // descending by trade count
      .slice(0, this.limitByTradeNum); // take top N

    const poolAccounts = await this.program.account.pool.fetchMultiple(
      sortedTrades.map((t) => t.pool)
    );

    this.trendingPairs.clear();

    for (let i = 0; i < sortedTrades.length; i++) {
      const trade = sortedTrades[i];
      const pool = poolAccounts[i];

      if (!pool)
        continue; // skip if fetch failed

      const isBaseSOL = pool.baseMint.equals(NATIVE_MINT);
      const isQuoteSOL = pool.quoteMint.equals(NATIVE_MINT);

      if (!isBaseSOL && !isQuoteSOL) continue; // skip non-SOL pairs

      const tokenMint = isBaseSOL ? pool.quoteMint : pool.baseMint;

      const buyVolume = isBaseSOL ? trade.baseAmountOut : trade.quoteAmountOut;
      const sellVolume = isBaseSOL ? trade.baseAmountIn : trade.quoteAmountIn;

      if (buyVolume < sellVolume.div(new BN(3)).mul(new BN(2)))
        continue;    // skip if buy volume is less than 2/3 of sell volume

      this.trendingPairs.add({
        pool: trade.pool,
        tokenMint,
        buyVolume: buyVolume.toNumber() / 10 ** 9,
        sellVolume: sellVolume.toNumber() / 10 ** 9,
      });

    }
    return this.trendingPairs;
  }

  async filterMigratedToken(): Promise<Set<TrendingPair>> {
    this.migratedTrendingPairs.clear()
    for (const pair of this.trendingPairs) {
      try {
        const bondingCurveInPumpfun = PublicKey.findProgramAddressSync(
          [Buffer.from("bonding-curve"), pair.tokenMint.toBuffer()],
          PumpfunProgram.programId
        )[0];
        const doesExist = await this.connection.getAccountInfo(bondingCurveInPumpfun);
        if (doesExist)
          this.migratedTrendingPairs.add(pair);
      } catch (error) {
        console.log(`Error while fetching pumpfun migrated tokens`, error);
      }
    }
    return this.migratedTrendingPairs
  }
  async filterByHistoryForTargetToken(): Promise<Set<TrendingPair>> {
    const results = await Promise.allSettled(
      Array.from(this.trendingPairs).map(async (pair) => {
        try {
          const analysis = await analyzeToken(pair.pool.toBase58());
          if (analysis) {
            return { pair, score: analysis.score };
          }
          return null;
        } catch (error) {
          console.error("Error analyzing pair:", pair.pool.toBase58(), error);
          return null;
        }
      })
    );

    // Filter out failed and null results
    const analyzedPairs: { pair: TrendingPair; score: number }[] = results
      .filter((res): res is PromiseFulfilledResult<{ pair: TrendingPair; score: number }> => res.status === 'fulfilled' && res.value !== null)
      .map(res => res.value);

    // Sort by descending score and take top N
    const topPairs = analyzedPairs
      .sort((a, b) => b.score - a.score)
      .slice(0, this.targetPairNum);

    this.targetPairs = new Set(topPairs.map(p => p.pair));

    return this.targetPairs;
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

  getMigratedTrendingPairs(): Set<TrendingPair> {
    return this.migratedTrendingPairs;
  }

  getTargetPairs(): Set<TrendingPair> {
    return this.targetPairs;
  }
}
