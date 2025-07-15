import { getDammV2Price } from "./utils";

export async function meteoradammV2TransactionOutput (parsedInstruction: any, txn: any) {
  let SOL = "So11111111111111111111111111111111111111112"
  let output = {};
  const swapInstruction = parsedInstruction.instructions.find(
    (instruction: any) => instruction.name === 'swap'
  );
  if (!swapInstruction) return;

  
  const input_amount = swapInstruction.args.params.amount_in;
  
  const pool_authority = swapInstruction.accounts.find((a: { name: string; }) => a.name == "pool_authority")?.pubkey;
  const pool = swapInstruction.accounts.find((a: { name: string; }) => a.name == "pool")?.pubkey;
  const mint_a = swapInstruction.accounts.find((a: { name: string; }) => a.name === "token_a_mint")?.pubkey;
  const mint_b = swapInstruction.accounts.find((a: { name: string; }) => a.name === "token_b_mint")?.pubkey;
  const payer = swapInstruction.accounts.find((a: { name: string; }) => a.name === "payer")?.pubkey;
  
  if (!pool_authority || !mint_a || !mint_b || !payer) {
    console.log("Missing required account data in swap instruction");
    return;
  }
  
  let preTokenBalances = txn.meta?.preTokenBalances?.find((a: { owner: any; mint: string; })=> a.owner === pool_authority && a.mint != SOL)?.uiTokenAmount?.uiAmount;
  let preQuoteBalances = txn.meta?.preTokenBalances?.find((a: { owner: any; mint: string; })=> a.owner === pool_authority && a.mint == SOL)?.uiTokenAmount?.uiAmount;
  let postTokenBalance = txn.meta?.postTokenBalances?.find((a: { owner: any; mint: string; })=> a.owner === pool_authority && a.mint != SOL)?.uiTokenAmount?.uiAmount;
  let postBaseBalance = txn.meta?.postTokenBalances?.find((a: { owner: any; mint: string; })=> a.owner === pool_authority && a.mint == SOL)?.uiTokenAmount?.uiAmount;
  
  if (preTokenBalances === undefined || postTokenBalance === undefined || postBaseBalance === undefined) {
    // console.log("Missing token balance data");
    return;
  }
  
  const buy_sell_determiner = preTokenBalances > postTokenBalance ? "Buy" : "Sell";

  let price = postBaseBalance / postTokenBalance
  if (!postTokenBalance || postTokenBalance === 0) {
    console.log("Invalid post token balance");
    return;
  }
  
  let tokenPrice = await getDammV2Price(pool.toString())
   

  const outputTransfer = parsedInstruction.inner_ixs.find(
    (ix: any) =>
      ix.name === "transferChecked" &&
      ix.args && ix.args.amount != input_amount
  );
 
  const event_type = {
    type: buy_sell_determiner,
    user: payer,
    mint: mint_a,
    amount_in: input_amount,
    amount_out: outputTransfer && outputTransfer.args ? outputTransfer.args.amount : 0,
    baseTokenBalance: postTokenBalance,
    quoteTokenBalance: postBaseBalance,
    poolId: pool,
    price: tokenPrice
  };

  if (txn.version === 0) {
    output = {
      ...txn,
      meta: {
        ...txn.meta,
        innerInstructions: parsedInstruction.inner_ixs,
      },
      transaction: {
        ...txn.transaction,
        message: {
          ...txn.transaction.message,
          compiledInstructions: parsedInstruction.instructions,
        },
      },
      buy_sell_event: event_type
    };
  } else {
    output = {
      ...txn,
      meta: {
        ...txn.meta,
        innerInstructions: parsedInstruction.inner_ixs,
      },
      transaction: {
        ...txn.transaction,
        message: {
          ...txn.transaction.message,
          instructions: parsedInstruction.instructions,
        },
      },
      buy_sell_event: event_type
    };
  }

  return event_type;
}
