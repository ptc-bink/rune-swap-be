import dotenv from 'dotenv';
import BIP32Factory from "bip32";
import ECPairFactory from 'ecpair';
import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";

import { signAndFinalizeTaprootMultisig, TaprootMultisigWallet } from "../service/mutisigWallet";
import { privateKey1, privateKey2, testVersion, threshold } from "../config/config";
import TaprootMultisigModal from '../model/TaprootMultisig';
import { LocalWallet, randomWIF } from '../service/localWallet';
import { combinePsbt } from '../service/service';

dotenv.config();
bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);
const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
const rng = (size: number) => randomBytes(size);

const randomWif: string = randomWIF(testVersion ? 1 : 0);

const LocalWallet1 = new LocalWallet(privateKey1 as string, testVersion ? 1 : 0);
const LocalWallet2 = new LocalWallet(privateKey2 as string, testVersion ? 1 : 0);
const randomWallet = new LocalWallet(randomWif as string, testVersion ? 1 : 0);

export const createTaprootMultisig = async (
    runeId1: string,
    runeId2: string,
    adminDivisibility1: string,
    adminDivisibility2: string
) => {
    if (!runeId1 || !runeId2 || !adminDivisibility1 || !adminDivisibility2) {
        return {
            success: false,
            message: "All info not provided",
            payload: undefined
        }
    }

    const leafPubkey1: Buffer = toXOnly(Buffer.from(LocalWallet1.pubkey, "hex"));
    const leafPubkey2: Buffer = toXOnly(Buffer.from(LocalWallet2.pubkey, "hex"));
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
        cosigner: [LocalWallet1.pubkey, LocalWallet2.pubkey, randomWallet.pubkey],
        threshold: threshold,
        privateKey: leafKey.privateKey?.toString("hex"),
        tapscript: LEAF_VERSION_TAPSCRIPT,
        address: multiSigWallet.address,
        txBuilding: false,
        assets: {
            runeId1: runeId1,
            runeId2: runeId2,
            divisibility1: adminDivisibility1,
            divisibility2: adminDivisibility2,
            runeAmount1: 0,
            runeAmount2: 0,
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
};
