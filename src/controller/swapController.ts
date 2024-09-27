import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import { none, RuneId, Runestone } from "runelib";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

import {
  calculateTxFee,
  combinePsbt,
  delay,
  getBtcUtxoByAddress,
  getFeeRate,
  getRuneUtxoByAddress,
  pushRawTx
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
  STANDARD_RUNE_UTXO_VALUE,
} from '../config/config';
import TaprootMultisigModal from "../model/TaprootMultisig";
import { signAndFinalizeTaprootMultisig, TaprootMultisigWallet } from "../service/mutisigWallet";
import dotenv from 'dotenv';

const ecc = require("@bitcoinerlab/secp256k1");
bitcoin.initEccLib(ecc);
dotenv.config();

const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

export const generateRuneSwapPsbt = async (
  pubkey: string,
  userAddress: string,
  sendingAmount: number,
  adminAddress: string,
  taprootMultisig: any
) => {
  console.log('taprootMultisig?.txBuilding :>> ', taprootMultisig?.txBuilding);
  if (taprootMultisig?.txBuilding === true) {
    return {
      success: false,
      message: "utxo is on re-building",
      payload: undefined
    }
  }

  let result: any;
  result = await TaprootMultisigModal.findOneAndUpdate(
    {
      address: adminAddress
    },
    {
      txBuilding: true
    }
  );

  await result?.save();

  const pubkeyList = taprootMultisig.cosigner;
  const assets = taprootMultisig?.assets;
  const threshold = taprootMultisig.threshold;
  const privateKey = taprootMultisig.privateKey;

  const leafPubkeys = pubkeyList.map((pubkey: string) =>
    toXOnly(Buffer.from(pubkey, "hex"))
  )

  const multiSigWallet = new TaprootMultisigWallet(
    leafPubkeys,
    threshold,
    Buffer.from(privateKey, "hex"),
    LEAF_VERSION_TAPSCRIPT
  ).setNetwork(network)

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
  const userInputArray: number[] = [];
  const multisigInputArray: number[] = [];
  let userCnt = 0;

  if (userRuneUtxos.tokenSum < sendingAmount * Math.pow(10, userDivisibility) || adminRuneAmount1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility1) || adminRuneAmount2 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDevisibility2)) {
    result = await TaprootMultisigModal.findOneAndUpdate(
      {
        address: adminAddress
      },
      {
        txBuilding: false
      }
    );

    await result?.save();

    return {
      success: false,
      message: "Rune is not enough",
      payload: undefined
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

      userInputArray.push(userCnt);
      userCnt++;
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
    amount: userTokenSum - sendingAmount * Math.pow(10, userDivisibility),
    output: 1,
  });

  // create admin rune1 utxo input && edict
  multiSigWallet.addInput(
    psbt,
    taprootMultisig?.txId as string,
    adminVout1,
    STANDARD_RUNE_UTXO_VALUE,
  )

  multisigInputArray.push(userCnt);
  userCnt++;

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

  multisigInputArray.push(userCnt);
  userCnt++;

  // create admin rune2 utxo input && edict
  multiSigWallet.addInput(
    psbt,
    taprootMultisig?.txId as string,
    adminVout2,
    STANDARD_RUNE_UTXO_VALUE,
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

      userInputArray.push(userCnt);
      userCnt++;
    }
  }

  const fee = calculateTxFee(psbt, feeRate);  // calc entire fee

  if (totalBtcAmount < fee) {
    result = await TaprootMultisigModal.findOneAndUpdate(
      {
        address: adminAddress
      },
      {
        txBuilding: false
      }
    );

    await result?.save();

    return {
      success: false,
      message: "BTC balance is not enough",
      payload: undefined
    }
  };

  psbt.addOutput({
    address: userAddress,
    value: totalBtcAmount - fee
  });

  return {
    success: true,
    message: "Generate swap psbt successfully",
    payload: {
      psbt: psbt.toHex(),
      userInputArray: userInputArray,
      multisigInputArray: multisigInputArray,
      amount1: assets?.runeAmount1 as number - Math.floor(sendingAmount * sendingRate) * Math.pow(10, assets?.divisibility1 as number),
      amount2: assets?.runeAmount2 as number - Math.floor(sendingAmount * sendingRate) * Math.pow(10, assets?.divisibility2 as number),
    }
  }
};

