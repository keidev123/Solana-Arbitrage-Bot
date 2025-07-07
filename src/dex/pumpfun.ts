import "dotenv/config";
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
import { bnLayoutFormatter } from "../../utils/bn-layout-formatter";
import pumpFunAmmIdl from "../idl/pumpfun-new.json";
import { parseSwapTransactionOutput } from "../../utils/pumpfun_formatted_txn";
import { SolanaEventParser } from "../../utils/event-parser";
import { filterTime } from "../../constants";

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
const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
const PUMP_FUN_IX_PARSER = new SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunAmmIdl as Idl
);
const PUMP_FUN_EVENT_PARSER = new SolanaEventParser([], console);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunAmmIdl as Idl
);

// Aggregator for swap events by token mint
export type PumpfunTrendingStat = {
  tokenAddress: string;
  sell_volume: number;
  buy_volume: number;
  real_token_reserves: number;
  real_sol_reserves: number;
};

export class PumpfunAggregator {
  private tokenStats: Map<string, PumpfunTrendingStat> = new Map();
  private filterInterval: NodeJS.Timeout | null = null;

  update(event: {
    mint?: string;
    isBuy?: boolean;
    transferTokenAmount?: number | string;
    real_token_reserves?: number;
    real_sol_reserves?: number;
  }) {
    if (!event || !event.mint) return;
    const tokenAddress = event.mint;
    let stat = this.tokenStats.get(tokenAddress);
    if (!stat) {
      stat = {
        tokenAddress,
        sell_volume: 0,
        buy_volume: 0,
        real_token_reserves: 0,
        real_sol_reserves: 0,
      };
      this.tokenStats.set(tokenAddress, stat);
    }
    if (event.isBuy) {
      stat.buy_volume += Number(event.transferTokenAmount || 0);
    } else {
      stat.sell_volume += Number(event.transferTokenAmount || 0);
    }
    stat.real_token_reserves = event.real_token_reserves || 0;
    stat.real_sol_reserves = event.real_sol_reserves || 0;
  }

  getAllStats(): PumpfunTrendingStat[] {
    return Array.from(this.tokenStats.values());
  }

  startAutoFilter(intervalMs: number) {
    if (this.filterInterval) clearInterval(this.filterInterval);
    this.filterInterval = setInterval(() => {
      const filteredStats = this.filterTokenStat();
      console.log(" Filtered stats :", JSON.stringify(filteredStats, null, 2));
      // You can emit, save, or otherwise use the filtered stats here
    }, intervalMs);
  }

  stopAutoFilter() {
    if (this.filterInterval) clearInterval(this.filterInterval);
    this.filterInterval = null;
  }

  // Return only tokens where buy_volume > sell_volume
  filterTokenStat(): PumpfunTrendingStat[] {
    return Array.from(this.tokenStats.values()).filter(stat => stat.buy_volume > stat.sell_volume);
  }

  // Sort by (buy_volume - sell_volume) descending, then by buy_volume descending
  sortByVolume(): PumpfunTrendingStat[] {
    return this.filterTokenStat().sort((a, b) => {
      const diffA = a.buy_volume - a.sell_volume;
      const diffB = b.buy_volume - b.sell_volume;
      if (diffB !== diffA) return diffB - diffA;
      return b.buy_volume - a.buy_volume;
    });
  }
}

const pumpfunAggregator = new PumpfunAggregator();
// Start auto-filtering every 1 minute
pumpfunAggregator.startAutoFilter(filterTime);

async function handleStream(client: Client, args: SubscribeRequest) {
  // Subscribe for events
  console.log("Streaming ...");
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
      // console.log("🚀 ~ stream.on ~ txn:", txn)

      const parsedTxn = decodePumpFunTxn(txn);
      // console.log("🚀 ~ stream.on ~ parsedTxn:", parsedTxn)

      if (!parsedTxn) return;
      const formattedSwapTxn = parseSwapTransactionOutput(parsedTxn);
      // Aggregate event data
      if (formattedSwapTxn) {
        pumpfunAggregator.update(formattedSwapTxn);
      }
      // Optionally, log the current state
      console.log(
        new Date(),
        ":",
        `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
        JSON.stringify(formattedSwapTxn, null, 2) + "\n"
      );
      console.log(
        "Current Aggregated Stats:",
        JSON.stringify(pumpfunAggregator.getAllStats(), null, 2)
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

const client = new Client( "https://grpc.solanavibestation.com", undefined, undefined );

const req: SubscribeRequest = {
  accounts: {},
  slots: {},
  transactions: {
    pumpFun: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58()],
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

function decodePumpFunTxn(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;
  try{
  const paredIxs = PUMP_FUN_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta?.loadedAddresses,
  );

  // console.log("🚀 ~ decodePumpFunTxn ~ paredIxs:", paredIxs)
  const pumpFunIxs = paredIxs.filter((ix) =>
    ix.programId.equals(PUMP_FUN_PROGRAM_ID) || ix.programId.equals(new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
  );

  const parsedInnerIxs = PUMP_FUN_IX_PARSER.parseTransactionWithInnerInstructions(tx);

  const pumpfun_amm_inner_ixs = parsedInnerIxs.filter((ix) =>
    ix.programId.equals(PUMP_FUN_PROGRAM_ID) || ix.programId.equals(new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
  );


  if (pumpFunIxs.length === 0) {
    console.log(" =======1======= ")
return;
  }
  const events = PUMP_FUN_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: {pumpFunIxs,events}, inner_ixs:  pumpfun_amm_inner_ixs };
  bnLayoutFormatter(result);
  return result;
  }catch(err){
  }
}
