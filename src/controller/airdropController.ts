import * as bitcoin from "bitcoinjs-lib";
import * as ecc from 'tiny-secp256k1';
import BIP32Factory from "bip32";
import ECPairFactory from 'ecpair';
import { randomBytes } from 'crypto';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';

import {
    testFeeRate,
    testVersion,
    userRedeemBTCAmount,
    SPLIT_ADDRESS_SIZE,
    networkType,
    userRuneId,
    NUSDAddress,
} from '../config/config';
import {
    calculateTxFee,
    checkTxConfirmed,
    generateSeed,
    getBtcUtxoByAddress,
    getFeeRate,
    pushRawTx
} from '../service/service';
import {
    IMusigAssets,
    ITreeItem,
    IWhiteList
} from '../utils/type';
import TaprootMultisigModal from '../model/TaprootMultisig';
import WhiteListModal from '../model/Whitelist';
import { splitData } from '../utils/splitArray';
import { SeedWallet } from '../service/wallet/SeedWallet';
import initializeWallet from '../service/wallet/initializeWallet';
import { createTreeData } from '../service/tree/createTree';
import { sendRuneBtcTransaction } from '../service/psbt/sendRuneBtcTransaction';
import { treeTravelAirdrop } from '../service/tree/treeTravelAirdrop';
import app from '../server';
import { RuneId } from "runelib";
import { generateTransferToOneUser } from '../service/psbt/generateAirdropOneTx';

bitcoin.initEccLib(ecc);

const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

export const generateSendBTCPsbt = async (
    userAddress: string,
    userPubkey: string,
    adminAddress: string
) => {
    const taprootMultisig = await TaprootMultisigModal.findOne({
        address: adminAddress
    });

    if (!taprootMultisig) {
        return {
            success: false,
            message: `Musig address ${adminAddress} is not existed`,
            payload: undefined
        }
    }

    const userExisted = await WhiteListModal.findOne({
        address: userAddress
    })

    if (!userExisted) {
        return {
            success: false,
            message: `User ${userAddress} is not existed in whitelist`,
            payload: undefined
        }
    }

    const feeRate = testVersion ? testFeeRate : await getFeeRate();
    const sendBtcAmount = userRedeemBTCAmount * feeRate;

    const psbt = new bitcoin.Psbt({ network: network });

    const btcUtxos = await getBtcUtxoByAddress(userAddress as string);

    psbt.addOutput({
        address: adminAddress,
        value: sendBtcAmount,
    });

    let amount = 0;
    let fee = 0;

    for (const utxo of btcUtxos) {
        fee = calculateTxFee(psbt, feeRate);

        if (amount < fee + sendBtcAmount && utxo.value > 10000) {
            amount += utxo.value;

            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                tapInternalKey: Buffer.from(userPubkey, "hex").slice(1, 33),
                witnessUtxo: {
                    script: Buffer.from(utxo.scriptpubkey as string, "hex"),
                    value: utxo.value,
                },
            });
        }
    }

    fee = calculateTxFee(psbt, feeRate);

    console.log("fee ==> ", fee);

    if (amount < sendBtcAmount + fee)
        throw "You do not have enough bitcoin in your wallet";

    psbt.addOutput({
        address: adminAddress as string,
        value: amount - sendBtcAmount - fee,
    });

    console.log(psbt.toHex());

    return {
        success: true,
        message: "Generate Send BTC psbt successfully",
        payload: psbt
    };
}

export const pushSendBtcTx = async (
    userAddress: string,
    adminAddress: string,
    rawTx: string
) => {
    const psbt = bitcoin.Psbt.fromHex(rawTx);
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txId = await pushRawTx(txHex);

    if (txId) {
        const existingWallet = await TaprootMultisigModal.findOne(
            { address: adminAddress }
        );

        if (existingWallet) {
            const updatingListedUser = await WhiteListModal.findOneAndUpdate(
                {
                    address: userAddress,
                    status: 0
                },
                {
                    status: 1,
                    sendBtcTxId: txId
                }
            )

            if (updatingListedUser) {
                await updatingListedUser.save();

                return {
                    success: true,
                    message: "User send BTC successfully",
                    payload: txId
                };
            } else {
                return {
                    success: false,
                    message: "User is not listed",
                    payload: undefined
                };
            }
        } else {
            return {
                success: false,
                message: "Wallet user send BTC is not existed",
                payload: undefined
            };
        }
    } else {
        return {
            success: false,
            message: "User send BTC Failed",
            payload: undefined
        };
    }
}

