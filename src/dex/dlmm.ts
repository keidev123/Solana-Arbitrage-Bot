require('dotenv').config();

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
import meteoraDLMMIdlRaw from "../idl/meteora_dlmm.json";
import { SolanaEventParser } from "../../utils/event-parser";
import { bnLayoutFormatter } from "../../utils/bn-layout-formatter";
import { transactionOutput } from "../../utils/transactionOutput";
import { client } from "../../constants";
import { getDlmmPrice } from "../../utils";
import { arbitrageAggregator } from "./arbitrageAggregator";

interface SubscribeRequest {
  accounts: { [key: string]: SubscribeRequestFilterAccounts };
  slots: { [key: string]: SubscribeRequestFilterSlots };
  transactions: { [key: string]: SubscribeRequestFilterTransactions };
  transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions };
  blocks: { [key: string]: SubscribeRequestFilterBlocks };
  blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta };
  entry: { [key: string]: SubscribeRequestFilterEntry };
  commitment?: CommitmentLevel;
  accountsDataSlice: SubscribeRequestAccountsDataSlice[];
  ping?: SubscribeRequestPing;
}

const TXN_FORMATTER = new TransactionFormatter();

const METEORA_DLMM_PROGRAM_ID = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const meteoraDLMMIdl = meteoraDLMMIdlRaw as unknown as Idl;

const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111",
);

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
METEORA_DLMM_IX_PARSER.addParserFromIdl(
  METEORA_DLMM_PROGRAM_ID.toBase58(),
  meteoraDLMMIdl as Idl
);

METEORA_DLMM_IX_PARSER.addParserFromIdl(
  COMPUTE_BUDGET_PROGRAM_ID.toBase58(),
  computeBudgetIdl,
);

const METEORA_DLMM_EVENT_PARSER = new SolanaEventParser([], console);
METEORA_DLMM_EVENT_PARSER.addParserFromIdl(
  METEORA_DLMM_PROGRAM_ID.toBase58(),
  meteoraDLMMIdl as Idl
);

async function handleStream(client: Client, args: SubscribeRequest) {
  const stream = await client.subscribe();

  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on("error", (error) => {
      console.error("Stream error:", error);
      reject(error);
      stream.end();
    });
    stream.on("end", resolve);
    stream.on("close", resolve);
  });

  stream.on("data", async(data) => {
    if (data?.transaction) {
      const txn = TXN_FORMATTER.formTransactionFromJson(
        data.transaction,
        Date.now()
      );


      const parsedInstruction = decodeMeteoraDLMM(txn);
      if (!parsedInstruction) return;

      const tOutput: any = transactionOutput(parsedInstruction, txn);
    //   console.dir(tOutput, { depth: null });
      let instruction = tOutput?.transaction?.message?.instructions

      let poolId = ""
      let mint = ""
      let price
      if (instruction) {
        for ( const ix of instruction ) {
            let programId = ix.programId
            if ( programId == "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo" && (ix.accounts?.length == 17 || ix.accounts?.length == 18) ) {
                poolId = ix.accounts[0].pubkey
                mint = ix.accounts[6].pubkey
                price = await getDlmmPrice(poolId.toString())
                return
            } 
        }
      }

      arbitrageAggregator.updateFromDlmm({
        mint: mint,
        poolId: poolId,
        price: price
      });

    }
  });

  await new Promise<void>((resolve, reject) => {
    stream.write(args, (err: any) => {
      if (!err) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error("Failed to write to stream:", reason);
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

  const parsedIxs = METEORA_DLMM_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta?.loadedAddresses
  );

  const filtered = parsedIxs.filter((ix) =>
    ix.programId.equals(METEORA_DLMM_PROGRAM_ID)
  );

  if (filtered.length === 0) return;

  const events = METEORA_DLMM_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: filtered, events };
  bnLayoutFormatter(result);
  return result;
}
