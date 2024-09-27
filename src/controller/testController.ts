import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import { none, RuneId, Runestone } from "runelib";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

import {
    calculateTxFee,
    delay,
    generateSeed,
    getBtcUtxoByAddress,
    getFeeRate,
    getRuneUtxoByAddress,
    pushBTCpmt,
    pushRawTx
} from '../service/service';
import {
    userRuneId,
    testVersion,
    sendingRate,
    feelimit,
    adminVout1,
    adminVout2,
    userDivisibility,
    testFeeRate,
    SPLIT_ADDRESS_SIZE,
} from '../config/config';
import { IMusigAssets, ITreeItem, WalletTypes } from '../utils/type';
import TaprootMultisigModal from "../model/TaprootMultisig";
import { TaprootMultisigWallet } from "../service/mutisigWallet";
import { treeTravelAirdrop } from '../service/tree/treeTravelAirdrop';
import { whiteList } from '../config/UpdateWhiteList';
import { splitData } from '../utils/splitArray';
import { SeedWallet } from '../service/wallet/SeedWallet';
import initializeWallet from '../service/wallet/initializeWallet';
import { networkType } from '../config/config';
import { createTreeData } from '../service/tree/createTree';
import { sendRuneBtcTransaction } from '../service/psbt/sendRuneBtcTransaction';
import app from '../server';

const ecc = require("@bitcoinerlab/secp256k1");
bitcoin.initEccLib(ecc);

const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

export const testGenerateInitialRuneSwapPsbt = async (
    userAddress: string,
    sendingAmount: number,
    adminAddress: string
) => {
    const existTaprootMultisig = {
        "cosigner": [
            "02c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3e",
            "03df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763",
            "03c145bb542ec318216254143a5508f302099d629bfc73bd65e047df341759febb"
        ],
        "threshold": 2,
        "privateKey": "ba3c3c0018c35d58badb2db042fde32981a72605a0e2d8e3dd64e0a6b228d5b3",
        "tapscript": "192",
        "address": "tb1pkuwz63zvn8kk0v8kkxeenfs0uyn5gvpnv3nvtewxt7weaxd0hs0s09zfjf",
        "txBuilding": false,
        "assets": {
            "runeId1": "2818689:38",
            "runeId2": "2818653:56",
            "divisibility1": 0,
            "divisibility2": 0
        },
    }

    const assets = existTaprootMultisig.assets;

    console.log('assets :>> ', assets);

    const pubkeyList = existTaprootMultisig.cosigner;
    const threshold = existTaprootMultisig.threshold;
    const privateKey = existTaprootMultisig.privateKey;

    const adminRuneId1 = assets?.runeId1 as string;
    const adminRuneId2 = assets?.runeId2 as string;
    const adminDivisibility1 = assets?.divisibility1 as number;
    const adminDivisibility2 = assets?.divisibility2 as number;

    const leafPubkeys = pubkeyList.map((pubkey: string) =>
        toXOnly(Buffer.from(pubkey, "hex"))
    )

    const multiSigWallet = new TaprootMultisigWallet(
        leafPubkeys,
        threshold,
        Buffer.from(privateKey, "hex"),
        LEAF_VERSION_TAPSCRIPT
    ).setNetwork(network)

    await delay(20000)

    console.log('multiSigWallet :>> ', multiSigWallet.address);
    console.log('leafPubkeys :>> ', leafPubkeys);

    // Fetch
    const btcUtxos = await getBtcUtxoByAddress(adminAddress);

    const adminRuneUtxos1 = await getRuneUtxoByAddress(adminAddress, adminRuneId1);
    const adminRuneUtxos2 = await getRuneUtxoByAddress(adminAddress, adminRuneId2);

    const adminBlockNumber1 = parseInt(adminRuneId1.split(":")[0]);
    const adminTxout1 = parseInt(adminRuneId1.split(":")[1]);

    const adminBlockNumber2 = parseInt(adminRuneId2.split(":")[0]);
    const adminTxout2 = parseInt(adminRuneId2.split(":")[1]);

    const edicts: any = [];
    const inputArray: number[] = [];
    let cnt = 0;
    const psbt = new bitcoin.Psbt({ network })

    let adminTokenSum1 = 0;
    // create admin rune1 utxo input && edict
    for (const runeutxo of adminRuneUtxos1.runeUtxos) {
        if (adminTokenSum1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1)) {
            multiSigWallet.addInput(
                psbt,
                runeutxo.txid,
                runeutxo.vout,
                runeutxo.value
            )

            cnt++;
            adminTokenSum1 += runeutxo.amount;
        }
    }

    console.log('adminBlockNumber1, adminTxout1 :>> ', adminBlockNumber1, adminTxout1);
    console.log('Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) :>> ', Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1));
    console.log('adminTokenSum1 :>> ', adminTokenSum1);

    // send admin rune1 to user
    edicts.push({
        id: new RuneId(adminBlockNumber1, adminTxout1),
        amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1),
        output: 2,
    })

    // return admin rune1 to admin
    edicts.push({
        id: new RuneId(adminBlockNumber1, adminTxout1),
        amount: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1),
        output: 5,
    });

    let adminTokenSum2 = 0;
    // create admin rune1 utxo input && edict
    for (const runeutxo of adminRuneUtxos2.runeUtxos) {
        if (adminTokenSum2 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, userDivisibility)) {
            multiSigWallet.addInput(
                psbt,
                runeutxo.txid,
                runeutxo.vout,
                runeutxo.value
            )
            cnt++;
            adminTokenSum2 += runeutxo.amount;
        }
    }

    // send admin rune2 to user address
    edicts.push({
        id: new RuneId(adminBlockNumber2, adminTxout2),
        amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility2),
        output: 3,
    })

    console.log('adminBlockNumber2, adminTxout2 :>> ', adminBlockNumber2, adminTxout2);
    console.log('Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2 ):>> ', Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility2));
    console.log('adminTokenSum2 :>> ', adminTokenSum2);
    console.log('sendingAmount :>> ', sendingAmount);
    console.log('sendingRate :>> ', sendingRate);
    console.log('adminDevisibility2 :>> ', adminDivisibility2);
    console.log('adminDevisibility1 :>> ', adminDivisibility1);

    // return admin rune2 to admin address
    edicts.push({
        id: new RuneId(adminBlockNumber2, adminTxout2),
        amount: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility2),
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
        address: adminAddress, // rune admin address
        value: 546,
    });

    psbt.addOutput({
        address: adminAddress, // rune admin address
        value: 546,
    });

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

            inputArray.push(cnt);
            cnt++;
        }
    }

    const fee = calculateTxFee(psbt, feeRate);  // calc entire fee

    if (totalBtcAmount < fee) {
        const result = await TaprootMultisigModal.updateOne(
            { address: adminAddress },
            { $set: { 'txBuilding': false } }
        );

        return {
            success: false,
            data: "BTC balance is not enough"
        }
    };

    psbt.addOutput({
        address: userAddress,
        value: totalBtcAmount - fee
    });

    return {
        success: true,
        data: {
            psbt: psbt.toHex(),
            inputArray: inputArray,
            amount1: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1),
            amount2: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility2),
        }
    }
};

