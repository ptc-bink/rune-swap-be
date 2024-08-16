import { Request, Response } from 'express';
import * as bitcoin from "bitcoinjs-lib";
import { isTaprootInput } from "bitcoinjs-lib/src/psbt/bip371.js";
import { ECPairFactory } from "ecpair";
import { none, RuneId, Runestone } from "runelib";
import * as fs from 'fs';

import {
  OPENAPI_UNISAT_TOKEN,
  userRuneId,
  testVersion,
  runeId1,
  runeId2,
  sendingRate,
  SIGNATURE_SIZE,
  feelimit,
  adminVout1,
  adminVout2,
  userDivisibility,
  adminDevisibility1,
  adminDevisibility2,
  feeRate
} from './config/config';
import { IRuneUtxo, IUtxo, WalletTypes } from './utils/type';
import axios from 'axios';
import { LocalWallet, publicKeyToScriptPk } from "../service.ts/localWallet";
import dotenv from 'dotenv';

dotenv.config();
const ecc = require("@bitcoinerlab/secp256k1");
bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);

const privateKey: string = process.env.WIF_KEY as string;

export const adminWallet = new LocalWallet(privateKey as string, testVersion ? 1 : 0);
const adminWalletOutput = publicKeyToScriptPk(adminWallet.pubkey, 2, testVersion ? 1 : 0);

export const OPENAPI_UNISAT_URL = testVersion ? "https://open-api-testnet.unisat.io" : "https://open-api.unisat.io";

const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

export function toPsbtNetwork(networkType: number) {
  if (networkType == 0) {
    return bitcoin.networks.bitcoin;
  } else {
    return bitcoin.networks.testnet;
  }
}

export const delay = (ms: number) => new Promise( resolve => setTimeout(resolve, ms))

export const toXOnly = (pubKey: string) => pubKey.length == 32 ? pubKey : pubKey.slice(1, 33);

function tapTweakHash(pubKey: string, h: any) {
  return bitcoin.crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

function tweakSigner(signer: any, opts: any) {
  if (opts == null) opts = {};
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey = signer.privateKey;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] == 3) {
    privateKey = ecc.privateNegate(privateKey);
  }
  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }
  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

export function publicKeyToPayment(
  publicKey: string,
  type: number,
  networkType: any
) {
  const network = toPsbtNetwork(networkType);
  if (!publicKey) return null;
  const pubkey = Buffer.from(publicKey, "hex");
  if (type == 0) {
    return bitcoin.payments.p2pkh({
      pubkey,
      network,
    });
  } else if (type == 1 || type == 4) {
    return bitcoin.payments.p2wpkh({
      pubkey,
      network,
    });
  } else if (type == 2 || type == 5) {
    return bitcoin.payments.p2tr({
      internalPubkey: pubkey.slice(1, 33),
      network,
    });
  } else if (type == 3) {
    const data = bitcoin.payments.p2wpkh({
      pubkey,
      network,
    });
    return bitcoin.payments.p2sh({
      pubkey,
      network,
      redeem: data,
    });
  }
}

export function publicKeyToAddress(
  publicKey: string,
  type: number,
  networkType: any
) {
  const payment = publicKeyToPayment(publicKey, type, networkType);
  if (payment && payment.address) {
    return payment.address;
  } else {
    return "";
  }
}

const getBtcUtxoByAddress = async (address: string) => {
  const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/utxo-data`;
  const config = {
    headers: {
      Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
    },
  };
  let cursor = 0;
  const size = 5000;
  const utxos: IUtxo[] = [];
  const res = await axios.get(url, { ...config, params: { cursor, size } });
  if (res.data.code === -1) throw "Invalid Address";
  utxos.push(
    ...(res.data.data.utxo as any[]).map((utxo) => {
      return {
        scriptpubkey: utxo.scriptPk,
        txid: utxo.txid,
        value: utxo.satoshi,
        vout: utxo.vout,
      };
    })
  );
  return utxos;
};

// Get Current Network Fee
export const getFeeRate = async () => {
  try {
    const url = `https://mempool.space/${testVersion ? "testnet/" : ""
      }api/v1/fees/recommended`;

    const res = await axios.get(url);

    return res.data.fastestFee;
  } catch (error) {
    console.log("Ordinal api is not working now. Try again later");
    return 40 * 2;
  }
};

export const pushRawTx = async (rawTx: string) => {
  const txid = await postData(
    `https://mempool.space/${testVersion ? "testnet/" : ""}api/tx`,
    rawTx
  );
  console.log("pushed txid", txid);
  return txid;
};

