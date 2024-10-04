import { Router } from 'express';
import * as bitcoin from 'bitcoinjs-lib'
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { LEAF_VERSION_TAPSCRIPT } from 'bitcoinjs-lib/src/payments/bip341';

import { pushRawTx, finalizePsbtInput, combinePsbt, getDummyFee, pushBTCpmt, generateSeed } from '../service/service';
import {
    generateInitialRuneSwapPsbt,
    generateRuneSwapPsbt
} from '../controller/swapController';
import { networkType, redeemAddress, SPLIT_ADDRESS_SIZE, testVersion, userRuneId } from "../config/config";
import { LocalWallet } from "../service/localWallet";
import TaprootMultisigModal from '../model/TaprootMultisig';
import { testGenerateInitialRuneSwapPsbt } from '../controller/testController';
import { TaprootMultisigWallet } from '../service/mutisigWallet';
import { ITreeItem, IWhiteList } from '../utils/type';
import { treeTravelAirdrop } from '../service/tree/treeTravelAirdrop';
import app from '../server';
import { createTreeData } from '../service/tree/createTree';
import { checkTxStatus, airdropDifferentAmount } from '../controller/airdropController';
import WhiteListModal from '../model/Whitelist/index';

const privateKey1: string = process.env.WIF_KEY1 as string;
const privateKey2: string = process.env.WIF_KEY2 as string;

export const adminWallet1 = new LocalWallet(privateKey1 as string, testVersion ? 1 : 0);
export const adminWallet2 = new LocalWallet(privateKey2 as string, testVersion ? 1 : 0);

const testRouter = Router();

testRouter.use(async (req, res, next) => {
    console.log('');
    console.log(`Request received for ${req.method} ${req.url}`);
    next();
})

testRouter.get('/test', async (req, res, next) => {
    try {
        res.status(200).send("test successfully");
    } catch (error) {
        res.status(404).send(error);
    }
})

