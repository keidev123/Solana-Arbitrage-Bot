// Global arbitrage aggregator for cross-DEX price comparison
export type ArbitrageOpportunity = {
  mint: string;
  pumpSwapPrice?: string;
  meteoraPrice?: string;
  dlmmPrice?: string;
  pumpSwapEvent?: any;
  meteoraEvent?: any;
  dlmmEvent?: any;
  priceDifference?: number;
  arbitragePercentage?: number;
  lastUpdated: Date;
};

export class ArbitrageAggregator {
  private arbitrageStats: Map<string, ArbitrageOpportunity> = new Map();

  // Update from pumpSwap
  updateFromPumpSwap(event: any) {
    if (!event || !event.mint) return;
    
    const mint = event.mint;
    let opportunity = this.arbitrageStats.get(mint);
    
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
    
    this.calculateArbitrage(opportunity);
  }

  // Update from meteoraDammV2
  updateFromMeteora(event: any) {
    if (!event || !event.mint) return;
    
    const mint = event.mint;
    let opportunity = this.arbitrageStats.get(mint);
    
    if (!opportunity) {
      opportunity = {
        mint,
        lastUpdated: new Date()
      };
      this.arbitrageStats.set(mint, opportunity);
    }
    
    opportunity.meteoraPrice = event.price;
    opportunity.meteoraEvent = event;
    opportunity.lastUpdated = new Date();
    
    this.calculateArbitrage(opportunity);
  }

  // Update from meteoraDlmm
  updateFromDlmm(event: any) {
    if (!event || !event.mint) return;
    const mint = event.mint;
    let opportunity = this.arbitrageStats.get(mint);
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
    
    if (opportunities.length === 0) {
      console.log(`[ArbitrageAggregator] No arbitrage opportunities with ${minPercentage}% or higher difference`);
      console.log("size ==>", this.arbitrageStats.size)
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
      return align === 'left' ? str.padEnd(len, ' ') : str.padStart(len, ' ');
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
  }
}

// Global instance
export const arbitrageAggregator = new ArbitrageAggregator(); 
