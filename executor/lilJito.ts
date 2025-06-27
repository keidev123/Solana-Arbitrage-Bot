
import { VersionedTransaction } from "@solana/web3.js";
import base58 from 'bs58';
import axios from "axios";

import { LIL_JIT_ENDPOINT } from "../constants";

export const sendBundle = async (txs: VersionedTransaction[]): Promise<string | undefined>=> {
  const serializedTxs = txs.map(tx => base58.encode(tx.serialize()))
  const config = {
    headers: {
      "Content-Type": "application/json",
    },
  };
  const data = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [serializedTxs],
  };
  axios
    .post(
      LIL_JIT_ENDPOINT,
      data,
      config
    )
    .then(function (response) {
      console.log("🚀 ~ response:", response)
      // handle success
      const bundleId = response.data.result
      console.log("Bundle Id : ", bundleId)
      return bundleId
    })
    .catch((err) => {
      // handle error
      console.log("Error when sending the bundle");
    });
    return undefined
}


export const encodeToBase64Transaction = (transaction: VersionedTransaction): string => {
  // Serialize the transaction and encode it as base64
  const serializedTx = transaction.serialize();
  const base64Tx = Buffer.from(serializedTx).toString('base64');
  return base64Tx
}


export const simulateBundle = async (vTxs: VersionedTransaction[]) => {
  const txs = vTxs.map(tx => encodeToBase64Transaction(tx))
  const config = {
    headers: {
      "Content-Type": "application/json",
    },
  };
  const data = {
    jsonrpc: "2.0",
    id: 1,
    method: "simulateBundle",
    params: [{ "encodedTransactions": txs }],
  };
  axios
    .post(
      LIL_JIT_ENDPOINT,
      data,
      config
    )
    .then(function (response) {
      // handle success
      console.log(response.data);
      console.log(response.data.result.value.transactionResults);
    })
    .catch((err) => {
      // handle error
      console.log(err);
    });
}

export const getBundleStatus = async (bundleId: string) => {
  const config = {
    headers: {
      "Content-Type": "application/json",
    },
  };
  const data = {
    jsonrpc: "2.0",
    id: 1,
    method: "getBundleStatuses",
    params: [[bundleId]],
  };
  axios
    .post(
      LIL_JIT_ENDPOINT,
      data,
      config
    )
    .then(function (response) {
      // handle success
      console.log("\n====================================================================")
      console.log(response.data);
      console.log("====================================================================\n")
    })
    .catch((err) => {
      console.log("Error confirming the bundle result");
    });
}
