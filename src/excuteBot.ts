import { arbitrageAggregator } from "./dex/arbitrageAggregator";
import { dammV2Thread } from "./dex/meteoraDammV2";
import { dlmmThread } from "./dex/meteoraDlmm";
import { pumpSwapThread } from "./dex/pumpSwap";

console.log("🚀 Starting Arbitrage Execution Bot...");
console.log("📊 Running PumpSwap, Meteora DammV2, and Arbitrage Monitoring...\n");

// Import both DEX services - they will start automatically
async function startServices() {
  try {
    // // Import pumpSwap service
    // console.log("🔄 Starting PumpSwap service...");
    // await pumpSwapThread()
    // console.log("✅ PumpSwap service started");
    
    // // Import meteoraDammV2 service
    // console.log("🔄 Starting Meteora DammV2 service...");
    // await dammV2Thread()
    // console.log("✅ Meteora DammV2 service started");

    // // Import meteoraDammV2 service
    console.log("🔄 Starting Meteora DammV2 service...");
    await dlmmThread()
    console.log("✅ Meteora DammV2 service started");
    
    console.log("🎉 All services started successfully!");
  } catch (error) {
    console.error("❌ Error starting services:", error);
    process.exit(1);
  }
}

// Start everything
async function main() {
  await startServices();
  
  // Start monitoring after services are initialized
  // Remove startArbitrageMonitoring and setTimeout
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