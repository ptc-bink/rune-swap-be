import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import { none, RuneId, Runestone } from "runelib";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

import {
    calculateTxFee,
    combinePsbt,
    delay,
    getBtcUtxoByAddress,
    getFeeRate,
    getRuneUtxoByAddress,
    pushRawTx
} from '../../service/service';
import {
    userRuneId,
    testVersion,
    sendingRate,
    feelimit,
    adminVout1,
    adminVout2,
    userDivisibility,
    testFeeRate,
    STANDARD_RUNE_UTXO_VALUE,
    privateKey1,
    privateKey2,
} from '../../config/config';
import TaprootMultisigModal from "../../model/TaprootMultisig";
import { signAndFinalizeTaprootMultisig, TaprootMultisigWallet } from "../../service/mutisigWallet";
import dotenv from 'dotenv';

const ecc = require("@bitcoinerlab/secp256k1");
bitcoin.initEccLib(ecc);
dotenv.config();

const ECPair = ECPairFactory(ecc);
const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
const keyPair1 = ECPair.fromWIF(privateKey1, network);
const keyPair2 = ECPair.fromWIF(privateKey2, network);

export const generateTransferToOneUser = async (
    userAddress: string,
    sendingAmount: number,
    taprootMultisig: any
) => {
    const multiSigWallet = new TaprootMultisigWallet(
        taprootMultisig.leafPubkeys,
        taprootMultisig.threshold,
        Buffer.from(taprootMultisig.privateKey, "hex"),
        LEAF_VERSION_TAPSCRIPT
      ).setNetwork(network)

    const adminAddress = multiSigWallet.address;

    // Fetch
    const runeUtxos = await getRuneUtxoByAddress(adminAddress, userRuneId);
    const btcUtxos = await getBtcUtxoByAddress(adminAddress);


    const blockNumber = parseInt(userRuneId.split(":")[0]);
    const txOut = parseInt(userRuneId.split(":")[1]);

    const edicts: any = [];

    if (runeUtxos.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, userDivisibility)) {
        return {
            success: false,
            message: "Rune is not enough",
            payload: undefined,
        }
    }

    const psbt = new bitcoin.Psbt({ network })

    let adminTokenSum1 = 0;
    // create admin rune1 utxo input && edict
    for (const runeutxo of runeUtxos.runeUtxos) {
        if (adminTokenSum1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, userDivisibility)) {
            multiSigWallet.addInput(
                psbt,
                runeutxo.txid,
                runeutxo.vout,
                runeutxo.value
            )

            adminTokenSum1 += runeutxo.amount;
        }
    }

    // send admin rune1 to user
    edicts.push({
        id: new RuneId(blockNumber, txOut),
        amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, userDivisibility),
        output: 1,
    })

    // return admin rune1 to admin
    edicts.push({
        id: new RuneId(blockNumber, txOut),
        amount: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, userDivisibility),
        output: 2,
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

    // add rune receiver address
    psbt.addOutput({
        address: adminAddress, // rune admin address
        value: 546,
    });

    const feeRate = testVersion ? testFeeRate * feelimit : await getFeeRate() * feelimit;

    // add btc utxo input
    let totalBtcAmount = 0;
    for (const btcutxo of btcUtxos) {
        const fee = calculateTxFee(psbt, feeRate);
        if (totalBtcAmount < fee && btcutxo.value > 10000) {
            totalBtcAmount += btcutxo.value;

            multiSigWallet.addInput(
                psbt,
                btcutxo.txid,
                btcutxo.vout,
                btcutxo.value
            )
        }
    }
    const fee = calculateTxFee(psbt, feeRate);  // calc entire fee

    psbt.addOutput({
        address: userAddress,
        value: totalBtcAmount - fee
    });

    // Sign real psbt
    for (let i = 0; i < psbt.inputCount; i++) {
        psbt.signInput(i, keyPair1);
        psbt.signInput(i, keyPair2);
    }

    multiSigWallet.addDummySigs(psbt);
    for (let i = 0; i < psbt.inputCount; i++) {
        psbt.finalizeInput(i);
    }

    console.log('psbt :>> ', psbt.toHex());

    // Calculate real transaction fee
    const txHex: any = psbt.extractTransaction().toHex();

    return {
        success: true,
        message: "Generate swap psbt successfully",
        payload: {
            txHex: txHex
        }
    }
};