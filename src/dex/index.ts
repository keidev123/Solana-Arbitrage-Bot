import DLMM from '@meteora-ag/dlmm'
import { PublicKey } from '@solana/web3.js';
import { solanaConnection } from '../../constants';
import { CpAmm, getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk';


(async() => {
const USDC_USDT_POOL = new PublicKey('ADWjWAGKDrrcdRgSxWYgoVFFda5dXR8XXRikK2bsGwab') // You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
const cpAmm = new CpAmm(solanaConnection);


const poolState = await cpAmm.fetchPoolState(USDC_USDT_POOL);
const price = getPriceFromSqrtPrice(
  poolState.sqrtPrice,
  6,  // USDC has 6 decimals
  9   // SOL has 9 decimals
);
// const dlmmPool = await DLMM.create(solanaConnection, USDC_USDT_POOL);

//     const activeBin = await dlmmPool.getActiveBin();
//     const activeBinPriceLamport = activeBin.price;
//     const activeBinPricePerToken = dlmmPool.fromPricePerLamport(
//       Number(activeBin.price)
//     );
console.log(`Current price: ${price} USDC per SOL`);

})()

