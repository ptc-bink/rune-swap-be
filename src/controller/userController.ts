import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import { none, RuneId, Runestone } from "runelib";

import {
  userRuneId,
  testVersion,
  adminRuneId1,
  adminRuneId2,
  sendingRate,
  feelimit,
  adminVout1,
  adminVout2,
  userDivisibility,
  adminDevisibility1,
  adminDevisibility2,
  testFeeRate
} from '../config/config';
import {  WalletTypes } from '../config/type';
import { LocalWallet, publicKeyToScriptPk } from "../service/localWallet";
import dotenv from 'dotenv';
import { calculateTxFee, delay, getFeeRate, getRuneUtxoByAddress, } from 'src/service/service';
import { getBtcUtxoByAddress } from '../../../../bitcoin-toolbox/Ordinal_transfer';
import { getMockContent, updateMockFile } from "src/config/utils";

const ecc = require("@bitcoinerlab/secp256k1");
bitcoin.initEccLib(ecc);
dotenv.config();

const ECPair = ECPairFactory(ecc);

const privateKey: string = process.env.WIF_KEY as string;


const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

export const adminWallet = new LocalWallet(privateKey as string, testVersion ? 1 : 0);

const adminWalletOutput = publicKeyToScriptPk(adminWallet.pubkey, 2, testVersion ? 1 : 0);

