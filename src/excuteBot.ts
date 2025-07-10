import { arbitrageAggregator } from "./dex/arbitrageAggregator";

console.log("🚀 Starting Arbitrage Execution Bot...");
console.log("📊 Running PumpSwap, Meteora DammV2, and Arbitrage Monitoring...\n");

// Import both DEX services - they will start automatically
async function startServices() {
  try {
    // Import pumpSwap service
    console.log("🔄 Starting PumpSwap service...");
    await import("./dex/pumpSwap");
    console.log("✅ PumpSwap service started");
    
    // Import meteoraDammV2 service
    console.log("🔄 Starting Meteora DammV2 service...");
    await import("./dex/meteoraDammV2");
    console.log("✅ Meteora DammV2 service started");
    
    console.log("🎉 All services started successfully!");
  } catch (error) {
    console.error("❌ Error starting services:", error);
    process.exit(1);
  }
}

// Function to print arbitrage opportunities periodically
function startArbitrageMonitoring(intervalMs: number = 30000) {
  console.log("🔍 Starting arbitrage monitoring...\n");
  
  setInterval(() => {
    // Print arbitrage opportunities with 1% or higher difference
    arbitrageAggregator.printArbitrageTable(1.0);
    
    // You can also get specific opportunities programmatically
    const opportunities = arbitrageAggregator.getArbitrageOpportunities(1.0); // 1%+ opportunities
    if (opportunities.length > 0) {
      console.log(`🔥 Found ${opportunities.length} high-value arbitrage opportunities (1%+ difference)!`);
      
      // Example: Get the best opportunity
      const bestOpportunity = opportunities[0];
      console.log(`🏆 Best opportunity: ${bestOpportunity.mint} - ${bestOpportunity.arbitragePercentage?.toFixed(2)}% difference`);
    }
  }, intervalMs);
}

// Start everything
async function main() {
  await startServices();
  
  // Start monitoring after services are initialized
  setTimeout(() => {
    startArbitrageMonitoring();
  }, 5000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down arbitrage execution bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down arbitrage execution bot...');
  process.exit(0);
});

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the bot
main().catch((error) => {
  console.error('Failed to start bot:', error);
  process.exit(1);
}); 