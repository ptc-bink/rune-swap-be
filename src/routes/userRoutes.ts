import { Router } from 'express';
import { Psbt } from 'bitcoinjs-lib';

import { getMockContent, updateMockFile } from '../config/utils';
import { pushRawTx } from '../service/service';
import { adminWallet, generateInitialRuneSwapPsbt, generateRuneSwapPsbt, } from '../controller/userController';

const useRouter = Router();

useRouter.post('/generatePsbt', async (req, res, next) => {
    const mock = await getMockContent();

    try {
        const { pubkey, address, ordinalPubkey, ordinalAddress, sendingAmount, walletType } = req.body;

        let data
        if (mock.txId) {
            data = await generateRuneSwapPsbt(pubkey, address, ordinalPubkey, ordinalAddress, sendingAmount, walletType);
        } else {
            data = await generateInitialRuneSwapPsbt(pubkey, address, ordinalPubkey, ordinalAddress, sendingAmount, walletType);
        }

        console.log('generate rune swap psbt :>> ', data);

        if (data.success === true) {
            res.status(200).send({ success: true, data: data.data })
        } else if (data.success === false) {
            res.status(200).send({ success: false, data: data.data })
        }
    } catch (error) {
        updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

        console.log(error);
        return res.status(404).send(error)
    }
});

useRouter.post('/pushPsbt', async (req, res, next) => {
    const mock = await getMockContent();

    try {
        const { success, data } = req.body;

        if (success) {
            const { userSignedHexedPsbt, amount1, amount2, inputArray, walletType } = data;

            const userSignedPsbt = Psbt.fromHex(userSignedHexedPsbt);

            inputArray.forEach((input: number) => userSignedPsbt.finalizeInput(input));

            const adminSignedPsbt = await adminWallet.signPsbt(userSignedPsbt);
            console.log("About to finalized ==> ");

            const tx = adminSignedPsbt.extractTransaction();
            const txHex = tx.toHex();
            const txId = await pushRawTx(txHex);
            console.log('txId :>> ', txId);

            const updatedContent = `txId = "${txId}"\n` +
                `adminRuneAmount1 = "${amount1}"\n` +
                `adminRuneAmount2 = "${amount2}"\n` +
                `txBuilding = "false"`

            updateMockFile(mock.content.replace(mock.content, updatedContent))

            res.status(200).send({ data: txId });
        } else {
            updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))
        }
    } catch (error) {
        updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

        console.log(error);
    }
});

export default useRouter;
