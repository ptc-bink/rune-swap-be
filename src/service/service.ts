import * as bitcoin from "bitcoinjs-lib";

import {
    OPENAPI_UNISAT_TOKEN,
    testVersion,
    SIGNATURE_SIZE,
} from '../config/config';
import { IRuneUtxo, IUtxo } from '../config/type';
import axios from 'axios';
import { LocalWallet, publicKeyToScriptPk } from "../service/localWallet";
import dotenv from 'dotenv';

const ecc = require("@bitcoinerlab/secp256k1");
bitcoin.initEccLib(ecc);
dotenv.config();

const OPENAPI_UNISAT_URL = testVersion ? "https://open-api-testnet.unisat.io" : "https://open-api.unisat.io";

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// export const toXOnly = (pubKey: string) => pubKey.length == 32 ? pubKey : pubKey.slice(1, 33);

export function toPsbtNetwork(networkType: number) {
    if (networkType == 0) {
        return bitcoin.networks.bitcoin;
    } else {
        return bitcoin.networks.testnet;
    }
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

export const getBtcUtxoByAddress = async (address: string) => {
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