// Global arbitrage aggregator for cross-DEX price comparison
import { MIN_PROFIT_PERCNETAGE } from '../constants';
import { getDammV2Price } from '../utils/utils';
// Add imports for swap executors
import { TradingPair, buyPumpswapToken, pumpSwapTrade, sellPumpswapTokenBySDK } from './trade/pumpSwap';
import { dlmmTrade } from './trade/dlmm';
import { dammTrade } from './trade/dammv2';
import { TradeParams } from './trade/types';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { solanaConnection, wallet } from '../constants';
import BN from 'bn.js';
import DLMM from '@meteora-ag/dlmm';

export type ArbitrageOpportunity = {
  mint: string;
  pumpSwapPrice?: string;
  meteoraPrice?: string;
  dlmmPrice?: string;
  pumpSwapEvent?: any;
  dammEvent?: any;
  dlmmEvent?: any;
  pumpPoolId?: string;
  dammV2PoolId?: string;
  dlmmPoolId?: string;
  priceDifference?: number;
  arbitragePercentage?: number;
  lastUpdated: Date;
};

export class ArbitrageAggregator {
  private arbitrageStats: Map<string, ArbitrageOpportunity> = new Map();
  private lastPrinted: Map<string, { pumpSwapPrice?: string; meteoraPrice?: string; dlmmPrice?: string; arbitragePercentage?: number }> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceDelayMs = 300;
  private executingMints: Set<string> = new Set(); // To prevent duplicate execution

  // Helper to extract and format pool ID in short style
  private getShortPoolId(poolId: string | undefined): string {
    if (!poolId) return 'N/A';
    // Take first 6 and last 4 characters, or just first 8 if shorter
    if (poolId.length <= 8) return poolId;
    return `${poolId.slice(0, 6)}...${poolId.slice(-4)}`;
  }

  // Helper to check if profit or price changed
  private hasProfitOrPriceChanged(oldOpp: ArbitrageOpportunity | undefined, newPrice: string | undefined, priceKey: 'pumpSwapPrice' | 'meteoraPrice' | 'dlmmPrice', newArbPct: number | undefined): boolean {
    if (!oldOpp) return true; // New opportunity
    if (oldOpp[priceKey] !== newPrice) return true; // Price changed
    if (typeof newArbPct === 'number' && typeof oldOpp.arbitragePercentage === 'number' && Math.abs(newArbPct - oldOpp.arbitragePercentage) > 1e-9) return true; // Profit changed
    return false;
  }

  // Helper to check if any price or profit changed since last print
  private hasChangedSinceLastPrint(opp: ArbitrageOpportunity): boolean {
    const last = this.lastPrinted.get(opp.mint);
    if (!last) return true;
    if (last.pumpSwapPrice !== opp.pumpSwapPrice) return true;
    if (last.meteoraPrice !== opp.meteoraPrice) return true;
    if (last.dlmmPrice !== opp.dlmmPrice) return true;
    if (typeof last.arbitragePercentage === 'number' && typeof opp.arbitragePercentage === 'number') {
      if (Math.abs(last.arbitragePercentage - opp.arbitragePercentage) > 1e-9) return true;
    } else if (last.arbitragePercentage !== opp.arbitragePercentage) {
      return true;
    }
    return false;
  }

  // Update lastPrinted map after printing
  private updateLastPrinted(opps: ArbitrageOpportunity[]) {
    for (const opp of opps) {
      this.lastPrinted.set(opp.mint, {
        pumpSwapPrice: opp.pumpSwapPrice,
        meteoraPrice: opp.meteoraPrice,
        dlmmPrice: opp.dlmmPrice,
        arbitragePercentage: opp.arbitragePercentage,
      });
    }
  }

