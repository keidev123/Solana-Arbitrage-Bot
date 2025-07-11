export function transactionOutput(parsedInstruction: any, txn: any) {
  let output = {};

  // Check if we have a swap event
  const swapEvent = parsedInstruction.events?.find(
    (event: any) => event.name === 'Swap'
  );

  if (!swapEvent) return;

  const input_amount = swapEvent.args.params.amount_in;
  console.log("🚀 ~ transactionOutput ~ swapEvent:", swapEvent)

  // Extract basic transaction info
  const signature = txn.transaction.signatures[0];
  const logMessages = txn.meta?.logMessages || [];
  
  // Find the user (first signer)
  let user = '';
  if (txn.transaction.message.staticAccountKeys && txn.transaction.message.staticAccountKeys.length > 0) {
    user = txn.transaction.message.staticAccountKeys[0];
  }
  
  // Find the LB pair from the accounts
  let lbPair = '';
  if (txn.transaction.message.staticAccountKeys) {
    // Look for LB pair in the account keys (usually the second account)
    const accountKeys = txn.transaction.message.staticAccountKeys;
    if (accountKeys.length > 1) {
      lbPair = accountKeys[1]; // LB pair is typically the second account
    }
  }
  
  // Analyze ALL token balances in the transaction, not just user's
  const preTokenBalances = txn.meta.preTokenBalances || [];
  const postTokenBalances = txn.meta.postTokenBalances || [];
  
  console.log("All pre balances:", JSON.stringify(preTokenBalances, null, 2));
  console.log("All post balances:", JSON.stringify(postTokenBalances, null, 2));
  
  // Find the user's token balance changes
  let userPreBalances = preTokenBalances.filter((balance: any) => balance.owner === user);
  let userPostBalances = postTokenBalances.filter((balance: any) => balance.owner === user);
  
  console.log("User:", user);
  console.log("User pre balances:", JSON.stringify(userPreBalances, null, 2));
  console.log("User post balances:", JSON.stringify(userPostBalances, null, 2));
  
  // If user has no balances, try to find the actual user from the transaction
  if (userPreBalances.length === 0 && userPostBalances.length === 0) {
    // Look for any account that has token balance changes
    const allOwners = [...new Set([
      ...preTokenBalances.map((b: any) => b.owner),
      ...postTokenBalances.map((b: any) => b.owner)
    ])];
    
    console.log("All owners with token balances:", allOwners);
    
    // Find the owner that has the most significant balance changes
    let maxChange = 0;
    let actualUser = user;
    
    for (const owner of allOwners) {
      const ownerPre = preTokenBalances.filter((b: any) => b.owner === owner);
      const ownerPost = postTokenBalances.filter((b: any) => b.owner === owner);
      
      // Calculate total balance change
      let totalChange = 0;
      for (const pre of ownerPre) {
        const post = ownerPost.find((p: any) => p.mint === pre.mint);
        if (post) {
          totalChange += Math.abs((post.uiTokenAmount?.uiAmount || 0) - (pre.uiTokenAmount?.uiAmount || 0));
        }
      }
      
      if (totalChange > maxChange) {
        maxChange = totalChange;
        actualUser = owner;
      }
    }
    
    console.log("Actual user found:", actualUser);
    user = actualUser;
    
    // Update user balances
    userPreBalances = preTokenBalances.filter((balance: any) => balance.owner === user);
    userPostBalances = postTokenBalances.filter((balance: any) => balance.owner === user);
  }
  
  // Determine if it's a buy or sell based on SOL balance changes
  const SOL = "So11111111111111111111111111111111111111112";
  const userSolPre = userPreBalances.find((b: any) => b.mint === SOL)?.uiTokenAmount?.uiAmount || 0;
  const userSolPost = userPostBalances.find((b: any) => b.mint === SOL)?.uiTokenAmount?.uiAmount || 0;
  
  console.log("SOL Pre:", userSolPre, "SOL Post:", userSolPost);
  
  // If SOL decreased, it's likely a buy (spending SOL for tokens)
  // If SOL increased, it's likely a sell (receiving SOL for tokens)
  const isBuy = userSolPre > userSolPost;
  const event_type = isBuy ? "Buy" : "Sell";
  
  console.log("Event type:", event_type);
  
  // Calculate amounts from balance changes
  let amountIn = 0;
  let amountOut = 0;
  let mintIn = SOL; // Default to SOL
  let mintOut = ''; // Will be set to the token mint
  
  // Get all non-SOL tokens that changed
  const allTokens = [...new Set([
    ...userPreBalances.map((b: any) => b.mint),
    ...userPostBalances.map((b: any) => b.mint)
  ])].filter(mint => mint !== SOL);
  
  console.log("All tokens:", allTokens);
  
  if (isBuy) {
    // Buying: SOL amount decreased
    amountIn = userSolPre - userSolPost;
    console.log("Buy - SOL amount in:", amountIn);
    
    // Find the token amount received
    for (const tokenMint of allTokens) {
      const tokenPre = userPreBalances.find((b: any) => b.mint === tokenMint)?.uiTokenAmount?.uiAmount || 0;
      const tokenPost = userPostBalances.find((b: any) => b.mint === tokenMint)?.uiTokenAmount?.uiAmount || 0;
      const tokenChange = tokenPost - tokenPre;
      
      if (tokenChange > 0) {
        amountOut = tokenChange;
        mintOut = tokenMint;
        console.log("Buy - Token received:", tokenMint, "Amount:", amountOut);
        break;
      }
    }
  } else {
    // Selling: SOL amount increased
    amountOut = userSolPost - userSolPre;
    console.log("Sell - SOL amount out:", amountOut);
    
    // Find the token amount spent
    for (const tokenMint of allTokens) {
      const tokenPre = userPreBalances.find((b: any) => b.mint === tokenMint)?.uiTokenAmount?.uiAmount || 0;
      const tokenPost = userPostBalances.find((b: any) => b.mint === tokenMint)?.uiTokenAmount?.uiAmount || 0;
      const tokenChange = tokenPre - tokenPost;
      
      if (tokenChange > 0) {
        amountIn = tokenChange;
        mintIn = tokenMint;
        console.log("Sell - Token spent:", tokenMint, "Amount:", amountIn);
        break;
      }
    }
  }

  let price = amountIn / amountOut
  if (!amountOut || amountIn === 0) {
    console.log("Invalid post token balance");
    return;
  }

  const outputTransfer = parsedInstruction.inner_ixs.find(
    (ix: any) =>
      ix.name === "transferChecked" &&
      ix.args && ix.args.amount != input_amount
  );
  
  const tokenPrice = price.toFixed(20).replace(/0+$/, '');
  
  // Create the swap data object
  const swapData = {
    type: event_type,
    user: user,
    mint: mintIn,
    amount_in: input_amount,
    amount_out: outputTransfer && outputTransfer.args ? outputTransfer.args.amount : 0,
    baseTokenBalance: amountIn,
    quoteTokenBalance: amountOut,
    poolId: lbPair,
    price: tokenPrice
  };

  // Return the formatted transaction with swap data
  if (txn.version === 0) {
    output = {
      ...txn,
      meta: {
        ...txn.meta,
        innerInstructions: parsedInstruction.inner_ixs || [],
      },
      transaction: {
        ...txn.transaction,
        message: {
          ...txn.transaction.message,
          compiledInstructions: parsedInstruction.instructions || [],
        },
      },
      swapEvent: swapData
    };
  } else {
    output = {
      ...txn,
      meta: {
        ...txn.meta,
        innerInstructions: parsedInstruction.inner_ixs || [],
      },
      transaction: {
        ...txn.transaction,
        message: {
          ...txn.transaction.message,
          instructions: parsedInstruction.instructions || [],
        },
      },
      swapEvent: swapData
    };
  }

  return swapData;
}