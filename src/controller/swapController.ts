import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import { none, RuneId, Runestone } from "runelib";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

import {
  calculateTxFee,
  delay,
  getBtcUtxoByAddress,
  getFeeRate,
  getRuneUtxoByAddress
} from '../service/service';
import {
  userRuneId,
  testVersion,
  sendingRate,
  feelimit,
  adminVout1,
  adminVout2,
  userDivisibility,
  testFeeRate,
} from '../config/config';
import { WalletTypes } from '../config/type';
import TaprootMultisigModal from "../model/TaprootMultisig";
import { TaprootMultisigWallet } from "../service/mutisigWallet";
import dotenv from 'dotenv';

const ecc = require("@bitcoinerlab/secp256k1");
bitcoin.initEccLib(ecc);
dotenv.config();

const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

export const generateRuneSwapPsbt = async (
  pubkey: string,
  userAddress: string,
  sendingAmount: number,
  adminAddress: string
) => {
  const existTaprootMultisig = await TaprootMultisigModal.findOne({
    address: adminAddress
  })
  const assets = existTaprootMultisig?.assets;

  if (!existTaprootMultisig) {
    return {
      success: false,
      data: "Admin adress is not existed",
    }
  }

  const pubkeyList = existTaprootMultisig.cosigner;

  console.log('pubkeyList :>> ', pubkeyList);

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

  if (existTaprootMultisig.txBuilding === true) {
    return {
      success: false,
      data: "utxo is on re-building"
    }
  }

  const result = await TaprootMultisigModal.updateOne(
    { address: adminAddress },
    { $set: { 'txBuilding': true } }
  );

  console.log('update taproot modal :>> ', result);

  await delay(20000)

  // Fetch
  const btcUtxos = await getBtcUtxoByAddress(userAddress);
  const userRuneUtxos = await getRuneUtxoByAddress(userAddress, userRuneId);

  const adminRuneAmount1 = assets?.runeAmount1 as number;
  const adminRuneAmount2 = assets?.runeAmount2 as number;
  const adminRuneId1 = assets?.runeId1 as string;
  const adminRuneId2 = assets?.runeId2 as string;
  const adminDevisibility1 = assets?.divisibility1 as number;
  const adminDevisibility2 = assets?.divisibility2 as number;
  const adminBlockNumber1 = parseInt(adminRuneId1.split(":")[0]);
  const adminBlockNumber2 = parseInt(adminRuneId2.split(":")[0]);
  const adminTxout1 = parseInt(adminRuneId1.split(":")[1]);
  const adminTxout2 = parseInt(adminRuneId2.split(":")[1]);
  const userBlockNumber = parseInt(userRuneId.split(":")[0]);
  const userTxout = parseInt(userRuneId.split(":")[1]);

  const edicts: any = [];
  const inputArray: number[] = [];
  let cnt = 0;

  if (userRuneUtxos.tokenSum < sendingAmount * Math.pow(10, userDivisibility) || adminRuneAmount1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) || adminRuneAmount2 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2)) {
    const result = await TaprootMultisigModal.updateOne(
      { address: adminAddress },
      { $set: { 'txBuilding': false } }
    );

    console.log('update taproot modal :>> ', result);


    return {
      success: false,
      data: "Rune is not enough",
    }
  }

  // create new psbt
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
        tapInternalKey: Buffer.from(pubkey, "hex").slice(1, 33)
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
  multiSigWallet.addInput(
    psbt,
    existTaprootMultisig?.txId as string,
    adminVout1,
    adminRuneAmount1,
  )
  cnt++;

  // send admin rune1 to user
  edicts.push({
    id: new RuneId(adminBlockNumber1, adminTxout1),
    amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, assets?.divisibility1 as number),
    output: 2,
  })

  // return admin rune1 to admin
  edicts.push({
    id: new RuneId(adminBlockNumber1, adminTxout1),
    amount: adminRuneAmount1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
    output: 5,
  });

  cnt++;

  // create admin rune2 utxo input && edict
  multiSigWallet.addInput(
    psbt,
    existTaprootMultisig?.txId as string,
    adminVout2,
    adminRuneAmount2,
  )

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
    address: adminAddress, // rune admin address
    value: 546,
  });

  psbt.addOutput({
    address: adminAddress, // rune admin address
    value: 546,
  });

  psbt.addOutput({
    address: adminAddress, // rune admin address
    value: 546,
  });

  const feeRate = testVersion ? testFeeRate * feelimit : await getFeeRate() * feelimit;

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
        tapInternalKey: Buffer.from(pubkey, "hex").slice(1, 33)
      });

      inputArray.push(cnt);
      cnt++;
    }
  }

  const fee = calculateTxFee(psbt, feeRate);  // calc entire fee

  if (totalBtcAmount < fee) {
    const result = await TaprootMultisigModal.updateOne(
      { address: adminAddress },
      { $set: { 'txBuilding': false } }
    )

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
      amount1: assets?.runeAmount1 as number - Math.floor(sendingAmount * sendingRate) * Math.pow(10, assets?.divisibility1 as number),
      amount2: assets?.runeAmount2 as number - Math.floor(sendingAmount * sendingRate) * Math.pow(10, assets?.divisibility2 as number),
    }
  }
};