const postData = async (
  url: string,
  json: any,
  content_type = "text/plain",
  apikey = ""
) => {
  while (1) {
    try {
      const headers: any = {};
      if (content_type) headers["Content-Type"] = content_type;
      if (apikey) headers["X-Api-Key"] = apikey;
      const res = await axios.post(url, json, {
        headers,
      });
      return res.data;
    } catch (err: any) {
      const axiosErr = err;
      console.log("push tx error", axiosErr.response?.data);
      if (
        !(axiosErr.response?.data).includes(
          'sendrawtransaction RPC error: {"code":-26,"message":"too-long-mempool-chain,'
        )
      )
        throw new Error("Got an err when push tx");
    }
  }
};

export const finalizePsbtInput = (hexedPsbt: string, inputs: number[]) => {
  const psbt = bitcoin.Psbt.fromHex(hexedPsbt);
  inputs.forEach((input) => psbt.finalizeInput(input));
  return psbt.toHex();
};

// Calc Tx Fee
export const calculateTxFee = (psbt: bitcoin.Psbt, feeRate: number) => {
  const tx = new bitcoin.Transaction();

  for (let i = 0; i < psbt.txInputs.length; i++) {
    const txInput = psbt.txInputs[i];
    tx.addInput(txInput.hash, txInput.index, txInput.sequence);
    tx.setWitness(i, [Buffer.alloc(SIGNATURE_SIZE)]);
  }

  for (let txOutput of psbt.txOutputs) {
    tx.addOutput(txOutput.script, txOutput.value);
  }

  return Math.floor((tx.virtualSize() * feeRate));
};

