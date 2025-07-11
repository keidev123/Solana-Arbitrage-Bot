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
import { arbitrageAggregator } from "./arbitrageAggregator";

// Aggregator for Meteora DLMM events by token mint
export type DlmmTrendingStat = {
  type: string;
  user: string;
  mint: string;
  amount_in: number;
  amount_out: number;
  baseTokenBalance: number;
  quoteTokenBalance: number;
  price: string;
};

export class DlmmAggregator {
  private tokenStats: Map<string, DlmmTrendingStat> = new Map();

  update(event: DlmmTrendingStat) {
    if (!event || !event.mint) return;
    this.tokenStats.set(event.mint, event);
  }

  getAllStats(): DlmmTrendingStat[] {
    return Array.from(this.tokenStats.values());
  }
}

const dlmmAggregator = new DlmmAggregator();
// Start auto-filtering every 10 seconds
// dlmmAggregator.startAutoFilter(10000);

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
      // dlmmAggregator.update(tOutput);
      
      // Update global arbitrage aggregator
      arbitrageAggregator.updateFromDlmm(tOutput);
      
      // Uncomment below to see individual transactions
      console.log(
        new Date(),
        ":",
        `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
        JSON.stringify(tOutput, null, 2) + "\n"
      );
      console.log(
        "--------------------------------------------------------------------------------------------------"
      );
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

export const dlmmThread = () => {

  subscribeCommand(client, req);
}

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