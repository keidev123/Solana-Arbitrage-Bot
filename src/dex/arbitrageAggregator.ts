// Global arbitrage aggregator for cross-DEX price comparison
import { getDammV2Price } from '../../utils/utils';

export type ArbitrageOpportunity = {
  mint: string;
  pumpSwapPrice?: string;
  meteoraPrice?: string;
  dlmmPrice?: string;
  pumpSwapEvent?: any;
  dammEvent?: any;
  dlmmEvent?: any;
  priceDifference?: number;
  arbitragePercentage?: number;
  lastUpdated: Date;
};

export class ArbitrageAggregator {
  private arbitrageStats: Map<string, ArbitrageOpportunity> = new Map();
  private lastPrinted: Map<string, { pumpSwapPrice?: string; meteoraPrice?: string; dlmmPrice?: string; arbitragePercentage?: number }> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceDelayMs = 300;

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
        if (realChange) this.printArbitrageTable(1.0);
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
      if (realChange) this.printArbitrageTable(1.0);
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
    opportunity.lastUpdated = new Date();
    this.calculateArbitrage(opportunity);
    const realChange = this.hasProfitOrPriceChanged(
      { ...opportunity, meteoraPrice: oldPrice, arbitragePercentage: oldArbPct },
      event.price,
      'meteoraPrice',
      opportunity.arbitragePercentage
    );
    if (realChange) this.printArbitrageTable(1.0);
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
    opportunity.lastUpdated = new Date();
    this.calculateArbitrage(opportunity);
    const realChange = this.hasProfitOrPriceChanged(
      { ...opportunity, dlmmPrice: oldPrice, arbitragePercentage: oldArbPct },
      event.price,
      'dlmmPrice',
      opportunity.arbitragePercentage
    );
    if (realChange) this.printArbitrageTable(1.0);
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
      // console.log(`[ArbitrageAggregator] No arbitrage opportunities with ${minPercentage}% or higher difference`);
      // console.log("size ==>", this.arbitrageStats.size)
      return;
    }

    // Table headers and column widths
    const headers = [
      'No',
      'Mint',
      'PumpSwap Price',
      'DammV2 Price',
      'DLMM Price',
      'Diff Price',
      'Profit %',
      'Updated Time'
    ];
    const colWidths = [6, 44, 18, 18, 18, 16, 10, 26];
    // Box-drawing characters
    const h = '─', v = '│', tl = '┌', tr = '┐', bl = '└', br = '┘', l = '├', r = '┤', t = '┬', b = '┴', c = '┼';
    const pad = (str: string, len: number, align: 'left' | 'right' = 'left') => {
      if (str.length > len) return str.slice(0, len);
      return align === 'left' ? String(str).padEnd(len, ' ') : String(str).padStart(len, ' ');
    };
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
      let row = v;
      row += pad((idx + 1).toString(), colWidths[0], 'right') + v;
      row += pad(opp.mint, colWidths[1], 'left') + v;
      row += pad(opp.pumpSwapPrice || 'N/A', colWidths[2], 'right') + v;
      row += pad(opp.meteoraPrice || 'N/A', colWidths[3], 'right') + v;
      row += pad(opp.dlmmPrice || 'N/A', colWidths[4], 'right') + v;
      row += pad((opp.priceDifference?.toFixed(12) || 'N/A'), colWidths[5], 'right') + v;
      row += pad((opp.arbitragePercentage?.toFixed(2) || 'N/A') + '%', colWidths[6], 'right') + v;
      row += pad(opp.lastUpdated.toISOString(), colWidths[7], 'left') + v;
      console.log(row);
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