  // Add method to execute swap
  private async executeSwap(opportunity: ArbitrageOpportunity) {
    if (this.executingMints.has(opportunity.mint)) return;
    this.executingMints.add(opportunity.mint);
    try {
      const prices = [
        { key: 'pumpSwapPrice', value: opportunity.pumpSwapPrice, poolId: opportunity.pumpPoolId },
        { key: 'meteoraPrice', value: opportunity.meteoraPrice, poolId: opportunity.dammV2PoolId },
        { key: 'dlmmPrice', value: opportunity.dlmmPrice, poolId: opportunity.dlmmPoolId },
      ].filter(p => p.value !== undefined && p.poolId !== undefined);
      if (prices.length < 2) return;
      const sorted = prices.sort((a, b) => parseFloat(a.value!) - parseFloat(b.value!));
      const buy = sorted[0];
      const sell = sorted[sorted.length - 1];
      const tradeAmount = 0.01;
      const mint = new PublicKey(opportunity.mint);
      const params: TradeParams = {
        pool: new PublicKey(buy.poolId!),
        inputMint: mint,
        outputMint: mint,
        amount: new BN(tradeAmount * 1e9),
        slippage: 0.5,
        user: wallet,
        connection: solanaConnection
      };
      let result;
      if (buy.key === 'pumpSwapPrice') {
        result = await pumpSwapTrade(params);
      } else if (buy.key === 'meteoraPrice') {
        result = await dammTrade(params);
      } else if (buy.key === 'dlmmPrice') {
        result = await dlmmTrade(params);
      }
      if (result && !result.success) {
        console.error('Swap execution error:', result.error);
      }
    } catch (err) {
      console.error('Swap execution error:', err);
    } finally {
      setTimeout(() => this.executingMints.delete(opportunity.mint), 10000);
    }
  }

  // Update from pumpSwap
  updateFromPumpSwap(event: any) {
    if (!event || !event.mint) return;
    const mint = event.mint;
    let opportunity = this.arbitrageStats.get(mint);
    const oldArbPct = opportunity?.arbitragePercentage;
    const oldPrice = opportunity?.pumpSwapPrice;
    if (!opportunity) {
      opportunity = {
        mint,
        lastUpdated: new Date()
      };
      this.arbitrageStats.set(mint, opportunity);
    }
    opportunity.pumpSwapPrice = event.price;
    opportunity.pumpSwapEvent = event;
    opportunity.pumpPoolId = event.poolId;
    opportunity.lastUpdated = new Date();

    // If this pair exists in both PumpSwap and DammV2, debounce the DammV2 price update and table print
    if (opportunity.meteoraPrice !== undefined && event.poolId) {
      if (this.debounceTimers.has(mint)) {
        clearTimeout(this.debounceTimers.get(mint));
      }
      this.debounceTimers.set(mint, setTimeout(async () => {
        // console.log("debounceTimers ==>", opportunity)
        const dammV2Price = await getDammV2Price(opportunity.dammEvent.poolId);
        opportunity.meteoraPrice = dammV2Price !== undefined && dammV2Price !== null ? String(dammV2Price) : undefined;
        this.calculateArbitrage(opportunity);
        const realChange = this.hasProfitOrPriceChanged(
          { ...opportunity, pumpSwapPrice: oldPrice, arbitragePercentage: oldArbPct },
          event.price,
          'pumpSwapPrice',
          opportunity.arbitragePercentage
        );
        if (realChange) {
          this.printArbitrageTable(Number(MIN_PROFIT_PERCNETAGE));
          // Execute swap if profitable
          if (opportunity.arbitragePercentage && opportunity.arbitragePercentage > Number(MIN_PROFIT_PERCNETAGE)) {
            this.executeSwap(opportunity);
          }
        }
        this.debounceTimers.delete(mint);
      }, this.debounceDelayMs));
    } else {
      // If not in DammV2, update and print as usual
      this.calculateArbitrage(opportunity);
      const realChange = this.hasProfitOrPriceChanged(
        { ...opportunity, pumpSwapPrice: oldPrice, arbitragePercentage: oldArbPct },
        event.price,
        'pumpSwapPrice',
        opportunity.arbitragePercentage
      );
      if (realChange) {
        this.printArbitrageTable(Number(MIN_PROFIT_PERCNETAGE));
        // Execute swap if profitable
        if (opportunity.arbitragePercentage && opportunity.arbitragePercentage > Number(MIN_PROFIT_PERCNETAGE)) {
          this.executeSwap(opportunity);
        }
      }
    }
  }

