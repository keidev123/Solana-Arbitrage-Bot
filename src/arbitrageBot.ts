import { arbitrageAggregator } from "./dex/arbitrageAggregator";
// import "./dex/pumpSwap";
// import "./dex/meteoraDammV2";

console.log("🚀 Starting Arbitrage Bot...");
console.log("📊 Monitoring PumpSwap and Meteora DammV2 for arbitrage opportunities...\n");

// Remove startArbitrageMonitoring and setTimeout

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down arbitrage bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down arbitrage bot...');
  process.exit(0);
}); 