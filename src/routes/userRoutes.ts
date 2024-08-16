import { Router } from 'express';
import { adminWallet, getMockContent, pushRawTx, generateRuneSwapPsbt, updateMockFile } from '../controller/userController';
import { Psbt } from 'bitcoinjs-lib';

const useRouter = Router();

useRouter.post('/generatePsbt', async (req, res, next) => {
    try {
        const { pubkey, address, ordinalPubkey, ordinalAddress, sendingAmount, walletType } = req.body;

        const data = await generateRuneSwapPsbt(pubkey, address, ordinalPubkey, ordinalAddress, sendingAmount, walletType);

        console.log('data :>> ', data);

        if (data?.success) {
            res.status(200).send({ data: data.data })
        } else {
            res.status(404).send({ data: data?.data })
        }
    } catch (error) {
        const mock = await getMockContent();

        updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

        console.log(error);
    }
});

useRouter.post('/pushPsbt', async (req, res, next) => {
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

            const mock = await getMockContent();
            const updatedContent = `txId = "${txId}"\n` +
                `adminRuneAmount1 = "${amount1}"\n` +
                `adminRuneAmount2 = "${amount2}"\n` +
                `txBuilding = "false"`

            updateMockFile(mock.content.replace(mock.content, updatedContent))

            res.status(200).send({ data: txId });
        }
    } catch (error) {
        const mock = await getMockContent();

        updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

        console.log(error);
    }
});

export default useRouter;
