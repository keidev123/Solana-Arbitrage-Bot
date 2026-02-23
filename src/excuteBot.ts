import { dammV2Thread } from "./scanner/meteoraDammV2";
import { dlmmThread } from "./scanner/meteoraDlmm";
import { pumpSwapThread } from "./scanner/pumpSwap";
import { logger } from "../utils/utils";

// Import both DEX services - they will start automatically
async function startServices() {
  try {
    // Import pumpSwap service
    logger.info("🔄 Starting PumpSwap service...");
    await pumpSwapThread()
    logger.info("✅ PumpSwap service started");
    
    // Import meteoraDammV2 service
    logger.info("🔄 Starting Meteora DammV2 service...");
    await dammV2Thread()
    logger.info("✅ Meteora DammV2 service started");

    // // Import meteoraDammV2 service
    logger.info("🔄 Starting Meteora Dlmm service...");
    await dlmmThread()
    logger.info("✅ Meteora Dlmm service started");
    
    logger.info("🎉 All services started successfully!");
  } catch (error) {
    console.error("❌ Error starting services:", error);
    process.exit(1);
  }
}

// Start everything
async function main() {
  await startServices();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('\n🛑 Shutting down arbitrage execution bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('\n🛑 Shutting down arbitrage execution bot...');
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