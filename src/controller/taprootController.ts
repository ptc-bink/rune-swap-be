import dotenv from 'dotenv';
import BIP32Factory from "bip32";
import ECPairFactory from 'ecpair';
import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";

import { TaprootMultisigWallet } from "../service/mutisigWallet";
import { testVersion, threshold } from "../config/config";
import TaprootMultisigModal from '../model/TaprootMultisig';
import { LocalWallet, randomWIF } from '../service/localWallet';
import { finalizePsbtInput } from '../service/service';

dotenv.config();
bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);
const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
const rng = (size: number) => randomBytes(size);

const privateKey1: string = process.env.WIF_KEY1 as string;
const privateKey2: string = process.env.WIF_KEY2 as string;
const randomWif: string = randomWIF(testVersion ? 1 : 0);

const adminWallet1 = new LocalWallet(privateKey1 as string, testVersion ? 1 : 0);
const adminWallet2 = new LocalWallet(privateKey2 as string, testVersion ? 1 : 0);
const randomWallet = new LocalWallet(randomWif as string, testVersion ? 1 : 0);

export const createTaprootMultisig = async () => {
    try {
        const leafPubkey1: Buffer = toXOnly(Buffer.from(adminWallet1.pubkey, "hex"));
        const leafPubkey2: Buffer = toXOnly(Buffer.from(adminWallet2.pubkey, "hex"));
        const randomPubkey: Buffer = toXOnly(Buffer.from(randomWallet.pubkey, "hex"));

        const leafKey = bip32.fromSeed(rng(64), network);

        const multiSigWallet = new TaprootMultisigWallet(
            [leafPubkey1, leafPubkey2, randomPubkey],
            threshold,
            leafKey.privateKey!,
            LEAF_VERSION_TAPSCRIPT
        ).setNetwork(
            testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin
        );

        console.log('multiSigWallet.address :>> ', multiSigWallet.address);

        const newTaproot = new TaprootMultisigModal({
            cosigner: [adminWallet1.pubkey, adminWallet2.pubkey, randomWallet.pubkey],
            threshold: threshold,
            privateKey: leafKey.privateKey?.toString("hex"),
            tapscript: LEAF_VERSION_TAPSCRIPT,
            address: multiSigWallet.address,
            txBuilding: false,
            assets: {
                runeId1: '000000:000',
                runeId2: '000000:000',
                divisibility1: 0,
                divisibility2: 0,
            },
        });

        await newTaproot.save();

        return {
            success: true,
            message: "Create Musig Wallet successfully.",
            payload: {
                address: multiSigWallet.address,
            },
        };
    } catch (error: any) {
        console.log("error in creating taproot address ==> ", error);
        return {
            success: false,
            message: "There is something error",
            payload: null,
        };
    }
};

export const signAndFinalizeTaprootMultisig = async (
    id: string,
    psbt: string,
    inputArray: Array<number>,
) => {
    const taprootMultisig = await TaprootMultisigModal.findById(id);
    console.log(taprootMultisig);

    if (!taprootMultisig) return;

    const pubkeyList = taprootMultisig.cosigner;
    const threshold = taprootMultisig.threshold;
    const privateKey = taprootMultisig.privateKey;

    const leafPubkeys = pubkeyList.map((pubkey: string) =>
        toXOnly(Buffer.from(pubkey, "hex"))
    );

    const multiSigWallet = new TaprootMultisigWallet(
        leafPubkeys,
        threshold,
        Buffer.from(privateKey, "hex"),
        LEAF_VERSION_TAPSCRIPT
    ).setNetwork(network);

    const tempPsbt = bitcoin.Psbt.fromHex(psbt);

    multiSigWallet.addDummySigs(tempPsbt);

    const finalizedPsbt = finalizePsbtInput(tempPsbt.toHex(), inputArray);

    return finalizedPsbt;
};