export const testAirdropDifferentAmount = async (
    feeRate: number,
    adminAddress: string
) => {
    if (whiteList.length > SPLIT_ADDRESS_SIZE) {
        return {
            success: false,
            message: `the size of address list is more than ${SPLIT_ADDRESS_SIZE}`,
            payload: undefined
        }
    }

    const taprootMultisig = await TaprootMultisigModal.findOne(
        { address: adminAddress }
    )

    if (!taprootMultisig) {
        return {
            success: false,
            message: `There is no such multisig wallet of ${adminAddress}`,
            payload: undefined
        }
    }

    const pubkeyList = taprootMultisig.cosigner;

    const leafPubkeys = pubkeyList.map((pubkey: string) =>
        toXOnly(Buffer.from(pubkey, "hex"))
    );
    const threshold = taprootMultisig.threshold;
    const privateKey = taprootMultisig.privateKey;

    const multiSigAssets: IMusigAssets = {
        leafPubkeys: leafPubkeys,
        threshold: threshold,
        privateKey: privateKey,
    }

    // First airdrop from master wallet
    app.locals.walletIndex = 0;

    // Split large address data into smaller data array
    let splitDataArray: Array<any> = splitData(whiteList, SPLIT_ADDRESS_SIZE);

    // Array => one item has btc anount, rune token amount
    let bundledDataArray: Array<any> = [];

    // Array => splited treeDataarray
    let treeDataArray: Array<ITreeItem> = [];

    // initialize wallet index global variable
    app.locals.walletIndex = 0;
    // const seed = await generateSeed();
    const seed = "innocent rubber iron method session sentence bus plate stamp assist hub cute";

    for (let i = 0; i < splitDataArray.length; i++) {
        app.locals.walletIndex = i + 1;
        let wallet: SeedWallet = initializeWallet(
            networkType,
            seed,
            app.locals.walletIndex
        );

        // Create tree Data structure
        let treeData: ITreeItem = createTreeData(splitDataArray[i], feeRate, seed);
        treeDataArray.push(treeData);

        console.log('treeData :>> ', treeData);
        console.log("==========================");

        bundledDataArray.push({
            address: wallet.address,
            rune_amount: treeData.total_amount,
            btc_amount: treeData.utxo_value,
        });
    }

    // format wallet index global variable
    app.locals.walletIndex = 0;

    // log the initial tree data btc utxo, total rune token amount
    console.log("bundledDataArray => ", bundledDataArray);

    // Send BTC utxo containing rune token
    const response = await sendRuneBtcTransaction(
        userRuneId,
        bundledDataArray,
        feeRate,
        multiSigAssets,
    );

    // if creating psbt is failed, return 500 error
    if (!response.isSuccess) {
        return {
            success: false,
            message: response.data,
            payload: undefined
        }
    }

    console.log('txHex :>> ', response.payload.txHex);

    const txId = await pushRawTx(response.payload.txHex);

    ////////////////////////////////////////////////////////////////////////////////
    // remove on live version
    // const txId: string = "07dfe41da2981d730e3cc900cfbd9268c7c30fb335df0e2dbd8ee8992a38575e";
    //
    ////////////////////////////////////////////////////////////////////////////////

    console.log("Sent Fee and UTXO Transaction => ", txId);

    for (let i = 0; i < bundledDataArray.length; i++) {
        // First airdrop from master wallet
        app.locals.walletIndex = i + 1;

        treeDataArray[i] = {
            ...treeDataArray[i],
            utxo_txid: txId,
            utxo_vout: i + 2,
        };

        console.log('treeDataArray[i] :>> ', treeDataArray[i]);

        // Start Root tour based on recursive function
        let resultData: ITreeItem = await treeTravelAirdrop(
            treeDataArray[i],
            userRuneId,
            seed
        );

        // log the airdrop result
        console.log(`Congratulations! Different Amount Runestone airdrop Success - ${i + 1} Bunches!`);
    }

    // First airdrop from master wallet
    app.locals.walletIndex = 0;

    return {
        success: true,
        message: "Congratulations! Different Amount Runestone airdrop Success",
        payload: undefined
    }
}