testRouter.post('/testPushPsbt', async (req, res, next) => {
    try {
        // const { userSignedHexedPsbt } = req.body;
        const originalPsbt = '70736274ff0100fdd2010200000003248fa120ad11ad5ee0cd61890bc300bda415298c7a4c05e0b1a19f1583c1ee120200000000ffffffffdcd9c11d362aa5637d38a19e3695dadd3dcb7c658cf3bad8a1a14d069985b5390200000000ffffffff4cd189d233c66defd6dd2d4ac64b504ed394184abe4cdb1b266957388cf18fd20000000000ffffffff080000000000000000176a5d1400dd84ac013809030000290624260902000029052202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a62202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a62202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a62202000000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f2202000000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f2202000000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f6064400000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6000000000001012b220200000000000022512096cd17a1b4a892e594a101974360af08ebc726dc7e0f18f0f3f5e7e7f246df5d2215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac06920c145bb542ec318216254143a5508f302099d629bfc73bd65e047df341759febbac20c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3eba20df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763ba51a2c00001012b220200000000000022512096cd17a1b4a892e594a101974360af08ebc726dc7e0f18f0f3f5e7e7f246df5d2215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac06920c145bb542ec318216254143a5508f302099d629bfc73bd65e047df341759febbac20c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3eba20df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763ba51a2c00001012b404b4c000000000022512096cd17a1b4a892e594a101974360af08ebc726dc7e0f18f0f3f5e7e7f246df5d2215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac06920c145bb542ec318216254143a5508f302099d629bfc73bd65e047df341759febbac20c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3eba20df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763ba51a2c0000000000000000000'

        // const tempuserSignedHexedPsbt = '70736274ff0100fd07020200000004dc4c17afc3d247863bdaa3e6ff8c748a0aae46966a639c42d95952343890c5f90100000000ffffffff545276fe3621805124a4bca33c01b9617472ff0e8d911641feb48749daa149ad0200000000ffffffff26ddf146984398485818062a6755bede57e94b5a3359412c5f1f7748d63cf90c0200000000ffffffffdc4c17afc3d247863bdaa3e6ff8c748a0aae46966a639c42d95952343890c5f90300000000ffffffff080000000000000000236a5d20008185ac01260a040000de02010000090300002906f4f802c0010902000029052202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a62202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a62202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6220200000000000022512015db86c05d26db9f5525cb6223f20357bdb497ff9b2465a47c253d5621718eb5220200000000000022512015db86c05d26db9f5525cb6223f20357bdb497ff9b2465a47c253d5621718eb5220200000000000022512015db86c05d26db9f5525cb6223f20357bdb497ff9b2465a47c253d5621718eb538c52c0000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6000000000001012b2202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a60113406a58a6c1c80291c652f0be80542af9e0f678c893122b0a43d30a254f643c224995dc229ef16297acb824d171e0e836f23e6f301e692cde5f9de17294b3524494011720df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c7630001012b220200000000000022512015db86c05d26db9f5525cb6223f20357bdb497ff9b2465a47c253d5621718eb52215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac069201a57abbe490cf8ec0b256876ad1d599710cdfd4353634e20eb93e07883e6cb89ac20c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3eba20df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763ba52a2c00001012b220200000000000022512015db86c05d26db9f5525cb6223f20357bdb497ff9b2465a47c253d5621718eb52215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac069201a57abbe490cf8ec0b256876ad1d599710cdfd4353634e20eb93e07883e6cb89ac20c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3eba20df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763ba52a2c00001012b249e3a0000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6011340d7f3ea4b99e607878b1d8f5fc95b1db86ecccaf94ceda06af10f7de26be876d5910989620d0a9182e8a3499d37098021570ad7f4659adc2a0a7bcc8d9c6a0532011720df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763000000000000000000'

        // const userSignedHexedPsbt = finalizePsbtInput(tempuserSignedHexedPsbt, [0, 3]);

        const tempadminSignedHexedPsbt = "70736274ff0100fdd2010200000003248fa120ad11ad5ee0cd61890bc300bda415298c7a4c05e0b1a19f1583c1ee120200000000ffffffffdcd9c11d362aa5637d38a19e3695dadd3dcb7c658cf3bad8a1a14d069985b5390200000000ffffffff4cd189d233c66defd6dd2d4ac64b504ed394184abe4cdb1b266957388cf18fd20000000000ffffffff080000000000000000176a5d1400dd84ac013809030000290624260902000029052202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a62202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a62202000000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a62202000000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f2202000000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f2202000000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f6064400000000000225120531d53643cd23f71ad7a56fc19415936d9bcc08bdc378a8b193ac9b2e7e921a6000000000001012b2202000000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f4114c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3e7d104649da3c55056c577cf6d32fc220b2b6f20ab8706a17366db65143039266404ee6b14a1c5d53858d139b0bbc0b6f6dd1b68e7000a60f42bcafd20b2d8bcca67e2ac4ab983ab5af045e87f71cdaa09f8528be1d62c8d35fde5b5c7fe75502a84114df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c7637d104649da3c55056c577cf6d32fc220b2b6f20ab8706a17366db65143039266406acf14e94df6828e168e4d0e45e63a44b78a9b76478a7bc4eec56afc4ad3f842ce5c9a3f3bd6dc951847b8d4035c0090ea96531d03344c4e35b9f07092cef5f92215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac06920c145bb542ec318216254143a5508f302099d629bfc73bd65e047df341759febbac20c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3eba20df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763ba52a2c00001012b2202000000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f4114c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3e7d104649da3c55056c577cf6d32fc220b2b6f20ab8706a17366db6514303926640bb490de4c9b7b4cf73a6133f31f0b0ba04c75dbfdcb73eb14c0a62a07dc726514db140e45e2cdd53078e50ef65a11765141e1bf456c7c84a54c4c8f630c63b4b4114df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c7637d104649da3c55056c577cf6d32fc220b2b6f20ab8706a17366db6514303926640459d30d5c4af4ba59c31bf27e807fcfbab1ccc2cc8db362eb5d50c502926f2905050bcd3bd1a2e33b28a0405c61972cf1e9e41fe29573e251de0dadb26d31a8a2215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac06920c145bb542ec318216254143a5508f302099d629bfc73bd65e047df341759febbac20c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3eba20df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763ba52a2c00001012b404b4c0000000000225120b71c2d444c99ed67b0f6b1b399a60fe1274430336466c5e5c65f9d9e99afbc1f4114c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3e7d104649da3c55056c577cf6d32fc220b2b6f20ab8706a17366db6514303926640569b2f7b478d76a01d76ac4d72a243066f65efcb24acd4d4e79d7c150afdd78340e45ecc7f50c8bc1f15cc8c48e69fdab34b24eae12778ea106e62cb5f3159d04114df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c7637d104649da3c55056c577cf6d32fc220b2b6f20ab8706a17366db65143039266407b1fdd1b29a6625d5a3f709646c7ef77e6c35845ada2bde69b00fae0ad9b739e913d1733353fa28f5bca6f953ebef573081e80817d24c62ddefda45d977429e12215c050929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac06920c145bb542ec318216254143a5508f302099d629bfc73bd65e047df341759febbac20c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3eba20df2729c89fb4d69592abc692ce8d900df7704b73bfe597a9b5ec89159266c763ba52a2c0000000000000000000";

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

        const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

        const pubkeyList = existTaprootMultisig.cosigner;
        const threshold = existTaprootMultisig.threshold;
        const privateKey = existTaprootMultisig.privateKey;

        const leafPubkeys = pubkeyList.map((pubkey: string) =>
            toXOnly(Buffer.from(pubkey, "hex"))
        )

        const multiSigWallet = new TaprootMultisigWallet(
            leafPubkeys,
            threshold,
            Buffer.from(privateKey, "hex"),
            LEAF_VERSION_TAPSCRIPT
        ).setNetwork(network)

        const tempSignedPSBT = bitcoin.Psbt.fromHex(tempadminSignedHexedPsbt)
        multiSigWallet.addDummySigs(tempSignedPSBT);
        tempSignedPSBT.finalizeAllInputs();
        // const admin1SignedHexedPsbt = Psbt.fromHex(tempadminSignedHexedPsbt);
        // const fia = admin1SignedHexedPsbt.finalizeAllInputs()

        const tx = tempSignedPSBT.extractTransaction();
        const txHex = tx.toHex();
        const txId = await pushRawTx(txHex);

        console.log('txId :>> ', txId);

        res.status(200).send({ data: txId });
    }
    catch (error) {
        // updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

        console.log(error);
    }
});

