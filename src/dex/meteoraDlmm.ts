require('dotenv').config()
import Client, {
  CommitmentLevel,
  SubscribeRequestAccountsDataSlice,
  SubscribeRequestFilterAccounts,
  SubscribeRequestFilterBlocks,
  SubscribeRequestFilterBlocksMeta,
  SubscribeRequestFilterEntry,
  SubscribeRequestFilterSlots,
  SubscribeRequestFilterTransactions,
} from "@triton-one/yellowstone-grpc";
import { SubscribeRequestPing } from "@triton-one/yellowstone-grpc/dist/types/grpc/geyser";
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { Idl } from "@coral-xyz/anchor";
import { SolanaParser } from "@shyft-to/solana-transaction-parser";
import { TransactionFormatter } from "../../utils/transaction-formatter";
import meteoraDLMMIdl from "../idl/meteora_dlmm.json";
import { SolanaEventParser } from "../../utils/event-parser";
import { bnLayoutFormatter } from "../../utils/bn-layout-formatter";
import { transactionOutput } from "../../utils/dlmm_transaction_output";
import { client } from "../../constants";

// Aggregator for Meteora DLMM events by token mint
export type DlmmTrendingStat = {
  tokenAddress: string;
  sell_volume: number;
  buy_volume: number;
  transaction_count: number;
};

export class DlmmAggregator {
  private tokenStats: Map<string, DlmmTrendingStat> = new Map();
  private filterInterval: NodeJS.Timeout | null = null;

  update(event: {
    type?: string;
    mint?: string;
    tokenAmount?: number;
    solAmount?: number;
  }) {
    if (!event || !event.mint) return;
    const tokenAddress = event.mint;
    let stat = this.tokenStats.get(tokenAddress);
    if (!stat) {
      stat = {
        tokenAddress,
        sell_volume: 0,
        buy_volume: 0,
        transaction_count: 0,
      };
      this.tokenStats.set(tokenAddress, stat);
    }
    
    if (event.type === 'Buy') {
      stat.buy_volume += Number(event.solAmount || 0);
    } else if (event.type === 'Sell') {
      stat.sell_volume += Number(event.solAmount || 0);
    }
    stat.transaction_count += 1;
  }

  getAllStats(): DlmmTrendingStat[] {
    return Array.from(this.tokenStats.values());
  }

  startAutoFilter(intervalMs: number = 10000) {
    if (this.filterInterval) clearInterval(this.filterInterval);
    this.filterInterval = setInterval(() => {
      console.log(" ======= TOP INTERMEDIATE MINTS BY VOLUME (DLMM) ======= ")
      this.printTable();
      console.log("\n\n NOW UPDATING DATA, WAITING 1 MINUTE ....")
    }, intervalMs);
  }

  stopAutoFilter() {
    if (this.filterInterval) clearInterval(this.filterInterval);
    this.filterInterval = null;
  }

  // Return only tokens where buy_volume > sell_volume
  filterTokenStat(): DlmmTrendingStat[] {
    return Array.from(this.tokenStats.values()).filter(stat => stat.buy_volume > stat.sell_volume);
  }

  // Sort by (buy_volume - sell_volume) descending, then by buy_volume descending
  sortByVolume(): DlmmTrendingStat[] {
    return this.filterTokenStat().sort((a, b) => {
      const diffA = a.buy_volume - a.sell_volume;
      const diffB = b.buy_volume - b.sell_volume;
      if (diffB !== diffA) return diffB - diffA;
      return b.buy_volume - a.buy_volume;
    });
  }

  // Print formatted table to console
  printTable(): void {
    const sortedStats = this.sortByVolume();
    if (sortedStats.length === 0) {
      console.log("[DlmmAggregator] No tokens with buy_volume > sell_volume");
      return;
    }

    // Table headers and column widths
    const headers = [
      'Rank',
      'tokenAddress',
      'sell_volume',
      'buy_volume',
      'Txns'
    ];
    const colWidths = [6, 48, 20, 20, 8];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0) + headers.length + 1;

    // Box-drawing characters
    const h = '─', v = '│', tl = '┌', tr = '┐', bl = '└', br = '┘', l = '├', r = '┤', t = '┬', b = '┴', c = '┼';

    // Helper to pad and align
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
    sortedStats.forEach((stat, idx) => {
      let row = v;
      row += pad((idx + 1).toString(), colWidths[0], 'right') + v;
      row += pad(stat.tokenAddress, colWidths[1], 'left') + v;
      row += pad(stat.sell_volume.toString(), colWidths[2], 'right') + v;
      row += pad(stat.buy_volume.toString(), colWidths[3], 'right') + v;
      row += pad(stat.transaction_count.toString(), colWidths[4], 'right') + v;
      console.log(row);
    });

    // Bottom border
    line = bl;
    for (let i = 0; i < headers.length; i++) {
      line += h.repeat(colWidths[i]);
      line += i === headers.length - 1 ? br : b;
    }
    console.log(line);
    console.log(`Total tokens: ${sortedStats.length}\n`);
  }
}

const dlmmAggregator = new DlmmAggregator();
// Start auto-filtering every 10 seconds
dlmmAggregator.startAutoFilter(10000);

