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
import meteoradammV2Idl from "../idl/meteora_dammV2.json";
import { SolanaEventParser } from "../../utils/event-parser";
import { bnLayoutFormatter } from "../../utils/bn-layout-formatter";
import { meteoradammV2TransactionOutput } from "../../utils/dammV2_transaction_output";
import { client } from "../../constants";
import { arbitrageAggregator } from "./arbitrageAggregator";

// Aggregator for Meteora dammV2 events by token mint
export type DammV2TrendingStat = {
  type: string;
  user: string;
  mint: string;
  amount_in: number;
  amount_out: number;
  baseTokenBalance: number;
  quoteTokenBalance: number;
  price: string;
};

export class DammV2Aggregator {
  private tokenStats: Map<string, DammV2TrendingStat> = new Map();

  update(event: DammV2TrendingStat) {
    if (!event || !event.mint) return;
    this.tokenStats.set(event.mint, event);
  }

  getAllStats(): DammV2TrendingStat[] {
    return Array.from(this.tokenStats.values());
  }
}

const dammV2Aggregator = new DammV2Aggregator();
// Start auto-filtering every 10 seconds
// dammV2Aggregator.startAutoFilter(10000);

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
const METEORA_dammV2_PROGRAM_ID = new PublicKey(
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
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

const METEORA_dammV2_IX_PARSER = new SolanaParser([]);
METEORA_dammV2_IX_PARSER.addParserFromIdl(
  METEORA_dammV2_PROGRAM_ID.toBase58(),
  meteoradammV2Idl as Idl,
);
// Add ComputeBudget parser to prevent console errors
METEORA_dammV2_IX_PARSER.addParserFromIdl(
  COMPUTE_BUDGET_PROGRAM_ID.toBase58(),
  computeBudgetIdl,
);

const METEORA_dammV2_EVENT_PARSER = new SolanaEventParser([], console);
METEORA_dammV2_EVENT_PARSER.addParserFromIdl(
  METEORA_dammV2_PROGRAM_ID.toBase58(),
  meteoradammV2Idl as Idl,
);

async function handleStream(client: Client, args: SubscribeRequest) {
  console.log("Streaming Buy Sell events for Meteora_dammV2...");
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
        Date.now(),
      );
      const parsedInstruction = decodeMeteoradammV2(txn);

      if (!parsedInstruction) return;
      const parsedMeteoradammV2 = meteoradammV2TransactionOutput(parsedInstruction, txn)
      if(!parsedMeteoradammV2) return;
      
      // Save or update the latest event for this mint
      dammV2Aggregator.update(parsedMeteoradammV2);
      
      // setTimeout(() => {
      //   console.log("dammV2Aggregator", dammV2Aggregator.getAllStats());
      // }, 30000);
      // Update global arbitrage aggregator
      arbitrageAggregator.updateFromMeteora(parsedMeteoradammV2);
      
      // Uncomment below to see individual transactions
      // console.log(
      //   new Date(),
      //   ":",
      //   `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
      //   JSON.stringify(parsedMeteoradammV2, null, 2) + "\n"
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
    Meteora_dammV2: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [METEORA_dammV2_PROGRAM_ID.toBase58()],
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

export const dammV2Thread = () => {

  subscribeCommand(client, req);
}

function decodeMeteoradammV2(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;
  try{
  const paredIxs = METEORA_dammV2_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta?.loadedAddresses,
  );

  const meteora_dammV2_Ixs = paredIxs.filter((ix) =>
    ix.programId.equals(METEORA_dammV2_PROGRAM_ID) || ix.programId.equals(new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
  );

  const parsedInnerIxs = METEORA_dammV2_IX_PARSER.parseTransactionWithInnerInstructions(tx);

  const meteroa_dammV2_inner_ixs = parsedInnerIxs.filter((ix) =>
    ix.programId.equals(METEORA_dammV2_PROGRAM_ID) || ix.programId.equals(new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
  );


  if (meteora_dammV2_Ixs.length === 0) return;
  const events = METEORA_dammV2_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: meteora_dammV2_Ixs, inner_ixs:  meteroa_dammV2_inner_ixs, events };
  bnLayoutFormatter(result);
  return result;
  }catch(err){
  }
}