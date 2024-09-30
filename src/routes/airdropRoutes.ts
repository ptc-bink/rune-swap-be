import { Router } from 'express';

import {
    addWhielist,
    airdropDifferentAmount,
    generateSendBTCPsbt,
    pushSendBtcTx
} from '../controller/airdropController';
import {
    redeemAddress,
    testFeeRate,
    testVersion,
} from '../config/config';
import { ITreeItem } from '../utils/type';
import { createTreeData } from '../service/tree/createTree';
import { generateSeed, getFeeRate } from '../service/service';
import { whiteList } from '../config/UpdateWhiteList';

const airdropRouter = Router();

airdropRouter.use(async (req, res, next) => {
    console.log(`\nRequest received for ${req.method} ${req.url}`);
    next();
})

// Add white list
airdropRouter.post('/addWhiteList', async (req, res, next) => {
    try {
        const data = whiteList;

        const templist = await addWhielist(data);

        return res.status(200).send(templist);
    } catch (error) {
        console.log('error :>> ', error);
        return res.status(200).send(error);
    }
});

// User send Airdrop Fee BTC
airdropRouter.post('/userSendBtcPsbt', async (req, res, next) => {
    try {
        const { userAddress, userPubkey, adminAddress } = req.body;

        console.log('req.body :>> ', req.body);

        const payload = await generateSendBTCPsbt(userAddress, userPubkey, adminAddress);

        return res.status(200).send(payload);
    } catch (error) {
        console.log('error :>> ', error);
        return res.status(404).send(error)
    }
});

// Broadcast send BTC tx
airdropRouter.post('/pushSendBtcTx', async (req, res, next) => {
    try {
        const { userAddress, adminAddress, rawTx } = req.body;

        const payload = await pushSendBtcTx(userAddress, adminAddress, rawTx);

        return res.status(200).send(payload);
    } catch (error) {
        console.log('error :>> ', error);
        return res.status(404).send(error);
    }
})

// Get fee of runestones to transfer different-amount rune token to different addresses.
airdropRouter.post("/estimate-different-amount", async (req, res, next) => {
    try {
        // Getting parameter from request
        const { size } = req.body;
        const feeRate = testVersion ? testFeeRate : await getFeeRate();

        // Create dummy data based on size
        let data: Array<any> = [];

        for (let i = 0; i < size; i++) {
            testVersion && data.push({
                address: redeemAddress,
                amount: 1,
            });
        }

        const seed: string = await generateSeed();

        // Create tree Data structure
        let treeData: ITreeItem = createTreeData(data, feeRate, seed);

        // log the initial tree data btc utxo
        console.log("BTC UTXO size => ", treeData.utxo_value);

        return res.status(200).send({
            fee: treeData,
        });
    } catch (error: any) {
        console.log(error.message);
        return res.status(500).send({ error: error });
    }
})

export default airdropRouter;