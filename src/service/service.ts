import * as bitcoin from "bitcoinjs-lib";

import {
    OPENAPI_UNISAT_TOKEN,
    testVersion,
    SIGNATURE_SIZE,
    OPENAPI_UNISAT_URL,
    testFeeRate
} from '../config/config';
import { IRuneUtxo, ITXSTATUS, IUtxo } from '../utils/type';
import axios, { AxiosResponse } from 'axios';
import { none, RuneId, Runestone } from "runelib";
import * as bip39 from 'bip39';

const ecc = require("@bitcoinerlab/secp256k1");
bitcoin.initEccLib(ecc);

const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
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

// Get rune balance using unisat api
export const getRuneBalanceByAddress = async (rune_id: string, address: string) => {
    try {

        const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/runes/${rune_id}/balance`;

        const config = {
            headers: {
                Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
            },
        };

        let balance: number = 0;

        const res = await axios.get(url, config);

        if (res.data.code === -1) throw "Invalid Address";
        else {
            balance = res.data.data.amount;
        }
        return balance;
    } catch (err) {
        console.log(err);
    }
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

export const pushBTCpmt = async (rawtx: any) => {
    // delay 250 ms to prevent transaction push limit
    delay(250);

    const txid = await postData(
        `https://mempool.space/${testVersion ? "testnet/" : ""}api/tx`,
        rawtx
    );

    return txid;
};

export async function getDummyFee(sendingAmount: number) {
    const feeRate = 1;

    const runeUtxos = {
        runeUtxos: [
            {
                scriptpubkey: '5120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6',
                txid: 'bd92394d73429bd6356c734c75eac673100b776c11a7199c9cadfb599b8c7ae1',
                value: 546,
                vout: 1,
                amount: 500,
                divisibility: 0
            },
            {
                scriptpubkey: '5120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6',
                txid: 'dd92394d73429bd6356c734c75eac673100b776c11a7199c9cadfb599b8c7ae1',
                value: 546,
                vout: 1,
                amount: 500,
                divisibility: 0
            },
            {
                scriptpubkey: '5120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6',
                txid: 'cd92394d73429bd6356c734c75eac673100b776c11a7199c9cadfb599b8c7ae1',
                value: 546,
                vout: 1,
                amount: 500,
                divisibility: 0
            }],
        tokenSum: 500
    };

    const btcUtxos = [
        {
            scriptpubkey: '5120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6',
            txid: '12eec183159fa1b1e0054c7a8c2915a4bd00c30b8961cde05ead11ad20a18f24',
            value: 3608651,
            vout: 3
        }
    ]

    const psbt = new bitcoin.Psbt({ network });

    const edicts: any = [];

    let fee;

    let tokenSum = 0;

    // create rune utxo input && edict
    for (const runeutxo of runeUtxos.runeUtxos) {

        if (tokenSum < sendingAmount) {
            psbt.addInput({
                hash: runeutxo.txid,
                index: runeutxo.vout,
                tapInternalKey: Buffer.from("03678b5f94666fa167dc90efa49e037ba2a2fb4d0fd56c8df1a0a505882b3d1e6e", "hex").slice(1, 33),
                witnessUtxo: {
                    value: runeutxo.value,
                    script: Buffer.from(runeutxo.scriptpubkey, "hex")
                },
            });
            tokenSum += runeutxo.amount;
        }
    }
    edicts.push({
        id: new RuneId(2818689, 38),
        amount: sendingAmount,
        output: 2,
    })

    edicts.push({
        id: new RuneId(2818689, 38),
        amount: tokenSum - sendingAmount,
        output: 1,
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
        address: "tb1pw7dtq290mkjq36q3yv5h2s3wz79k2696zftd0ctsydruwjxktlrs8x8cmh", // rune sender address
        value: 546,
    });

    // add rune receiver address
    psbt.addOutput({
        address: "tb1p2vw4xepu6glhrtt62m7pjs2exmvmesytmsmc4zce8tym9elfyxnq6506a5", // rune receiver address
        value: 546,
    });

    // add btc utxo input
    let totalBtcAmount = 0;
    for (const btcutxo of btcUtxos) {
        const fee = calculateTxFee(psbt, feeRate);
        if (
            totalBtcAmount < fee &&
            btcutxo.value > 10000
        ) {
            totalBtcAmount += btcutxo.value;

            psbt.addInput({
                hash: btcutxo.txid,
                index: btcutxo.vout,
                tapInternalKey: Buffer.from("03678b5f94666fa167dc90efa49e037ba2a2fb4d0fd56c8df1a0a505882b3d1e6e", "hex").slice(1, 33),
                witnessUtxo: {
                    script: Buffer.from(btcutxo.scriptpubkey as string, "hex"),
                    value: btcutxo.value,
                },
            });
        }
    }

    fee = calculateTxFee(psbt, feeRate);

    console.log("Pay Fee =====================>", fee);

    if (totalBtcAmount < fee) throw "BTC balance is not enough";

    console.log("totalBtcAmount ====>", totalBtcAmount);

    psbt.addOutput({
        address: "tb1p2vw4xepu6glhrtt62m7pjs2exmvmesytmsmc4zce8tym9elfyxnq6506a5",
        value: 10000
    })
    psbt.addOutput({
        address: "tb1pw7dtq290mkjq36q3yv5h2s3wz79k2696zftd0ctsydruwjxktlrs8x8cmh",
        value: 10000
    })

    fee = calculateTxFee(psbt, feeRate);


    console.log("psbt ============>", psbt.toHex());
    console.log('fee :>> ', fee);


    return fee;
}

export const checkTxConfirmed = async (txid: string) => {
    const url = `https://mempool.space/${testVersion ? "testnet/" : ""}api/tx/${txid}`;

    console.log("txid ===>", txid);


    const response: AxiosResponse = await axios.get(url);

    const data: ITXSTATUS = response.data !== "Transaction not found"
        ? response.data.status
        : undefined;

    console.log("status :", data, "======>", data.confirmed);

    if (data.confirmed) {
        return true;
    } else {
        console.log(`Transaction ${txid} is not yet confirmed.`)
        return false;
    }
}

// Generate a seed key
export const generateSeed = async () => {
    const mnemonic = bip39.generateMnemonic();

    return  mnemonic;
}