interface SubscribeRequest {
  accounts: { [key: string]: SubscribeRequestFilterAccounts };
  slots: { [key: string]: SubscribeRequestFilterSlots };
  transactions: { [key: string]: SubscribeRequestFilterTransactions };
  transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions };
  blocks: { [key: string]: SubscribeRequestFilterBlocks };
  blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta };
  entry: { [key: string]: SubscribeRequestFilterEntry };
  commitment?: CommitmentLevel | undefined;
  accountsDataSlice: SubscribeRequestAccountsDataSlice[];
  ping?: SubscribeRequestPing | undefined;
}

const TXN_FORMATTER = new TransactionFormatter();
const METEORA_DLMM_PROGRAM_ID = new PublicKey(
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
);
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111",
);

// Create a simple IDL for ComputeBudget program to prevent parsing errors
const computeBudgetIdl: Idl = {
  address: "ComputeBudget111111111111111111111111111111",
  metadata: {
    name: "compute_budget",
    version: "0.1.0",
    spec: "0.1.0",
    description: "ComputeBudget program"
  },
  instructions: [
    {
      name: "setComputeUnitLimit",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0], // Placeholder discriminator
      accounts: [],
      args: [
        {
          name: "units",
          type: "u32",
        },
      ],
    },
    {
      name: "setComputeUnitPrice",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0], // Placeholder discriminator
      accounts: [],
      args: [
        {
          name: "microLamports",
          type: "u64",
        },
      ],
    },
  ],
  accounts: [],
  types: [],
  events: [],
  errors: [],
};

const METEORA_DLMM_IX_PARSER = new SolanaParser([]);
// Add ComputeBudget parser to prevent console errors
METEORA_DLMM_IX_PARSER.addParserFromIdl(
  COMPUTE_BUDGET_PROGRAM_ID.toBase58(),
  computeBudgetIdl,
);

const METEORA_DLMM_EVENT_PARSER = new SolanaEventParser([], console);

async function handleStream(client: Client, args: SubscribeRequest) {
  console.log("Streaming Swap events for Meteora DLMM...");
  // Subscribe for events
  const stream = await client.subscribe();

  // Create `error` / `end` handler
  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on("error", (error) => {
      console.log("ERROR", error);
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      resolve();
    });
    stream.on("close", () => {
      resolve();
    });
  });

  // Handle updates
  stream.on("data", (data) => {
    // console.log("🚀 ~ stream.on ~ data:", data)
    if (data?.transaction) {
      const txn = TXN_FORMATTER.formTransactionFromJson(
        data.transaction,
        Date.now(),
      );
      const parsedInstruction = decodeMeteoraDLMM(txn);

      if (!parsedInstruction) return;
      const tOutput = transactionOutput(parsedInstruction,txn)
      if(!tOutput) return;
      
      // Update token stats
      dlmmAggregator.update(tOutput);
      
      // Uncomment below to see individual transactions
      // console.log(
      //   new Date(),
      //   ":",
      //   `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
      //   JSON.stringify(tOutput, null, 2) + "\n"
      // );
      // console.log(
      //   "--------------------------------------------------------------------------------------------------"
      // );
    }
  });

  // Send subscribe request
  await new Promise<void>((resolve, reject) => {
    stream.write(args, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error(reason);
    throw reason;
  });

  await streamClosed;
}

async function subscribeCommand(client: Client, args: SubscribeRequest) {
  while (true) {
    try {
      await handleStream(client, args);
    } catch (error) {
      console.error("Stream error, restarting in 1 second...", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}


const req: SubscribeRequest = {
  accounts: {},
  slots: {},
  transactions: {
    Meteora_DLMM: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [METEORA_DLMM_PROGRAM_ID.toBase58()],
      accountExclude: [],
      accountRequired: [],
    },
  },
  transactionsStatus: {},
  entry: {},
  blocks: {},
  blocksMeta: {},
  accountsDataSlice: [],
  ping: undefined,
  commitment: CommitmentLevel.CONFIRMED,
};

subscribeCommand(client, req);

function decodeMeteoraDLMM(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;
  
  try {
    // Check if this transaction contains DLMM program instructions
    let hasDLMMInstruction = false;
    
    if ('instructions' in tx.transaction.message) {
      hasDLMMInstruction = tx.transaction.message.instructions.some((ix: any) =>
        ix.programId && ix.programId.equals && ix.programId.equals(METEORA_DLMM_PROGRAM_ID)
      );
    } else if ('compiledInstructions' in tx.transaction.message) {
      const accountKeys = tx.transaction.message.staticAccountKeys;
      hasDLMMInstruction = tx.transaction.message.compiledInstructions.some((ix: any) => {
        const programId = accountKeys[ix.programIdIndex];
        return programId && programId.equals && programId.equals(METEORA_DLMM_PROGRAM_ID);
      });
    }
    
    if (!hasDLMMInstruction) return;
    
    // Check log messages for swap instruction
    const logMessages = tx.meta?.logMessages || [];
    const hasSwapInstruction = logMessages.some((log: string) => 
      log.includes("Instruction: Swap")
    );
    
    if (!hasSwapInstruction) return;
    
    // Create a basic result structure for swap events
    const result = {
      instructions: [],
      inner_ixs: [],
      events: [{
        name: 'Swap',
        lbPair: '', // Will be extracted from transaction
        from: '', // Will be extracted from transaction
        startBinId: 0,
        endBinId: 0,
        amountIn: 0,
        amountOut: 0,
        swapForY: false,
        fee: 0,
        protocolFee: 0,
        feeBps: 0,
        hostFee: 0
      }]
    };
    
    return result;
  } catch (err) {
    console.error("Error parsing DLMM transaction:", err);
    return;
  }
}