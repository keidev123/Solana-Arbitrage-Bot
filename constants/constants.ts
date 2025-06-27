import { retrieveEnvVariable } from "../utils"

export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY')
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT')
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT')
export const LIL_JIT_ENDPOINT = retrieveEnvVariable('LIL_JIT_ENDPOINT')
export const LIL_JIT_WEBSOCKET_ENDPOINT = retrieveEnvVariable('LIL_JIT_WEBSOCKET_ENDPOINT')
export const BLOCK_ENGINE_URL = retrieveEnvVariable('BLOCK_ENGINE_URL')
export const TX_INTERVAL = Number(retrieveEnvVariable('TX_INTERVAL'))
export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE'))
export const SLIPPAGE = Number(retrieveEnvVariable('SLIPPAGE'))
export const FEE_LEVEL = Number(retrieveEnvVariable('FEE_LEVEL'))
export const PROFIT_LEVEL = Number(retrieveEnvVariable('PROFIT_LEVEL'))
export const JITO_KEY = retrieveEnvVariable('JITO_KEY')
export const JITO_MODE = retrieveEnvVariable('JITO_KEY') === 'true'
export const COMMITMENT = retrieveEnvVariable('COMMITMENT') == "processed" ? "processed" : "confirmed"