export const generateInitialRuneSwapPsbt = async (
  userPubkey: string,
  userAddress: string,
  sendingAmount: number,
  adminAddress: string
) => {
  const existTaprootMultisig = await TaprootMultisigModal.findOne({
    address: adminAddress
  })

  console.log('adminAddress :>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> ', adminAddress);

  console.log('existTaprootMultisig :>> ', existTaprootMultisig);
  if (!existTaprootMultisig) {
    return {
      success: false,
      data: "Admin adress is not existed",
    }
  }

  const assets = existTaprootMultisig.assets;
  console.log('existTaprootMultisig?.txBuilding :>> ', existTaprootMultisig?.txBuilding);

  // if (existTaprootMultisig?.txBuilding === true) {
  //   return {
  //     success: false,
  //     data: "utxo is on re-building"
  //   }
  // }

  const result = await TaprootMultisigModal.updateOne(
    { address: adminAddress },
    { $set: { 'txBuilding': true } }
  );

  const pubkeyList = existTaprootMultisig.cosigner;
  const threshold = existTaprootMultisig.threshold;
  const privateKey = existTaprootMultisig.privateKey;

  const adminRuneId1 = assets?.runeId1 as string;
  const adminRuneId2 = assets?.runeId2 as string;
  const adminDevisibility1 = assets?.divisibility1 as number;
  const adminDevisibility2 = assets?.divisibility2 as number;

  const leafPubkeys = pubkeyList.map((pubkey: string) =>
    toXOnly(Buffer.from(pubkey, "hex"))
  )

  const multiSigWallet = new TaprootMultisigWallet(
    leafPubkeys,
    threshold,
    Buffer.from(privateKey, "hex"),
    LEAF_VERSION_TAPSCRIPT
  ).setNetwork(network)

  await delay(20000)

  // Fetch
  const btcUtxos = await getBtcUtxoByAddress(userAddress);

  const userRuneUtxos = await getRuneUtxoByAddress(userAddress, userRuneId);
  const adminRuneUtxos1 = await getRuneUtxoByAddress(adminAddress, adminRuneId1);
  const adminRuneUtxos2 = await getRuneUtxoByAddress(adminAddress, adminRuneId2);

  const adminBlockNumber1 = parseInt(adminRuneId1.split(":")[0]);
  const adminTxout1 = parseInt(adminRuneId1.split(":")[1]);

  const adminBlockNumber2 = parseInt(adminRuneId2.split(":")[0]);
  const adminTxout2 = parseInt(adminRuneId2.split(":")[1]);

  const userBlockNumber = parseInt(userRuneId.split(":")[0]);
  const userTxout = parseInt(userRuneId.split(":")[1]);

  const edicts: any = [];
  const inputArray: number[] = [];
  let cnt = 0;

  if (userRuneUtxos.tokenSum < sendingAmount * Math.pow(10, userDivisibility) || adminRuneUtxos1.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) || adminRuneUtxos2.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1)) {
    const result = await TaprootMultisigModal.updateOne(
      { address: adminAddress },
      { $set: { 'txBuilding': false } }
    );

    console.log('update taproot modal :>> ', result);

    return {
      success: false,
      data: "Rune is not enough",
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
        tapInternalKey: Buffer.from(userPubkey, "hex").slice(1, 33)
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

  console.log('userBlockNumber, userTxout :>> ', userBlockNumber, userTxout);

  // return user rune to user address
  edicts.push({
    id: new RuneId(userBlockNumber, userTxout),
    amount: (userTokenSum - sendingAmount) * Math.pow(10, userDivisibility),
    output: 1,
  });

  let adminTokenSum1 = 0;
  // create admin rune1 utxo input && edict
  for (const runeutxo of adminRuneUtxos1.runeUtxos) {
    if (adminTokenSum1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1)) {
      multiSigWallet.addInput(
        psbt,
        runeutxo.txid,
        runeutxo.vout,
        runeutxo.value
      )

      cnt++;
      adminTokenSum1 += runeutxo.amount;
    }
  }

  console.log('adminBlockNumber1, adminTxout1 :>> ', adminBlockNumber1, adminTxout1);
  console.log('Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) :>> ', Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1));
  console.log('adminTokenSum1 :>> ', adminTokenSum1);

  // send admin rune1 to user
  edicts.push({
    id: new RuneId(adminBlockNumber1, adminTxout1),
    amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
    output: 2,
  })

  // return admin rune1 to admin
  edicts.push({
    id: new RuneId(adminBlockNumber1, adminTxout1),
    amount: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
    output: 5,
  });

  let adminTokenSum2 = 0;
  // create admin rune1 utxo input && edict
  for (const runeutxo of adminRuneUtxos2.runeUtxos) {
    if (adminTokenSum2 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, userDivisibility)) {
      multiSigWallet.addInput(
        psbt,
        runeutxo.txid,
        runeutxo.vout,
        runeutxo.value
      )
      cnt++;
      adminTokenSum2 += runeutxo.amount;
    }
  }

  // send admin rune2 to user address
  edicts.push({
    id: new RuneId(adminBlockNumber2, adminTxout2),
    amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
    output: 3,
  })

  console.log('adminBlockNumber2, adminTxout2 :>> ', adminBlockNumber2, adminTxout2);
  console.log('Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2 ):>> ', Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2));
  console.log('adminTokenSum2 :>> ', adminTokenSum2);
  console.log('sendingAmount :>> ', sendingAmount);
  console.log('sendingRate :>> ', sendingRate);
  console.log('adminDevisibility2 :>> ', adminDevisibility2);
  console.log('adminDevisibility1 :>> ', adminDevisibility1);

  // return admin rune2 to admin address
  edicts.push({
    id: new RuneId(adminBlockNumber2, adminTxout2),
    amount: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
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
    address: adminAddress, // rune admin address
    value: 546,
  });

  psbt.addOutput({
    address: adminAddress, // rune admin address
    value: 546,
  });

  psbt.addOutput({
    address: adminAddress, // rune admin address
    value: 546,
  });

  const feeRate = testVersion ? testFeeRate * feelimit : await getFeeRate() * feelimit;

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
        tapInternalKey: Buffer.from(userPubkey, "hex").slice(1, 33)
      });

      inputArray.push(cnt);
      cnt++;
    }
  }

  const fee = calculateTxFee(psbt, feeRate);  // calc entire fee

  if (totalBtcAmount < fee) {
    const result = await TaprootMultisigModal.updateOne(
      { address: adminAddress },
      { $set: { 'txBuilding': false } }
    );

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
      amount1: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1),
      amount2: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2),
    }
  }
};