  // Update from meteoraDammV2
  updateFromMeteora(event: any) {
    if (!event || !event.mint) return;
    const mint = event.mint;
    let opportunity = this.arbitrageStats.get(mint);
    const oldArbPct = opportunity?.arbitragePercentage;
    const oldPrice = opportunity?.meteoraPrice;
    if (!opportunity) {
      opportunity = {
        mint,
        lastUpdated: new Date()
      };
      this.arbitrageStats.set(mint, opportunity);
    }
    opportunity.meteoraPrice = event.price;
    opportunity.dammEvent = event;
    opportunity.dammV2PoolId = event.poolId;
    opportunity.lastUpdated = new Date();
    this.calculateArbitrage(opportunity);
    const realChange = this.hasProfitOrPriceChanged(
      { ...opportunity, meteoraPrice: oldPrice, arbitragePercentage: oldArbPct },
      event.price,
      'meteoraPrice',
      opportunity.arbitragePercentage
    );
    if (realChange) {
      this.printArbitrageTable(Number(MIN_PROFIT_PERCNETAGE));
      if (opportunity.arbitragePercentage && opportunity.arbitragePercentage > Number(MIN_PROFIT_PERCNETAGE)) {
        this.executeSwap(opportunity);
      }
    }
  }

  // Update from meteoraDlmm
  updateFromDlmm(event: any) {
    if (!event || !event.mint) return;
    const mint = event.mint;
    let opportunity = this.arbitrageStats.get(mint);
    const oldArbPct = opportunity?.arbitragePercentage;
    const oldPrice = opportunity?.dlmmPrice;
    if (!opportunity) {
      opportunity = {
        mint,
        lastUpdated: new Date()
      };
      this.arbitrageStats.set(mint, opportunity);
    }
    opportunity.dlmmPrice = event.price;
    opportunity.dlmmEvent = event;
    opportunity.dlmmPoolId = event.poolId;
    opportunity.lastUpdated = new Date();
    // console.log("🚀 ~ ArbitrageAggregator ~ updateFromDlmm ~ opportunity:", opportunity)
    this.calculateArbitrage(opportunity);
    const realChange = this.hasProfitOrPriceChanged(
      { ...opportunity, dlmmPrice: oldPrice, arbitragePercentage: oldArbPct },
      event.price,
      'dlmmPrice',
      opportunity.arbitragePercentage
    );
    if (realChange) {
      this.printArbitrageTable(Number(MIN_PROFIT_PERCNETAGE));
      if (opportunity.arbitragePercentage && opportunity.arbitragePercentage > Number(MIN_PROFIT_PERCNETAGE)) {
        this.executeSwap(opportunity);
      }
    }
  }

  private calculateArbitrage(opportunity: ArbitrageOpportunity) {
    // Use the two highest prices for arbitrage calculation
    const prices = [
      opportunity.pumpSwapPrice,
      opportunity.meteoraPrice,
      opportunity.dlmmPrice
    ].map(p => (p !== undefined ? parseFloat(p) : undefined)).filter(p => typeof p === 'number' && !isNaN(p)) as number[];
    if (prices.length < 2) return;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceDifference = Math.abs(maxPrice - minPrice);
    const averagePrice = (maxPrice + minPrice) / 2;
    const arbitragePercentage = (priceDifference / averagePrice) * 100;
    opportunity.priceDifference = priceDifference;
    opportunity.arbitragePercentage = arbitragePercentage;
  }