export const generateInitialRuneSwapPsbt = async (
  userPubkey: string,
  userAddress: string,
  sendingAmount: number,
  adminAddress: string,
  taprootMultisig: any
) => {
  console.log('taprootMultisig?.txBuilding :>> ', taprootMultisig?.txBuilding);
  if (taprootMultisig?.txBuilding === true) {
    return {
      success: false,
      message: "utxo is on re-building",
      payload: undefined
    }
  }

  const result = await TaprootMultisigModal.findOneAndUpdate(
    {
      address: adminAddress
    },
    {
      txBuilding: true
    }
  );

  await result?.save();

  const assets = taprootMultisig.assets;
  const pubkeyList = taprootMultisig.cosigner;
  const threshold = taprootMultisig.threshold;
  const privateKey = taprootMultisig.privateKey;

  const adminRuneId1 = assets?.runeId1 as string;
  const adminRuneId2 = assets?.runeId2 as string;
  const adminDivisibility1 = assets?.divisibility1 || 0;
  const adminDivisibility2 = assets?.divisibility2 || 0;

  const leafPubkeys = pubkeyList.map((pubkey: string) =>
    toXOnly(Buffer.from(pubkey, "hex"))
  )

  const multiSigWallet = new TaprootMultisigWallet(
    leafPubkeys,
    threshold,
    Buffer.from(privateKey, "hex"),
    LEAF_VERSION_TAPSCRIPT
  ).setNetwork(network)

  // Fetch
  const userBtcUtxos = await getBtcUtxoByAddress(userAddress);
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
  const userInputArray: number[] = [];
  const multisigInputArray: number[] = [];
  let userCnt = 0;

  if (userRuneUtxos.tokenSum < sendingAmount * Math.pow(10, userDivisibility) || adminRuneUtxos1.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1) || adminRuneUtxos2.tokenSum < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1)) {
    const result = await TaprootMultisigModal.findOneAndUpdate(
      {
        address: adminAddress
      },
      {
        txBuilding: false
      }
    );

    await result?.save();

    return {
      success: false,
      message: "Rune is not enough",
      payload: undefined,
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

      userInputArray.push(userCnt);
      userCnt++;
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
    amount: userTokenSum - sendingAmount * Math.pow(10, userDivisibility),
    output: 1,
  });

  let adminTokenSum1 = 0;
  // create admin rune1 utxo input && edict
  for (const runeutxo of adminRuneUtxos1.runeUtxos) {
    if (adminTokenSum1 < Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1)) {
      multiSigWallet.addInput(
        psbt,
        runeutxo.txid,
        runeutxo.vout,
        runeutxo.value
      )

      multisigInputArray.push(userCnt);
      userCnt++;
      adminTokenSum1 += runeutxo.amount;
    }
  }

  // send admin rune1 to user
  edicts.push({
    id: new RuneId(adminBlockNumber1, adminTxout1),
    amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1),
    output: 2,
  })

  // return admin rune1 to admin
  edicts.push({
    id: new RuneId(adminBlockNumber1, adminTxout1),
    amount: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1),
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
      multisigInputArray.push(userCnt);
      userCnt++;
      adminTokenSum2 += runeutxo.amount;
    }
  }

  // send admin rune2 to user address
  edicts.push({
    id: new RuneId(adminBlockNumber2, adminTxout2),
    amount: Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility2),
    output: 3,
  })

  // return admin rune2 to admin address
  edicts.push({
    id: new RuneId(adminBlockNumber2, adminTxout2),
    amount: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility2),
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
  for (const btcutxo of userBtcUtxos) {
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

      userInputArray.push(userCnt);
      userCnt++;
    }
  }
  const fee = calculateTxFee(psbt, feeRate);  // calc entire fee

  if (totalBtcAmount < fee) {
    const result = await TaprootMultisigModal.findOneAndUpdate(
      {
        address: adminAddress
      },
      {
        txBuilding: false
      }
    );

    await result?.save();

    return {
      success: false,
      message: "BTC balance is not enough",
      payload: undefined
    }
  };

  psbt.addOutput({
    address: userAddress,
    value: totalBtcAmount - fee
  });

  return {
    success: true,
    message: "Generate swap psbt successfully",
    payload: {
      psbt: psbt.toHex(),
      userInputArray: userInputArray,
      multisigInputArray: multisigInputArray,
      amount1: adminTokenSum1 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility1),
      amount2: adminTokenSum2 - Math.floor(sendingAmount * sendingRate) * Math.pow(10, adminDivisibility2),
    }
  }
};

export const updateTxBuildingModal = async (
  adminAddress: string
) => {
  const taprootMultisig = await TaprootMultisigModal.findOne({
    address: adminAddress
  })

  if (!taprootMultisig) {
    return {
      success: false,
      message: "Admin adress is not existed",
      payload: undefined
    }
  }

  if (taprootMultisig.txBuilding) {
    const updateModal = await TaprootMultisigModal.findOneAndUpdate(
      { address: adminAddress },
      {
        txBuilding: false
      }
    );

    await updateModal?.save();
  }

  return {
    success: true,
    message: "Status is updated successfully",
    payload: undefined
  }
}

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

  if (!taprootMultisig) return {
    success: false,
    message: `${adminAddress} is not existed`,
    payload: "",
  };

  const userSignedPsbt = bitcoin.Psbt.fromHex(userSignedHexedPsbt);

  // tempuserInputArray.forEach((input: number) => userSignedPsbt.finalizeInput(input));
  userInputArray.forEach((input: number) => userSignedPsbt.finalizeInput(input));

  // const finalizedMultisigPsbt = await signAndFinalizeTaprootMultisig(taprootMultisig, userSignedPsbt.toHex(), multisigInputArray);
  const finalizedMultisigPsbt = await signAndFinalizeTaprootMultisig(taprootMultisig, psbt, multisigInputArray);

  // console.log('finalizedMultisigPsbt :>> ', finalizedMultisigPsbt);
  // const tx = finalizedMultisigPsbt.extractTransaction();
  //       const txHex = tx.toHex();

  //       const txId = await pushRawTx(txHex);
  const txId = await combinePsbt(psbt, finalizedMultisigPsbt.toHex(), userSignedPsbt.toHex());

  if (txId) {
    const existMultisig = await TaprootMultisigModal.findOne({ address: adminAddress });

    const updateModal = await TaprootMultisigModal.findOneAndUpdate(
      { address: adminAddress },
      {
        txBuilding: false,
        txId: txId,
        assets: {
          runeId1: existMultisig?.assets?.runeId1,
          runeId2: existMultisig?.assets?.runeId2,
          divisibility1: existMultisig?.assets?.divisibility1,
          divisibility2: existMultisig?.assets?.divisibility2,
          runeAmount1: amount1,
          runeAmount2: amount2,
        }
      }
    );

    await updateModal?.save();

    return {
      success: true,
      message: `Push swap psbt successfully`,
      payload: txId,
    };
  } else {
    const result = await TaprootMultisigModal.findOneAndUpdate(
      {
        address: adminAddress
      },
      {
        txBuilding: false
      }
    );

    return {
      success: false,
      message: `Push swap psbt failed`,
      payload: undefined,
    };
  }
};