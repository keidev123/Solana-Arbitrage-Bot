export function transactionOutput(parsedInstruction: any,txn: any){
    let output = {};
    let mint
    let poolId
    
    const hasSwapInstruction = txn.meta?.logMessages.some((log: any) =>
        log.toLowerCase().includes('instruction: swap')
);

if (!hasSwapInstruction) {
    return;
} else {
        // console.log("🚀 ~ transactionOutput ~ txn:", txn)
        // let instruction = txn?.transaction?.message?.instructions
        // console.log("🚀 ~ transactionOutput ~ instruction:", instruction)
    }
    
    
    // console.log("🚀 ~ transactionOutput ~ instruction:", instruction)

  if(txn.version === 0){
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
      }
    }
  }
  else {
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
      }
    }
  }

  return output;
}