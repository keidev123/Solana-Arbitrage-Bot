import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor"
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet"
import { Connection, Keypair } from "@solana/web3.js"

import { PumpFun } from "./pumpfun"
import PumpfunIDL from './pumpfun.json'
import { RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, COMMITMENT } from "../../constants"

const connection =  new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: COMMITMENT
})
const provider = new AnchorProvider(connection, new NodeWallet(Keypair.generate()))
setProvider(provider)

export const PumpfunProgram = new Program<PumpFun>(PumpfunIDL as PumpFun, provider)