export const addWhielist = async (
    data: any,
) => {
    const tempList = data.map(async (item: IWhiteList) => {
        const newUser = new WhiteListModal({
            address: item.address,
            amount: item.amount,
            status: 0,
        });

        await newUser.save();
    })

    return {
        success: true,
        message: "Insert whitelist successfully",
        payload: undefined
    }

}

export const checkTxStatus = async () => {
    let msg = "";

    // Check claimed user's sendBTC tx confirmed and update status as 2
    const claimedUserList: IWhiteList[] = await WhiteListModal.find({
        status: 1
    })

    if (!claimedUserList.length) {
        msg += 'There is no claimed users\n';
        console.log("There is no claimed users");

    } else {
        claimedUserList.map(async (item: IWhiteList) => {
            const confirmed = await checkTxConfirmed(item.sendBtcTxId);

            if (confirmed) {
                const updateClaimedUser = await WhiteListModal.findOneAndUpdate(
                    { address: item.address, status: 1 },
                    {
                        status: 2,
                    }
                )

                await updateClaimedUser?.save();
            }
        })
    }

    // Check paid user's tx confirmed and update status as 3
    const paidUserList: IWhiteList[] = await WhiteListModal.find({
        status: 2
    })

    if (!paidUserList.length) {
        msg += "There is no paid users\n";
        console.log("There is no paid users");

    } else {
        const airdropingList: Array<any> = paidUserList.map((item: IWhiteList) => {
            return {
                address: item.address,
                amount: item.amount
            }
        })

        const payload = await airdropDifferentAmount(airdropingList);

        if (payload.success) {
            const txId = payload.payload;

            // Update status 3 and insert txId
            airdropingList.map(async (item: IWhiteList) => {
                const updateAirdroppedUserList = await WhiteListModal.findOneAndUpdate(
                    {
                        address: item.address,
                        status: 2
                    },
                    {
                        receiveRuneTxId: txId,
                        status: 3
                    }
                )

            })
        } else {
            msg += `${payload.message}\n`
        }
    }

    // Check airdrop tx confirmed and update status as 4
    const sendRuneUserList: IWhiteList[] = await WhiteListModal.find({
        status: 3
    })

    if (!sendRuneUserList.length) {
        console.log("There is no send rune users");

        msg += "There is no send rune users\n";
    } else {
        sendRuneUserList.map(async (item: IWhiteList) => {
            const confirmed = await checkTxConfirmed(item.receiveRuneTxId);

            if (confirmed) {
                const updateSendRuneUserList = await WhiteListModal.findOneAndUpdate(
                    {
                        address: item.address,
                        status: 3
                    },
                    {
                        status: 4,
                    }
                )

                await updateSendRuneUserList?.save();
            }
        })
    }

    console.log('check transaction status :>>>> ', msg);
    return msg;
}

export const airdropDifferentAmount = async (
    whiteList: Array<any>
) => {
    const feeRate = testVersion ? testFeeRate : await getFeeRate();
    const adminAddress = NUSDAddress;

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

    if (whiteList.length === 1) {
        const res = await generateTransferToOneUser(whiteList[0].address, whiteList[0].amount, multiSigAssets)

        if (res.success) {
            const txId = await pushRawTx(res.payload?.txHex);

            console.log("Sent Fee and UTXO Transaction => ", txId);

            return txId;
        }
    }

    // Split large address data into smaller data array
    let splitDataArray: Array<any> = splitData(whiteList, SPLIT_ADDRESS_SIZE);

    // Array => one item has btc anount, rune token amount
    let bundledDataArray: Array<any> = [];

    // Array => splited treeDataarray
    let treeDataArray: Array<ITreeItem> = [];

    // initialize wallet index global variable
    app.locals.walletIndex = 0;
    const seed = await generateSeed();
    // const seed = "innocent rubber iron method session sentence bus plate stamp assist hub cute";

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
        payload: txId
    }
}