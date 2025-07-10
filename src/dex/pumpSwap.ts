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
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { Idl } from "@coral-xyz/anchor";
import { SolanaParser } from "@shyft-to/solana-transaction-parser";
import { SubscribeRequestPing } from "@triton-one/yellowstone-grpc/dist/types/grpc/geyser";
import { TransactionFormatter } from "../../utils/transaction-formatter";
import { SolanaEventParser } from "../../utils/event-parser";
import { bnLayoutFormatter } from "../../utils/bn-layout-formatter";
import pumpSwapAmmIdl from "../idl/pumpswap.json";
import { parseSwapTransactionOutput } from "../../utils/swapTransactionParser";
import { client } from "../../constants";
import { arbitrageAggregator } from "./arbitrageAggregator";

// Aggregator for pumpSwap events by token mint
export type PumpswapTrendingStat = {
  type: string;
  user: string;
  mint: string;
  amount_in: number;
  amount_out: number;
  baseTokenBalance: number;
  quoteTokenBalance: number;
  price: string;
};

export class PumpswapAggregator {
  private tokenStats: Map<string, PumpswapTrendingStat> = new Map();

  update(event: PumpswapTrendingStat) {
    if (!event || !event.mint) return;
    // Save or update the latest event for this mint
    this.tokenStats.set(event.mint, event);
  }

  getAllStats(): PumpswapTrendingStat[] {
    return Array.from(this.tokenStats.values());
  }
}

const pumpswapAggregator = new PumpswapAggregator();
// Start auto-filtering every 1 minute
// pumpswapAggregator.startAutoFilter(10000);

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
const PUMP_AMM_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
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

const PUMP_AMM_IX_PARSER = new SolanaParser([]);
PUMP_AMM_IX_PARSER.addParserFromIdl(
  PUMP_AMM_PROGRAM_ID.toBase58(),
  pumpSwapAmmIdl as Idl
);
// Add ComputeBudget parser to prevent console errors
PUMP_AMM_IX_PARSER.addParserFromIdl(
  COMPUTE_BUDGET_PROGRAM_ID.toBase58(),
  computeBudgetIdl,
);

const PUMP_AMM_EVENT_PARSER = new SolanaEventParser([], console);
PUMP_AMM_EVENT_PARSER.addParserFromIdl(
  PUMP_AMM_PROGRAM_ID.toBase58(),
  pumpSwapAmmIdl as Idl
);

async function handleStream(client: Client, args: SubscribeRequest) {
  // Subscribe for events
   console.log("Subscribing to Token Price Pump AMM transactions...");
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
    if (data?.transaction) {
      const txn = TXN_FORMATTER.formTransactionFromJson(
        data.transaction,
        Date.now()
      );

      const parsedTxn = decodePumpAmmTxn(txn);

      if (!parsedTxn) return;
     const formattedSwapTxn = parseSwapTransactionOutput(parsedTxn,txn);
     if(!formattedSwapTxn) return;
      // console.log(
      //   new Date(),
      //   ":",
      //   `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
      //   // JSON.stringify(formattedSwapTxn.output, null, 2) + "\n",
      //   formattedSwapTxn.transactionEvent
      // );
      // Save or update the latest event for this mint
      pumpswapAggregator.update(formattedSwapTxn.transactionEvent);
      // setTimeout(() => {
      //   console.log("pumpswapAggregator", pumpswapAggregator.getAllStats());
      // }, 30000);
      arbitrageAggregator.updateFromPumpSwap(formattedSwapTxn.transactionEvent);
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
    console.log("reason ==>",reason);
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
    pumpFun: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [PUMP_AMM_PROGRAM_ID.toBase58()],
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

function decodePumpAmmTxn(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;
  try{
  const paredIxs = PUMP_AMM_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta?.loadedAddresses,
  );

  const pumpAmmIxs = paredIxs.filter((ix) =>
    ix.programId.equals(PUMP_AMM_PROGRAM_ID) || ix.programId.equals(new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
  );

  const parsedInnerIxs = PUMP_AMM_IX_PARSER.parseTransactionWithInnerInstructions(tx);

  const pump_amm_inner_ixs = parsedInnerIxs.filter((ix) =>
    ix.programId.equals(PUMP_AMM_PROGRAM_ID) || ix.programId.equals(new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
  );


  if (pumpAmmIxs.length === 0) return;
  const events = PUMP_AMM_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: {pumpAmmIxs,events}, inner_ixs:  pump_amm_inner_ixs };
  bnLayoutFormatter(result);
  return result;
  }catch(err){
  }
}