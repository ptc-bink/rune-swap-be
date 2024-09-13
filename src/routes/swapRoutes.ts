import { Router } from 'express';
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import * as bitcoin from 'bitcoinjs-lib'

import { pushRawTx, finalizePsbtInput, combinePsbt } from '../service/service';
import {
    generateInitialRuneSwapPsbt,
    generateRuneSwapPsbt
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

        let data;
        if (existTaprootMultisig?.txId) {
            data = await generateRuneSwapPsbt(userPubkey, userAddress, sendingAmount, adminAddress);
        } else {
            data = await generateInitialRuneSwapPsbt(userPubkey, userAddress, sendingAmount, adminAddress);
        }

        console.log('generate rune swap psbt :>> ', data);

        if (data.success === true) {
            res.status(200).send({ success: true, data: data.data })
        } else if (data.success === false) {
            res.status(200).send({ success: false, data: data.data })
        }
    } catch (error) {
        // TaprootMultisigModal.updateOne(
        //     { address: adminAddress },
        //     { $set: { 'txBuilding': false } }
        // )
        // updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

        console.log(error);
        return res.status(404).send(error)
    }
});

swapRouter.post('/pushPsbt', async (req, res, next) => {
    try {
        const { success, data } = req.body;

        if (success) {
            const { userSignedHexedPsbt, amount1, amount2, inputArray, adminAddress } = data;

            // console.log('userSignedHexedPsbt :>> ', userSignedHexedPsbt);
            const userSignedPsbt = bitcoin.Psbt.fromHex(userSignedHexedPsbt);

            const tempArray = [0, 3];
            tempArray.forEach((input: number) => userSignedPsbt.finalizeInput(input));

            console.log('userSignedPsbt.toHex() :>> ', userSignedPsbt.toHex());

            // // const adminSignedPsbt1 = await adminWallet1.signPsbt(userSignedPsbt, { autoFinalized: false, inputs: [1, 2] });
            const adminSignedPsbt1 = await adminWallet1.signPsbt(userSignedPsbt);

            // console.log('About to finalized :>> ');
            // const adminSignedPsbt2 = await adminWallet2.signPsbt(adminSignedPsbt1);
            // console.log('adminSignedPsbt2 :>> ', adminSignedPsbt2);

            const tx = adminSignedPsbt1.extractTransaction();
            const txHex = tx.toHex();
            const txId = await pushRawTx(txHex);

            console.log('txId :>> ', txId);

            // TaprootMultisigModal.updateMany(
            //     { address: adminAddress },
            //     { $set: { txId: txId, assets: { runeAmount1: amount1, runeAmount2: amount2 } } }
            // )

            res.status(200).send({ data: txId });
        }
        else {
            // updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))
        }
    } catch (error) {
        // updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

        console.log(error);
    }
});

export default swapRouter;
