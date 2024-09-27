import { LEAF_VERSION_TAPSCRIPT, tapTweakHash } from "bitcoinjs-lib/src/payments/bip341";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import ECPairFactory from 'ecpair';

import {
  getBtcUtxoByAddress,
  getRuneUtxoByAddress,
} from "../service";
import {
  privateKey1,
  privateKey2,
  SEND_UTXO_FEE_LIMIT,
  testVersion
} from "../../config/config";
import { getSendBTCUTXOArray } from "../utxo/utxo.management";
import { RuneTransferpsbt } from "./runeBtcTransactionPsbt";
import { IMusigAssets, IUtxo } from "../../utils/type";
import app from "../../server";
import { TaprootMultisigWallet } from "../mutisigWallet";

const ECPair = ECPairFactory(ecc);
const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

export const sendRuneBtcTransaction = async (
  runeId: string,
  bundledDataArray: Array<any>,
  feeRate: number,
  multiSigAssets: IMusigAssets,
): Promise<any> => {

  const MusigWallet = new TaprootMultisigWallet(
    multiSigAssets.leafPubkeys,
    multiSigAssets.threshold,
    Buffer.from(multiSigAssets.privateKey, "hex"),
    LEAF_VERSION_TAPSCRIPT
  ).setNetwork(network)

  const psbt = new bitcoin.Psbt({ network });

  // Get rune utxos of admin wallet
  const runeUtxos = await getRuneUtxoByAddress(MusigWallet.address, runeId);

  // Sum of required Rune amount values
  let runeTokenAmountArraySum = bundledDataArray.reduce(
    (accum: number, item: any) => accum + item.rune_amount,
    0
  );

  console.log('runeUtxos.tokenSum :>> ', runeUtxos.tokenSum);
  console.log('runeTokenAmountArraySum :>> ', runeTokenAmountArraySum);
  //Check rune token is enough
  if (runeUtxos.tokenSum < runeTokenAmountArraySum) {
    // return { isSuccess: false, data: `No enough rune balance for ${runeId}` };
    return { isSuccess: false, data: `No enough rune balance for ${runeId}` };
  }

  // Sum of required BTC amount values
  let btcAmountArraySum = bundledDataArray.reduce(
    (accum: number, item: any) => accum + item.btc_amount,
    0
  );

  // Get btc utxos of admin wallet
  let btcUtxos: any = await getBtcUtxoByAddress(MusigWallet.address);

  btcUtxos = btcUtxos.filter(
    (item: IUtxo) =>
      item.value >= 10000 && runeUtxos.runeUtxos.find((runeItem: IUtxo) =>
        runeItem.txid == item.txid && runeItem.vout == item.vout) == undefined
  );

  // Calculate sum of rune utxos array values
  let runeUtxoArraySum = runeUtxos.runeUtxos.reduce(
    (accum: number, utxo: IUtxo) => accum + utxo.value,
    0
  );

  // get initially selected utxo array
  let response = getSendBTCUTXOArray(
    btcUtxos,
    btcAmountArraySum + SEND_UTXO_FEE_LIMIT - runeUtxoArraySum
  );

  // check the btc balance is enough
  if (!response.isSuccess) {
    return { isSuccess: false, data: "Not enough balance on your wallet." };
  }

  // loop calculate fee using dummy transaction
  let selectedBtcUtxos = response.data;
  let redeemFee = SEND_UTXO_FEE_LIMIT;

  const keyPair1 = ECPair.fromWIF(privateKey1, network);
  const keyPair2 = ECPair.fromWIF(privateKey2, network);

  for (let i = 0; i < 3; i++) {
    //loop for exact calculation fee
    let redeemPsbt: bitcoin.Psbt = await RuneTransferpsbt(
      bundledDataArray,
      runeId,
      selectedBtcUtxos,
      runeUtxos.runeUtxos,
      redeemFee,
      multiSigAssets,
    );

    // Sign redeem psbt
    for (let i = 0; i < redeemPsbt.inputCount; i++) {
      redeemPsbt.signInput(i, keyPair1);
      redeemPsbt.signInput(i, keyPair2);
    }
    MusigWallet.addDummySigs(redeemPsbt);
    redeemPsbt.finalizeAllInputs();

    // Calculate redeem fee
    redeemFee = redeemPsbt.extractTransaction().virtualSize() * feeRate;

    console.log('redeemFee :>> ', redeemFee);

    // update selectedBtcUtxo array
    response = getSendBTCUTXOArray(
      btcUtxos,
      btcAmountArraySum + redeemFee - runeUtxoArraySum
    );

    if (!response.isSuccess) {
      return { isSuccess: false, data: "Not enough balance in your wallet." };
    }
    selectedBtcUtxos = response.data;
  }

  // Create real psbt
  let realPsbt: bitcoin.Psbt = await RuneTransferpsbt(
    bundledDataArray,
    runeId,
    selectedBtcUtxos,
    runeUtxos.runeUtxos,
    redeemFee,
    multiSigAssets,
  );

  console.log('realPsbt :>> ', realPsbt);
  console.log('realPsbt :>> ', realPsbt.toHex());

  // Sign real psbt
  for (let i = 0; i < realPsbt.inputCount; i++) {
    realPsbt.signInput(i, keyPair1);
    realPsbt.signInput(i, keyPair2);
  }

  MusigWallet.addDummySigs(realPsbt);
  for (let i = 0; i < realPsbt.inputCount; i++) {
    realPsbt.finalizeInput(i);
  }

  // Extract networkType of global environment
  const networkType: string = app.locals.networkType;

  console.log('realPsbt :>> ', realPsbt.toHex());

  // Calculate real transaction fee
  const txHex: any = realPsbt.extractTransaction().toHex();

  // upgrade network type
  const payload = {
    txHex: txHex,
    networkType: btoa(networkType),
  };

  return { isSuccess: true, payload: payload };
};
