export function parseSwapTransactionOutput(parsedInstruction: any, transaction: any) {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    let price;

    const nonSolBalance = transaction.meta?.preTokenBalances?.find(
        (instruction: any) => instruction.mint != SOL_MINT     
    );
    
    if (!nonSolBalance || !nonSolBalance.uiTokenAmount) {
        // console.log("No non-SOL token balance found in transaction");
        return;
    }
    
    const decimal = nonSolBalance.uiTokenAmount.decimals;

    const swapInstruction = parsedInstruction.instructions.pumpAmmIxs.find(
        (instruction: any) => instruction.name === 'buy' || instruction.name === 'sell'
    );

    if (!swapInstruction) {
        return;
    }

    const baseMintPubkey = swapInstruction.accounts.find((account: any) => account.name === 'base_mint')?.pubkey;

     const parsedEvent = parsedInstruction.instructions.events[0]?.data;
    if (!parsedEvent) {
        console.log("No parsed event data found");
        return;
    }
    
    const pool_base_token_reserves = parsedEvent.pool_base_token_reserves;
    const pool_quote_token_reserves = parsedEvent.pool_quote_token_reserves;

     if(baseMintPubkey === SOL_MINT){
        price = calculatePumpAmmPrice(
            pool_base_token_reserves,
            pool_quote_token_reserves,
            decimal
        );
    }else {
        price = calculatePumpAmmPrice(
            pool_quote_token_reserves,
            pool_base_token_reserves,
            decimal
        );
    }

    const formattedPrice = price.toFixed(20).replace(/0+$/, ''); 

    const signerPubkey = swapInstruction.accounts.find((account: any) => account.name === 'user')?.pubkey;

    const swapAmount = swapInstruction.name === 'sell'
        ? swapInstruction.args?.base_amount_in
        : swapInstruction.args?.base_amount_out;

    const quoteAmount = swapInstruction.name === 'sell'
        ? swapInstruction.args?.min_quote_amount_out
        : swapInstruction.args?.max_quote_amount_in;

    const determineOutAmount = () => {
        if (!transaction.meta.innerInstructions) {
            console.error("No inner instructions found in transaction");
            return null;
        }
         const transferChecked = parsedInstruction.inner_ixs.find(
         (instruction: any) =>
         instruction.name === 'transferChecked' && instruction.args?.amount !== swapAmount)?.args?.amount;
          return transferChecked;
    };
    const determineBuySellEvent = () => {
        const baseMintPubkey = swapInstruction.accounts.find((account: any) => account.name === 'base_mint')?.pubkey;
        const quoteMintPubkey = swapInstruction.accounts.find((account: any) => account.name === 'quote_mint')?.pubkey;

        if (!baseMintPubkey || !quoteMintPubkey) {
            console.error("Base or quote mint not found in swap accounts");
            return { type: "Unknown", mint: null };
        }

        const mint = baseMintPubkey === SOL_MINT ? quoteMintPubkey : baseMintPubkey;
        const eventType = swapInstruction.name === 'buy' ? "Buy" : "Sell";

        return { type: eventType, mint };
    };

    const buySellEvent = determineBuySellEvent();
    if (!buySellEvent.mint) {
        console.log("Could not determine mint for buy/sell event");
        return;
    }
    
    const poolId = swapInstruction.accounts.find((account: any) => account.name === 'pool')?.pubkey || null;
    const base_amount_in = swapInstruction.name === 'sell'
        ? swapInstruction.args?.base_amount_in
        : swapInstruction.args?.base_amount_out;
     
    const amountIn = swapInstruction.name === 'buy'
        ? determineOutAmount()
        : base_amount_in;

    const amountOut = swapInstruction.name === 'sell'
        ? determineOutAmount()
        : base_amount_in;
    const transactionEvent = {
        type: buySellEvent.type,
        user: signerPubkey,
        mint: buySellEvent.mint,
        amount_in: amountIn,
        amount_out: amountOut,
        baseTokenBalance: pool_base_token_reserves,
        quoteTokenBalance: pool_quote_token_reserves,
        poolId: poolId,
        price: formattedPrice
    };


    return { transactionEvent };
}

function calculatePumpAmmPrice(
    pool_base_reserve: number,
    pool_quote_reserve: number,
    decimal : number
): number {
    const base = pool_base_reserve/ 1_000_000_000;;
    const quote = pool_quote_reserve/ Math.pow(10, decimal);
    return base / quote;
}