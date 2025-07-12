import { BorshAccountsCoder } from "@project-serum/anchor";
import * as fs from 'fs';
import base58 from "bs58";
import { bnLayoutFormatter } from "./bn-layout-formatter";
import programIdl from "../src/idl/meteora_dlmm.json";

// Patch for Anchor compatibility
if (!("version" in programIdl)) (programIdl as any).version = programIdl.metadata?.version || "0.1.0";
if (!("name" in programIdl)) (programIdl as any).name = programIdl.metadata?.name || "meteora_dlmm";

const coder = new BorshAccountsCoder(programIdl as any);

/**
 * Deserializes and trims blockchain data to extract relevant information.
 * @param {Object} data - The data object containing blockchain account information.
 * @returns {Object} - An object containing the deserialized signature, public key, owner, and pool state.
 */
export function meteoraDlmmParsedAccount(data: any) {
    try{

    if (!data || !data.account || !data.account.account)return;

      const dataTx = data.account.account;

    // Safely decode each piece of transaction data
    const signature = dataTx.txnSignature ? decodeTransact(dataTx.txnSignature) : null;
    const pubKey = dataTx.pubkey ? decodeTransact(dataTx.pubkey) : null;
    const owner = dataTx.owner ? decodeTransact(dataTx.owner) : null;
    
    let poolstate = null;
    try {
        poolstate = coder.decodeAny(dataTx.data);
        bnLayoutFormatter(poolstate)
    
    } catch (error) {
       // console.error("Failed to decode pool state:", error);
    }

    return {
        signature,
        pubKey,
        owner,
        poolstate
    };
   }catch(error){
   }
}
 function decodeTransact(data: string) {
  return base58.encode(Buffer.from(data, 'base64'));
}