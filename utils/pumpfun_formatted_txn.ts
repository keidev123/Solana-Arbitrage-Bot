export function parseSwapTransactionOutput(parsedInstruction: any) {
    const parsedEvent = parsedInstruction.instructions.events[0]?.data;
    // console.log("🚀 ~ parseSwapTransactionOutput ~ parsedEvent:", parsedEvent)
    const supply = 1_000_000_000_000_000;

    const swapInstruction = parsedInstruction.instructions.pumpFunIxs.find(
        (instruction: any) => instruction.name === 'buy' || instruction.name === 'sell'
    );

    if (!swapInstruction) {
        return;
    }

    const bonding_curve = swapInstruction.accounts.find(
        (account: any) => account.name === 'bonding_curve'
    )?.pubkey;

    const virtual_sol_reserves = parsedEvent?.virtual_sol_reserves;
    const virtual_token_reserves = parsedEvent?.virtual_token_reserves;
    const real_sol_reserves = parsedEvent?.real_sol_reserves;
    const real_token_reserves = parsedEvent?.real_token_reserves;
    const mint = parsedEvent?.mint;
    const creator = parsedEvent?.creator;
    const isBuy = parsedEvent?.is_buy;
    const transferSolAmount = parsedEvent?.sol_amount;
    const transferTokenAmount = parsedEvent?.token_amount;

    const price = calculatePumpFunPrice(
        virtual_sol_reserves,
        virtual_token_reserves
    ); // Price in Sol, Multiply with Sol Price To get USD Price
     const tokenPrice = price.toFixed(20).replace(/0+$/, ''); // trims extra trailing zeros

    const output = {
        bonding_curve,
        virtual_sol_reserves,
        virtual_token_reserves,
        real_sol_reserves,
        real_token_reserves,
        mint,
        creator,
        tokenPrice,
        isBuy,
        transferSolAmount,
        transferTokenAmount
    };

    return output;
}

function calculatePumpFunPrice(
    virtualSolReserves: number,
    virtualTokenReserves: number
): number {
    const sol = virtualSolReserves / 1_000_000_000; // convert lamports to SOL
    const tokens = virtualTokenReserves / Math.pow(10, 6);
    return sol / tokens;
}