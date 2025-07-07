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

// Aggregator for Meteora dammV2 events by token mint
export type DammV2TrendingStat = {
  tokenAddress: string;
  sell_volume: number;
  buy_volume: number;
  transaction_count: number;
};

export class DammV2Aggregator {
  private tokenStats: Map<string, DammV2TrendingStat> = new Map();
  private filterInterval: NodeJS.Timeout | null = null;

  update(event: {
    type?: string;
    mint_a?: string;
    mint_b?: string;
    amount_in?: number;
    amount_out?: number;
  }) {
    if (!event || !event.mint_a || !event.mint_b) return;
    
    // Determine which token is the non-SOL token
    const SOL = "So11111111111111111111111111111111111111112";
    const tokenAddress = event.mint_a === SOL ? event.mint_b : event.mint_a;
    
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
      stat.buy_volume += Number(event.amount_in || 0);
    } else if (event.type === 'Sell') {
      stat.sell_volume += Number(event.amount_out || 0);
    }
    stat.transaction_count += 1;
  }

  getAllStats(): DammV2TrendingStat[] {
    return Array.from(this.tokenStats.values());
  }

  startAutoFilter(intervalMs: number = 10000) {
    if (this.filterInterval) clearInterval(this.filterInterval);
    this.filterInterval = setInterval(() => {
      console.log(" ======= TOP INTERMEDIATE MINTS BY VOLUME (DAMMV2) ======= ")
      this.printTable();
      console.log("\n\n NOW UPDATING DATA, WAITING 1 MINUTE ....")
    }, intervalMs);
  }

  stopAutoFilter() {
    if (this.filterInterval) clearInterval(this.filterInterval);
    this.filterInterval = null;
  }

  // Return only tokens where buy_volume > sell_volume
  filterTokenStat(): DammV2TrendingStat[] {
    return Array.from(this.tokenStats.values()).filter(stat => stat.buy_volume > stat.sell_volume);
  }

  // Sort by (buy_volume - sell_volume) descending, then by buy_volume descending
  sortByVolume(): DammV2TrendingStat[] {
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
      console.log("[DammV2Aggregator] No tokens with buy_volume > sell_volume");
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

const dammV2Aggregator = new DammV2Aggregator();
// Start auto-filtering every 10 seconds
dammV2Aggregator.startAutoFilter(10000);

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
      const parsedMeteoradammV2 = meteoradammV2TransactionOutput(parsedInstruction,txn)
      if(!parsedMeteoradammV2) return;
      
      // Update token stats
      dammV2Aggregator.update(parsedMeteoradammV2);
      
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

subscribeCommand(client, req);



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