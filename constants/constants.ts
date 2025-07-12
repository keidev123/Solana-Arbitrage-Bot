import { Connection } from "@solana/web3.js"
import { retrieveEnvVariable } from "../utils"
import Client from "@triton-one/yellowstone-grpc"
import dotenv from 'dotenv';

dotenv.config();

export const PRIVATE_KEY = process.env.PRIVATE_KEY
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || ""
export const RPC_WEBSOCKET_ENDPOINT = process.env.RPC_WEBSOCKET_ENDPOINT
export const LIL_JIT_ENDPOINT = process.env.LIL_JIT_ENDPOINT
export const LIL_JIT_WEBSOCKET_ENDPOINT = process.env.LIL_JIT_WEBSOCKET_ENDPOINT
export const BLOCK_ENGINE_URL = process.env.BLOCK_ENGINE_URL
export const TX_INTERVAL = Number(process.env.TX_INTERVAL)
export const JITO_FEE = Number(process.env.JITO_FEE)
export const SLIPPAGE = Number(process.env.SLIPPAGE)
export const FEE_LEVEL = Number(process.env.FEE_LEVEL)
export const PROFIT_LEVEL = Number(process.env.PROFIT_LEVEL)
export const JITO_KEY = process.env.JITO_KEY
export const JITO_MODE = process.env.JITO_KEY === 'true'
export const COMMITMENT = process.env.COMMITMENT == "processed" ? "processed" : "confirmed"

export const GEYSER_RPC = process.env.GEYSER_RPC
export const PUMPFUN_PROGRAM_ADDRESS = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
export const filterTime = 60000

export const solanaConnection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
    commitment: 'confirmed',
});

export const client = new Client( "https://grpc.solanavibestation.com", undefined, undefined );
// export const client = new Client( "https://basic.grpc.solanavibestation.com", 'a74b5439be597b1c1e295eb4ac066904', undefined );
// export const client = new Client( "https://grpc-ams-3.erpc.global", '2cd69a80-faa3-43fc-9991-6260d99ac3a7', undefined );