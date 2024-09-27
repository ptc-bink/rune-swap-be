import { Router } from 'express';
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import * as bitcoin from 'bitcoinjs-lib'

import { pushRawTx, finalizePsbtInput, combinePsbt } from '../service/service';
import {
    generateInitialRuneSwapPsbt,
    generateRuneSwapPsbt,
    pushSwapPsbt,
    updateTxBuildingModal
} from '../controller/swapController';
import { testVersion } from "../config/config";
import { LocalWallet } from "../service/localWallet";
import TaprootMultisigModal from '../model/TaprootMultisig';

const privateKey1: string = process.env.WIF_KEY1 as string;
const privateKey2: string = process.env.WIF_KEY2 as string;

export const adminWallet1 = new LocalWallet(privateKey1 as string, testVersion ? 1 : 0);
export const adminWallet2 = new LocalWallet(privateKey2 as string, testVersion ? 1 : 0);

const swapRouter = Router();

swapRouter.use(async (req, res, next) => {
    console.log('');
    console.log(`Request received for ${req.method} ${req.url}`);
    next();
})

swapRouter.post('/generatePsbt', async (req, res, next) => {
    try {
        const { userPubkey, userAddress, sendingAmount, adminAddress } = req.body;

        const existTaprootMultisig = await TaprootMultisigModal.findOne({
            address: adminAddress
        })

        if (existTaprootMultisig) {
            let payload;
            if (existTaprootMultisig?.txId) {
                payload = await generateRuneSwapPsbt(userPubkey, userAddress, sendingAmount, adminAddress, existTaprootMultisig);
            } else {
                payload = await generateInitialRuneSwapPsbt(userPubkey, userAddress, sendingAmount, adminAddress, existTaprootMultisig);
            }

            console.log('generate rune swap psbt :>> ', payload);

            return res.status(200).send(payload)
        } else {
            return res.status(200).send({
                success: false,
                message: "Musig adress is not existed",
                payload: undefined
            })
        }
    } catch (error) {
        console.log(error);
        return res.status(404).send(error)
    }
});

swapRouter.post('/pushPsbt', async (req, res, next) => {
    try {
        const { psbt, userSignedHexedPsbt, amount1, amount2, userInputArray, multisigInputArray, adminAddress } = req.body;

        const payload = await pushSwapPsbt(psbt, userSignedHexedPsbt, userInputArray, multisigInputArray, adminAddress, amount1, amount2,);

        return res.status(200).send(payload);
    } catch (error) {
        console.log(error);
        return res.status(404).send(error);
    }
});

swapRouter.post('/cancelPushPsbt', async (req, res, next) => {
    try {
        const { adminAddress } = req.body;

        const payload = await updateTxBuildingModal(adminAddress);

        return res.status(200).send(payload);
    } catch (error) {
        console.log(error);
        return res.status(404).send(error);
    }
});

export default swapRouter;