export const generateRuneSwapPsbt = async (pubkey: string, userAddress: string, userOrdinalPubkey: string, userOrdinalAddress: string, sendingAmount: number, walletType: string) => {
  const mock = await getMockContent();

  if (mock.txBuilding as string == "true") {
    return {
      succss: false,
      data: "utxo is on re-building"
    }
  }

  updateMockFile(mock.content.replace('txBuilding = "false"', 'txBuilding = "true"'))

  await delay(20000)

  // Fetch
  const btcUtxos = await getBtcUtxoByAddress(userAddress);

  const userRuneUtxos = await getRuneUtxoByAddress(userAddress, userRuneId);
  // const adminRuneUtxos1 = await getRuneUtxoByAddress(adminWallet.address, runeId1);
  // const adminRuneUtxos2 = await getRuneUtxoByAddress(adminWallet.address, runeId2);
  const adminRuneAmount1 = parseInt(mock.adminRuneAmount1 as string)
  const adminRuneAmount2 = parseInt(mock.adminRuneAmount2 as string)

  const adminBlockNumber1 = parseInt(adminRuneId1.split(":")[0]);
  const adminTxout1 = parseInt(adminRuneId1.split(":")[1]);
  const adminBlockNumber2 = parseInt(adminRuneId2.split(":")[0]);
  const adminTxout2 = parseInt(adminRuneId2.split(":")[1]);
  const userBlockNumber = parseInt(userRuneId.split(":")[0]);
  const userTxout = parseInt(userRuneId.split(":")[1]);

  const edicts: any = [];
  const inputArray: number[] = [];
  let cnt = 0;

  if (userRuneUtxos.tokenSum < sendingAmount * Math.pow(10, userDivisibility) || adminRuneAmount1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) || adminRuneAmount2 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2)) {
    // if (userRuneUtxos.tokenSum < sendingAmount * Math.pow(10, userDivisibility) || adminRuneUtxos1.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) || adminRuneUtxos2.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1)) {
    updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))

    return {
      success: false,
      data: "Rune is not enough"
    }
  }

  const psbt = new bitcoin.Psbt({ network })

  let userTokenSum = 0;
  // create user rune utxo input && edict
  for (const runeutxo of userRuneUtxos.runeUtxos) {
    if (userTokenSum < sendingAmount * Math.pow(10, userDivisibility)) {
      psbt.addInput({
        hash: runeutxo.txid,
        index: runeutxo.vout,
        witnessUtxo: {
          value: runeutxo.value,
          script: Buffer.from(runeutxo.scriptpubkey, "hex")
        },
        tapInternalKey:
          walletType === WalletTypes.XVERSE || walletType === WalletTypes.OKX
            ? Buffer.from(pubkey, "hex")
            : Buffer.from(pubkey, "hex").slice(1, 33)
      });

      inputArray.push(cnt);
      cnt++;
      userTokenSum += runeutxo.amount;
    }
  }

  // send user rune to admin address
  edicts.push({
    id: new RuneId(userBlockNumber, userTxout),
    amount: sendingAmount * Math.pow(10, userDivisibility),
    output: 4,
  })

  // return user rune to user address
  edicts.push({
    id: new RuneId(userBlockNumber, userTxout),
    amount: (userTokenSum - sendingAmount) * Math.pow(10, userDivisibility),
    output: 1,
  });

  // create admin rune1 utxo input && edict
  psbt.addInput({
    hash: mock.txId as string,
    index: adminVout1,
    witnessUtxo: {
      value: 546,
      script: Buffer.from(adminWalletOutput as string, "hex"),
    },
    tapInternalKey: Buffer.from(adminWallet.pubkey, "hex").slice(1, 33),
  });
  cnt++;

  // let adminTokenSum1 = 0;
  // // create admin rune1 utxo input && edict
  // for (const runeutxo of adminRuneUtxos1.runeUtxos) {
  //   if (adminTokenSum1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1)) {
  //     psbt.addInput({
  //       hash: runeutxo.txid,
  //       index: runeutxo.vout,
  //       witnessUtxo: {
  //         value: runeutxo.value,
  //         script: Buffer.from(runeutxo.scriptpubkey, "hex")
  //       },
  //       tapInternalKey: Buffer.from(adminWallet.pubkey, "hex").slice(1, 33),
  //       // sighashType: bitcoin.Transaction.SIGHASH_ALL,
  //     });

  //     cnt++;
  //     adminTokenSum1 += runeutxo.amount;
  //   }
  // }

  // send admin rune1 to user
  edicts.push({
    id: new RuneId(adminBlockNumber1, adminTxout1),
    amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
    output: 2,
  })

  // return admin rune1 to admin
  edicts.push({
    id: new RuneId(adminBlockNumber1, adminTxout1),
    amount: adminRuneAmount1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
    // amount: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
    output: 5,
  });

  cnt++;

  // create admin rune1 utxo input && edict
  psbt.addInput({
    hash: mock.txId as string,
    index: adminVout2,
    witnessUtxo: {
      value: 546,
      script: Buffer.from(adminWalletOutput as string, "hex"),
    },
    tapInternalKey: Buffer.from(adminWallet.pubkey, "hex").slice(1, 33)
  });
  cnt++;

  // let adminTokenSum2 = 0;
  // // create admin rune1 utxo input && edict
  // for (const runeutxo of adminRuneUtxos2.runeUtxos) {
  //   if (adminTokenSum2 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, userDivisibility)) {
  //     psbt.addInput({
  //       hash: runeutxo.txid,
  //       index: runeutxo.vout,
  //       witnessUtxo: {
  //         value: runeutxo.value,
  //         script: Buffer.from(runeutxo.scriptpubkey, "hex")
  //       },
  //       tapInternalKey: Buffer.from(adminWallet.pubkey, "hex").slice(1, 33)
  //     });

  //     cnt++;
  //     adminTokenSum2 += runeutxo.amount;
  //   }
  // }

  // send admin rune2 to user address
  edicts.push({
    id: new RuneId(adminBlockNumber2, adminTxout2),
    amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
    output: 3,
  })

  // return admin rune2 to admin address
  edicts.push({
    id: new RuneId(adminBlockNumber2, adminTxout2),
    amount: adminRuneAmount2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
    // amount: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
    output: 6,
  });

  const mintstone = new Runestone(
    edicts,
    none(),
    none(),
    none()
  );

  psbt.addOutput({
    script: mintstone.encipher(),
    value: 0,
  });

  psbt.addOutput({
    address: userAddress, // rune user address
    value: 546,
  });

  psbt.addOutput({
    address: userAddress, // rune user address
    value: 546,
  });

  psbt.addOutput({
    address: userAddress, // rune user address
    value: 546,
  });

  // add rune receiver address
  psbt.addOutput({
    address: adminWallet.address, // rune admin address
    value: 546,
  });

  psbt.addOutput({
    address: adminWallet.address, // rune admin address
    value: 546,
  });

  psbt.addOutput({
    address: adminWallet.address, // rune admin address
    value: 546,
  });

  const feeRate = testVersion ? Math.floor(testFeeRate * feelimit) : Math.floor(await getFeeRate() * feelimit);

  // add btc utxo input
  let totalBtcAmount = 0;
  for (const btcutxo of btcUtxos) {
    const fee = calculateTxFee(psbt, feeRate);
    if (totalBtcAmount < fee && btcutxo.value > 10000) {
      totalBtcAmount += btcutxo.value;

      psbt.addInput({
        hash: btcutxo.txid,
        index: btcutxo.vout,
        witnessUtxo: {
          script: Buffer.from(btcutxo.scriptpubkey as string, "hex"),
          value: btcutxo.value,
        },
        tapInternalKey:
          walletType === WalletTypes.XVERSE || walletType === WalletTypes.OKX
            ? Buffer.from(pubkey, "hex")
            : Buffer.from(pubkey, "hex").slice(1, 33)
      });

      inputArray.push(cnt);
      cnt++;
    }
  }

  const fee = calculateTxFee(psbt, feeRate);  // calc entire fee

  if (totalBtcAmount < fee) {
    updateMockFile(mock.content.replace('txBuilding = "true"', 'txBuilding = "false"'))
    return {
      success: false,
      data: "BTC balance is not enough"
    }
  };

  psbt.addOutput({
    address: userAddress,
    value: totalBtcAmount - fee
  });

  return {
    success: true,
    data: {
      psbt: psbt.toHex(),
      inputArray: inputArray,
      // amount1: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
      amount1: adminRuneAmount1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
      // amount2: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
      amount2: adminRuneAmount2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
    }
  }
};