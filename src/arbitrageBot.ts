import { arbitrageAggregator } from "./dex/arbitrageAggregator";
// import "./dex/pumpSwap";
// import "./dex/meteoraDammV2";

console.log("🚀 Starting Arbitrage Bot...");
console.log("📊 Monitoring PumpSwap and Meteora DammV2 for arbitrage opportunities...\n");

// Function to print arbitrage opportunities periodically
function startArbitrageMonitoring(intervalMs: number = 30000) { // Check every 30 seconds
  setInterval(() => {
    // Print arbitrage opportunities with 1% or higher difference
    arbitrageAggregator.printArbitrageTable(1.0);
    
    // You can also get specific opportunities programmatically
    const opportunities = arbitrageAggregator.getArbitrageOpportunities(2.0); // 2%+ opportunities
    if (opportunities.length > 0) {
      console.log(`🔥 Found ${opportunities.length} high-value arbitrage opportunities (2%+ difference)!`);
      
      // Example: Get the best opportunity
      const bestOpportunity = opportunities[0];
      console.log(`🏆 Best opportunity: ${bestOpportunity.mint} - ${bestOpportunity.arbitragePercentage?.toFixed(2)}% difference`);
    }
  }, intervalMs);
}

// Start monitoring after a short delay to let services initialize
setTimeout(() => {
  console.log("🔍 Starting arbitrage monitoring...\n");
  startArbitrageMonitoring();
}, 5000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down arbitrage bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down arbitrage bot...');
  process.exit(0);
}); 