testRouter.post('/testGeneratePsbt', async (req, res, next) => {
    try {
        const { userPubkey, userAddress, sendingAmount, adminAddress } = req.body;

        const data = await testGenerateInitialRuneSwapPsbt(userAddress, sendingAmount, adminAddress);

        console.log('generate rune swap psbt :>> ', data);

        if (data.success === true) {
            res.status(200).send({ success: true, data: data.data })
        } else if (data.success === false) {
            res.status(200).send({ success: false, data: data.data })
        }
    } catch (error) {
        console.log(error);
        return res.status(404).send(error)
    }
});

testRouter.post('/getFee', async (req, res, next) => {
    try {
        const { amount } = req.body;

        const fee = await getDummyFee(amount);

        return res.status(200).send({ fee: fee });
    } catch (error) {

    }
})

// Get fee of runestones to transfer different-amount rune token to different addresses.
testRouter.post("/estimate-different-amount", async (req, res, next) => {
    try {
        // Getting parameter from request
        const { feeRate, size } = req.body;

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

// Get fee of runestones to transfer different-amount rune token to different addresses.
testRouter.post("/different-amount", async (req, res, next) => {
    try {
        const paidUserList: IWhiteList[] = await WhiteListModal.find({
            status: 2
        })

        const airdropingList: Array<any> = paidUserList.map((item: IWhiteList) => {
            return {
                address: item.address,
                amount: item.amount
            }
        })

        const tempList: any = [
            {
                address: 'tb1pw7dtq290mkjq36q3yv5h2s3wz79k2696zftd0ctsydruwjxktlrs8x8cmh',
                amount: 1
            },
            {
                address: 'tb1pw7dtq290mkjq36q3yv5h2s3wz79k2696zftd0ctsydruwjxktlrs8x8cmh',
                amount: 1
            },
        ]
        // Getting parameter from request
        const payload = await airdropDifferentAmount(tempList);

        return res.status(200).send(payload);
    } catch (error: any) {
        console.log(error.message);
        return res.status(500).send(error);
    }
})

testRouter.post('/generateSeed', async (req, res, next) => {
    try {
        const newSeed = await generateSeed();

        res.status(200).send(newSeed);
    } catch (error) {

    }
})

testRouter.post('/combinePsbt', async (req, res, next) => {
    try {
        const { hexedPsbt, signedHexedPsbt1, signedHexedPsbt2 } = req.body

        const psbt = bitcoin.Psbt.fromHex(hexedPsbt);
        const signedPsbt1 = bitcoin.Psbt.fromHex(signedHexedPsbt1);
        if (signedHexedPsbt2) {
            const signedPsbt2 = bitcoin.Psbt.fromHex(signedHexedPsbt2);
            psbt.combine(signedPsbt1, signedPsbt2);
        } else {
            psbt.combine(signedPsbt1);
        }
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();

        const txId = await pushRawTx(txHex);
        return res.status(200).send(txId);
    } catch (error) {
        return res.status(404).send(error);
    }
})

testRouter.get('/checkTxStatus', async (req, res, next) => {
    try {
        const payload = await checkTxStatus();

        res.status(200).send(payload)
    } catch (error) {
        res.status(404).send(error)
    }
})

export default testRouter;
