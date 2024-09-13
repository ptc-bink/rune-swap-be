import dotenv from 'dotenv';
import BIP32Factory from "bip32";
import ECPairFactory from 'ecpair';
import { randomBytes } from 'crypto';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";

import { signAndFinalizeTaprootMultisig, TaprootMultisigWallet } from "../service/mutisigWallet";
import { testVersion, threshold } from "../config/config";
import TaprootMultisigModal from '../model/TaprootMultisig';
import { LocalWallet, MultisigWallet, randomWIF } from '../service/localWallet';
import { combinePsbt } from '../service/service';

dotenv.config();
bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);
const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
const rng = (size: number) => randomBytes(size);

const privateKey1: string = process.env.WIF_KEY1 as string;
const privateKey2: string = process.env.WIF_KEY2 as string;
const randomWif: string = randomWIF(testVersion ? 1 : 0);

const MultisigWallet1 = new MultisigWallet(privateKey1 as string, testVersion ? 1 : 0);
const MultisigWallet2 = new MultisigWallet(privateKey2 as string, testVersion ? 1 : 0);
const randomWallet = new MultisigWallet(randomWif as string, testVersion ? 1 : 0);

export const createTaprootMultisig = async () => {
    try {
        const leafPubkey1: Buffer = toXOnly(Buffer.from(MultisigWallet1.pubkey, "hex"));
        const leafPubkey2: Buffer = toXOnly(Buffer.from(MultisigWallet2.pubkey, "hex"));
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
            cosigner: [MultisigWallet1.pubkey, MultisigWallet2.pubkey, randomWallet.pubkey],
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
    } catch (error: any) {
        console.log("error in creating taproot address ==> ", error);
        return {
            success: false,
            message: "There is something error",
            payload: null,
        };
    }
};

export const pushSwapPsbt = async (
    psbt: string,
    userSignedHexedPsbt: string,
    userInputArray: Array<number>,
    multisigInputArray: Array<number>,
    adminAddress: string,
    amount1: number,
    amount2: number,
) => {
    const taprootMultisig = await TaprootMultisigModal.findOne({ address: adminAddress });
    console.log(taprootMultisig);

    if (!taprootMultisig) return {
        success: false,
        message: `${adminAddress} is not existed`,
        payload: "",
    };

    const userSignedPsbt = bitcoin.Psbt.fromHex(userSignedHexedPsbt);

    const tempuserInputArray = [0, 1, 4];
    const tempmultisigInputArray = [2, 3];
    tempuserInputArray.forEach((input: number) => userSignedPsbt.finalizeInput(input));
    // userInputArray.forEach((input: number) => userSignedPsbt.finalizeInput(input));

    console.log("==========================================================================");
    console.log('MultisigWallet2.publickey :>> ', MultisigWallet2.pubkey);
    const adminSignedPsbt1 = await MultisigWallet2.signPsbt(bitcoin.Psbt.fromHex(psbt), {
        autoFinalized: false, inputs: [
            {
                index: 2,
                publicKey: "03df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763",
                disableTweakSigner: true
            },
            {
                index: 3,
                publicKey: "03df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763",
                disableTweakSigner: true
            },
        ]
    });
    // const adminSignedPsbt1 = await MultisigWallet2.signPsbt(bitcoin.Psbt.fromHex(psbt), { autoFinalized: false, inputs: tempmultisigInputArray });

    console.log("==========================================================================");

    // const adminSignedPsbt1 = await adminWallet1.signPsbt(userSignedPsbt, { autoFinalized: false, inputs: multisigInputArray });
    // const adminSignedPsbt2 = await adminWallet2.signPsbt(adminSignedPsbt1, { autoFinalized: false, inputs: multisigInputArray });
    const adminSignedPsbt2 = await MultisigWallet1.signPsbt(adminSignedPsbt1, { autoFinalized: false, inputs: tempmultisigInputArray });
    console.log("==========================================================================");

    const finalizedMultisigPsbt = await signAndFinalizeTaprootMultisig(taprootMultisig, adminSignedPsbt2.toHex(), multisigInputArray);
    console.log("==========================================================================");

    const txId = await combinePsbt(psbt, finalizedMultisigPsbt, userSignedPsbt.toHex());

    if (txId) {
        const result = await TaprootMultisigModal.updateMany(
            { address: adminAddress },
            { $set: { txBuilding: false, assets: { runeAmount1: amount1, runeAmount2: amount2 } } }
        );
        return {
            success: true,
            message: `Push swap psbt successfully`,
            payload: txId,
        };
    } else {
        const result = await TaprootMultisigModal.updateOne(
            { address: adminAddress },
            { $set: { txBuilding: false } }
        );
        return {
            success: false,
            message: `Push swap psbt failed`,
            payload: undefined,
        };
    }
};