export const getRuneUtxoByAddress = async (address: string, runeId: string) => {
  const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/runes/${runeId}/utxo`;

  console.log("url===========>", url);

  const config = {
    headers: {
      Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
    },
  };
  let cursor = 0;
  let tokenSum = 0;
  const size = 5000;
  const utxos: IRuneUtxo[] = [];
  const res = await axios.get(url, { ...config, params: { cursor, size } });
  console.log("res.data utxo ==> ");
  console.log(res.data.data.utxo[0].runes);

  if (res.data.code === -1) throw "Invalid Address";
  utxos.push(
    ...(res.data.data.utxo as any[]).map((utxo) => {
      tokenSum += Number(utxo.runes[0].amount);
      return {
        scriptpubkey: utxo.scriptPk,
        txid: utxo.txid,
        value: utxo.satoshi,
        vout: utxo.vout,
        amount: Number(utxo.runes[0].amount),
        divisibility: utxo.runes[0].divisibility,
      };
    })
  );
  cursor += res.data.data.utxo.length;
  return { runeUtxos: utxos, tokenSum };
};

export const getMockContent = async () => {
  let txId, adminRuneAmount1, adminRuneAmount2, txBuilding;
  const content = fs.readFileSync('./src/controller/config/mock.txt', 'utf8');

  const txIdMatch = content.match(/txId\s*=\s*"([^"]+)"/);
  const adminRuneAmount1Match = content.match(/adminRuneAmount1\s*=\s*"([^"]+)"/);
  const adminRuneAmount2Match = content.match(/adminRuneAmount2\s*=\s*"([^"]+)"/);
  const txBuildingMatch = content.match(/txBuilding\s*=\s*"([^"]+)"/);

  if (adminRuneAmount1Match && adminRuneAmount1Match[1]) {
    adminRuneAmount1 = adminRuneAmount1Match[1];
  }
  if (txIdMatch && txIdMatch[1]) {
    txId = txIdMatch[1];
  }
  if (adminRuneAmount2Match && adminRuneAmount2Match[1]) {
    adminRuneAmount2 = adminRuneAmount2Match[1];
  }
  if (txBuildingMatch && txBuildingMatch[1]) {
    txBuilding = txBuildingMatch[1];
  }

  return { content, txId, adminRuneAmount1, adminRuneAmount2, txBuilding }
}

export const updateMockFile = (content: string) => {
  fs.writeFileSync('./src/controller/config/mock.txt', content, 'utf8')
}

export const combinePsbt = async (
  hexedPsbt: string,
  signedHexedPsbt1: string,
  signedHexedPsbt2?: string
) => {
  try {
    const psbt = bitcoin.Psbt.fromHex(hexedPsbt);
    const signedPsbt1 = bitcoin.Psbt.fromHex(signedHexedPsbt1);
    if (signedHexedPsbt2) {
      const signedPsbt2 = bitcoin.Psbt.fromHex(signedHexedPsbt2);
      psbt.combine(signedPsbt1, signedPsbt2);
    } else {
      psbt.combine(signedPsbt1);
    }
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();

    const txId = await pushRawTx(txHex);
    return txId;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const generateRuneSwapPsbt = async (pubkey: string, userAddress: string, userOrdinalPubkey: string, userOrdinalAddress: string, sendingAmount: number, walletType: string) => {
  try {
    const mock = await getMockContent();

    // if (mock.txBuilding as string == "true") {
    //   return {
    //     succss: false,
    //     data: "utxo is on re-building"
    //   }
    // }

    updateMockFile(mock.content.replace('txBuilding = "false"', 'txBuilding = "true"'))

    await delay(20000)

    // Fetch
    const btcUtxos = await getBtcUtxoByAddress(userAddress);

    const userRuneUtxos = await getRuneUtxoByAddress(userAddress, userRuneId);
    // const adminRuneUtxos1 = await getRuneUtxoByAddress(adminWallet.address, runeId1);
    // const adminRuneUtxos2 = await getRuneUtxoByAddress(adminWallet.address, runeId2);

    const adminBlockNumber1 = parseInt(runeId1.split(":")[0]);
    const adminTxout1 = parseInt(runeId1.split(":")[1]);
    const adminBlockNumber2 = parseInt(runeId2.split(":")[0]);
    const adminTxout2 = parseInt(runeId2.split(":")[1]);
    const userBlockNumber = parseInt(userRuneId.split(":")[0]);
    const userTxout = parseInt(userRuneId.split(":")[1]);
    const adminRuneAmount1 = parseInt(mock.adminRuneAmount1 as string)
    const adminRuneAmount2 = parseInt(mock.adminRuneAmount2 as string)

    const edicts: any = [];
    const inputArray: number[] = [];
    let cnt = 0;

    if (userRuneUtxos.tokenSum < sendingAmount*Math.pow(10, userDivisibility) || adminRuneAmount1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) || adminRuneAmount2 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2)) {
    // if (userRuneUtxos.tokenSum < sendingAmount * Math.pow(10, userDivisibility) || adminRuneUtxos1.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) || adminRuneUtxos2.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1)) {
      updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

      return {
        success: false,
        data: "Rune is not enough"
      }
    }

    // Psbt
    const psbt = new bitcoin.Psbt({ network })

    let userTokenSum = 0;

    // create user rune utxo input && edict
    for (const runeutxo of userRuneUtxos.runeUtxos) {
      if (userTokenSum < sendingAmount * Math.pow(10, userDivisibility)) {
        psbt.addInput({
          hash: runeutxo.txid,
          index: runeutxo.vout,
          witnessUtxo: {
            value: runeutxo.value,
            script: Buffer.from(runeutxo.scriptpubkey, "hex")
          },
          tapInternalKey:
            walletType === WalletTypes.XVERSE || walletType === WalletTypes.OKX
              ? Buffer.from(pubkey, "hex")
              : Buffer.from(pubkey, "hex").slice(1, 33)
          // sighashType: bitcoin.Transaction.SIGHASH_ALL,
        });

        inputArray.push(cnt);
        cnt++;
        userTokenSum += runeutxo.amount;
      }
    }

    // send user rune to admin address
    edicts.push({
      id: new RuneId(userBlockNumber, userTxout),
      amount: sendingAmount * Math.pow(10, userDivisibility),
      output: 4,
    })

    // return user rune to user address
    edicts.push({
      id: new RuneId(userBlockNumber, userTxout),
      amount: (userTokenSum - sendingAmount) * Math.pow(10, userDivisibility),
      output: 1,
    });

    // create admin rune1 utxo input && edict
    psbt.addInput({
      hash: mock.txId as string,
      index: adminVout1,
      witnessUtxo: {
        value: 546,
        script: Buffer.from(adminWalletOutput as string, "hex"),
      },
      tapInternalKey: Buffer.from(adminWallet.pubkey, "hex").slice(1, 33),
      // sighashType: bitcoin.Transaction.SIGHASH_ALL,
    });

    // let adminTokenSum1 = 0;

    // // create admin rune1 utxo input && edict
    // for (const runeutxo of adminRuneUtxos1.runeUtxos) {
    //   if (adminTokenSum1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1)) {
    //     psbt.addInput({
    //       hash: runeutxo.txid,
    //       index: runeutxo.vout,
    //       witnessUtxo: {
    //         value: runeutxo.value,
    //         script: Buffer.from(runeutxo.scriptpubkey, "hex")
    //       },
    //       tapInternalKey: Buffer.from(adminWallet.pubkey, "hex").slice(1, 33),
    //       // sighashType: bitcoin.Transaction.SIGHASH_ALL,
    //     });

    //     cnt++;
    //     adminTokenSum1 += runeutxo.amount;
    //   }
    // }

    // send admin rune1 to user
    edicts.push({
      id: new RuneId(adminBlockNumber1, adminTxout1),
      amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
      output: 2,
    })

    // return admin rune1 to admin
    edicts.push({
      id: new RuneId(adminBlockNumber1, adminTxout1),
      amount: adminRuneAmount1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
      // amount: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
      output: 5,
    });

    cnt++;

    // create admin rune1 utxo input && edict
    psbt.addInput({
      hash: mock.txId as string,
      index: adminVout2,
      witnessUtxo: {
        value: 546,
        script: Buffer.from(adminWalletOutput as string, "hex"),
      },
      tapInternalKey: Buffer.from(adminWallet.pubkey, "hex").slice(1, 33),
      // sighashType: bitcoin.Transaction.SIGHASH_ALL,
    });

    // let adminTokenSum2 = 0;

    // // create admin rune1 utxo input && edict
    // for (const runeutxo of adminRuneUtxos2.runeUtxos) {
    //   if (adminTokenSum2 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, userDivisibility)) {
    //     psbt.addInput({
    //       hash: runeutxo.txid,
    //       index: runeutxo.vout,
    //       witnessUtxo: {
    //         value: runeutxo.value,
    //         script: Buffer.from(runeutxo.scriptpubkey, "hex")
    //       },
    //       tapInternalKey: Buffer.from(adminWallet.pubkey, "hex").slice(1, 33),
    //       // sighashType: bitcoin.Transaction.SIGHASH_ALL,
    //     });

    //     cnt++;
    //     adminTokenSum2 += runeutxo.amount;
    //   }
    // }

    cnt++;

    // send admin rune2 to user address
    edicts.push({
      id: new RuneId(adminBlockNumber2, adminTxout2),
      amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
      output: 3,
    })

    // return admin rune2 to admin address
    edicts.push({
      id: new RuneId(adminBlockNumber2, adminTxout2),
      amount: adminRuneAmount2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
      // amount: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
      output: 6,
    });

    const mintstone = new Runestone(
      edicts,
      none(),
      none(),
      none()
    );

    psbt.addOutput({
      script: mintstone.encipher(),
      value: 0,
    });

    psbt.addOutput({
      address: userAddress, // rune user address
      value: 546,
    });

    psbt.addOutput({
      address: userAddress, // rune user address
      value: 546,
    });

    psbt.addOutput({
      address: userAddress, // rune user address
      value: 546,
    });

    // add rune receiver address
    psbt.addOutput({
      address: adminWallet.address, // rune admin address
      value: 546,
    });

    psbt.addOutput({
      address: adminWallet.address, // rune admin address
      value: 546,
    });

    psbt.addOutput({
      address: adminWallet.address, // rune admin address
      value: 546,
    });

    // const feeRate = await getFeeRate();

    // add btc utxo input
    let totalBtcAmount = 0;
    for (const btcutxo of btcUtxos) {
      const fee = feelimit * calculateTxFee(psbt, feeRate);
      if (totalBtcAmount < fee && btcutxo.value > 10000) {
        totalBtcAmount += btcutxo.value;

        psbt.addInput({
          hash: btcutxo.txid,
          index: btcutxo.vout,
          witnessUtxo: {
            script: Buffer.from(btcutxo.scriptpubkey as string, "hex"),
            value: btcutxo.value,
          },
          tapInternalKey:
            walletType === WalletTypes.XVERSE || walletType === WalletTypes.OKX
              ? Buffer.from(pubkey, "hex")
              : Buffer.from(pubkey, "hex").slice(1, 33)
          // sighashType: bitcoin.Transaction.SIGHASH_ALL
        });

        inputArray.push(cnt);
        cnt++;
      }
    }

    const fee = calculateTxFee(psbt, feeRate);
    console.log('feeRate, fee, feeRate * fee :>> ', feeRate, fee, feeRate * fee);
    console.log('totalBtcAmount :>> ', totalBtcAmount);
    console.log('fee :>> ', fee);

    if (totalBtcAmount < fee) {
      updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))
      return {
        success: false,
        data: "BTC balance is not enough"
      }
    };

    psbt.addOutput({
      address: userAddress,
      value: totalBtcAmount - Math.floor(fee * feelimit)
    });

    return {
      success: true,
      data: {
        psbt: psbt.toHex(),
        inputArray: inputArray,
        // amount1: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
        amount1: adminRuneAmount1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
        // amount2: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
        amount2: adminRuneAmount2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
      }
    }
  } catch (error) {
    console.log("error ==> ", error);
  }
};