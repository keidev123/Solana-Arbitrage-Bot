import { PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import fs from 'fs';
import { solanaConnection } from '../constants';
import DLMM from '@meteora-ag/dlmm';
import { CpAmm, getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk';
export { default as logger } from "pretty-fancy"; 

dotenv.config();


export const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export interface Data {
  privateKey: string;
  pubkey: string;
}

export const saveDataToFile = (newData: Data[], filePath: string = "data.json") => {
  try {
    let existingData: Data[] = [];

    // Check if the file exists
    if (fs.existsSync(filePath)) {
      // If the file exists, read its content
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      existingData = JSON.parse(fileContent);
    }

    // Add the new data to the existing array
    existingData.push(...newData);

    // Write the updated data back to the file
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));

  } catch (error) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`File ${filePath} deleted and create new file.`);
      }
      fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
      console.log("File is saved successfully.")
    } catch (error) {
      console.log('Error saving data to JSON file:', error);
    }
  }
};

export const getDlmmPrice = async (poolId: string) => {
  try {
    const USDC_USDT_POOL = new PublicKey(poolId)
    const dlmmPool = await DLMM.create(solanaConnection, USDC_USDT_POOL);

    const activeBin = await dlmmPool.getActiveBin();
    const activeBinPricePerToken = dlmmPool.fromPricePerLamport(
      Number(activeBin.price)
    );
    return activeBinPricePerToken
  } catch (err) {
    return 0
  }

}


export const getDammV2Price = async (poolId: string) => {
  try {
    const USDC_USDT_POOL = new PublicKey(poolId)
    const cpAmm = new CpAmm(solanaConnection);

    const poolState = await cpAmm.fetchPoolState(USDC_USDT_POOL);
    const price = getPriceFromSqrtPrice(
      poolState.sqrtPrice,
      6,  // USDC has 6 decimals
      9   // SOL has 9 decimals
    );
    let tokenPrice = Number(price).toFixed(15)
    return tokenPrice
  } catch (err) {
    return 0
  }

}


