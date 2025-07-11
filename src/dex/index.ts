import DLMM from '@meteora-ag/dlmm'
import { PublicKey } from '@solana/web3.js';
import { solanaConnection } from '../../constants';
import { CpAmm, getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk';


(async() => {
const USDC_USDT_POOL = new PublicKey('H9TVefDVmbK7q7ahpUHBSGhDHDeLDJbU6m9V7JyuuiMJ') // You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
const cpAmm = new CpAmm(solanaConnection);


const poolState = await cpAmm.fetchPoolState(USDC_USDT_POOL);
const price = getPriceFromSqrtPrice(
  poolState.sqrtPrice,
  6,  // USDC has 6 decimals
  9   // SOL has 9 decimals
);
console.log(`Current price: ${price} USDC per SOL`);

})()

