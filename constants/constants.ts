import { Connection } from "@solana/web3.js"
import Client from "@triton-one/yellowstone-grpc"
import dotenv from 'dotenv';

dotenv.config();

export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || ""
export const RPC_WEBSOCKET_ENDPOINT = process.env.RPC_WEBSOCKET_ENDPOINT
export const GEYSER_RPC = process.env.GEYSER_RPC || ""
export const PUMPSWAP_PROGRAM_ADDRESS = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
export const DAMMV2_PROGRAM_ADDRESS = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
export const DLMM_PROGRAM_ADDRESS = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"

export const solanaConnection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
    commitment: 'confirmed',
});

export const client = new Client( GEYSER_RPC, undefined, undefined );