  // Get all arbitrage opportunities
  getAllArbitrageOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.arbitrageStats.values());
  }

  // Get arbitrage opportunities with minimum percentage difference
  getArbitrageOpportunities(minPercentage: number = 1.0): ArbitrageOpportunity[] {
    return this.getAllArbitrageOpportunities()
      .filter(opp => opp.arbitragePercentage && opp.arbitragePercentage >= minPercentage)
      .sort((a, b) => (b.arbitragePercentage || 0) - (a.arbitragePercentage || 0));
  }

  // Get specific mint arbitrage opportunity
  getMintOpportunity(mint: string): ArbitrageOpportunity | undefined {
    return this.arbitrageStats.get(mint);
  }

  // Print arbitrage opportunities table
  printArbitrageTable(minPercentage: number): void {
    const opportunities = this.getArbitrageOpportunities(minPercentage);
    // Only print if any opportunity has changed since last print
    const shouldPrint = opportunities.some(opp => this.hasChangedSinceLastPrint(opp));
    if (!shouldPrint) return;
    
    if (opportunities.length === 0) {
      return;
    }

    // Table headers and column widths
    const headers = [
      'No',
      'Mint (with Pool IDs)',
      'PumpSwap Price',
      'DammV2 Price',
      'DLMM Price',
      'Diff Price',
      'Profit %',
      'Updated Time'
    ];
    const colWidths = [6, 70, 18, 18, 18, 16, 10, 26];
    // Box-drawing characters
    const h = '─', v = '│', tl = '┌', tr = '┐', bl = '└', br = '┘', l = '├', r = '┤', t = '┬', b = '┴', c = '┼';
    const pad = (str: string, len: number, align: 'left' | 'right' = 'left') => {
      if (str.length > len) return str.slice(0, len);
      return align === 'left' ? String(str).padEnd(len, ' ') : String(str).padStart(len, ' ');
    };
    const underline = (len: number) => '―'.repeat(len); // Unicode underline

    // Top border
    let line = tl;
    for (let i = 0; i < headers.length; i++) {
      line += h.repeat(colWidths[i]);
      line += i === headers.length - 1 ? tr : t;
    }
    console.log(line);
    // Header row
    let headerRow = v;
    for (let i = 0; i < headers.length; i++) {
      headerRow += pad(headers[i], colWidths[i], 'left') + v;
    }
    console.log(headerRow);
    // Header separator
    line = l;
    for (let i = 0; i < headers.length; i++) {
      line += h.repeat(colWidths[i]);
      line += i === headers.length - 1 ? r : c;
    }
    console.log(line);
    // Data rows
    opportunities.forEach((opp, idx) => {
      // Prepare Mint column as multi-line: Mint, Pump Pool, Damm Pool, DLMM Pool
      const mintLines = [
        opp.mint,
        `Pump Pool:  ${opp.pumpPoolId || 'N/A'}`,
        `Damm Pool:  ${opp.dammV2PoolId || 'N/A'}`,
        `DLMM Pool:  ${opp.dlmmPoolId || 'N/A'}`
      ];
      // Prepare other columns (all single-line)
      const dataCols = [
        (idx + 1).toString(),
        mintLines, // special: array of lines
        opp.pumpSwapPrice || 'N/A',
        opp.meteoraPrice || 'N/A',
        opp.dlmmPrice || 'N/A',
        (opp.priceDifference?.toFixed(12) || 'N/A'),
        (opp.arbitragePercentage?.toFixed(2) || 'N/A') + '%',
        opp.lastUpdated.toISOString()
      ];
      // Underline for each cell
      const underlineCols = dataCols.map((col, i) => {
        if (Array.isArray(col)) {
          // For Mint column, underline each line
          return col.map(() => underline(colWidths[i]));
        } else {
          return underline(colWidths[i]);
        }
      });
      // Find max lines for this row (Mint column is 4 lines, others are 1)
      const maxLines = Math.max(...dataCols.map(col => Array.isArray(col) ? col.length : 1));
      // Print each line of the row
      for (let lineIdx = 0; lineIdx < maxLines + 1; lineIdx++) { // +1 for underline
        let row = v;
        for (let colIdx = 0; colIdx < dataCols.length; colIdx++) {
          const col = dataCols[colIdx];
          const under = underlineCols[colIdx];
          if (lineIdx < maxLines) {
            // Data line
            if (Array.isArray(col)) {
              row += pad(col[lineIdx] || '', colWidths[colIdx], 'left') + v;
            } else if (lineIdx === 0) {
              row += pad(col, colWidths[colIdx], colIdx === 0 ? 'right' : 'left') + v;
            } else {
              row += pad('', colWidths[colIdx], 'left') + v;
            }
          } else {
            // Underline
            if (Array.isArray(under)) {
              row += under[lineIdx - 0] || underline(colWidths[colIdx]) + v;
            } else {
              row += under + v;
            }
          }
        }
        console.log(row);
      }
    });
    // Bottom border
    line = bl;
    for (let i = 0; i < headers.length; i++) {
      line += h.repeat(colWidths[i]);
      line += i === headers.length - 1 ? br : b;
    }
    console.log(line);
    console.log(`Total opportunities: ${opportunities.length}\n`);
    this.updateLastPrinted(opportunities);
  }
}

// Global instance
export const arbitrageAggregator = new ArbitrageAggregator(); 
