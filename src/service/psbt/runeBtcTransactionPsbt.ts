import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";
import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";

import { testVersion } from "../../config/config";
import { RuneId, Runestone, none } from "runelib";
import { IMusigAssets, IUtxo } from '../../utils/type';
import { TaprootMultisigWallet } from "../mutisigWallet";

bitcoin.initEccLib(ecc);
const network = testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

// Create dummy psbt for buyer offer
export const RuneTransferpsbt = async (
  bundledDataArray: Array<any>,
  rune_id: string,
  selectedBtcUtxos: Array<any>,
  runeUtxos: Array<IUtxo>,
  redeemFee: number,
  multiSigAssets: IMusigAssets,
): Promise<bitcoin.Psbt> => {
  // Create psbt instance
  const psbt = new bitcoin.Psbt({ network: testVersion ? bitcoin.networks.testnet : bitcoin.networks.bitcoin });

  const MusigWallet = new TaprootMultisigWallet(
    multiSigAssets.leafPubkeys,
    multiSigAssets.threshold,
    Buffer.from(multiSigAssets.privateKey, "hex"),
    LEAF_VERSION_TAPSCRIPT
  ).setNetwork(network)

  // Input all buyer Rune UTXOs for rune token
  console.log("--------------------------");

  // Create Runestone
  const edicts: any = [];
  let sendingTokenSum = 0;

  // Complete edicts array
  let i = 0;
  for (i; i < bundledDataArray.length; i++) {
    edicts.push({
      id: new RuneId(parseInt(rune_id.split(":")[0]), parseInt(rune_id.split(":")[1])),
      amount: bundledDataArray[i].rune_amount,
      output: i + 2,
    });

    sendingTokenSum = sendingTokenSum + bundledDataArray[i].rune_amount
  }

  let tokenSum = 0;

  // Create rune utxo input
  for (const runeutxo of runeUtxos) {
    if (tokenSum < sendingTokenSum) {
      console.log('runeutxo :>> ', runeutxo);
      
      MusigWallet.addInput(
        psbt,
        runeutxo.txid,
        runeutxo.vout,
        runeutxo.value
      )
      tokenSum += runeutxo.amount as number;
    }
  }

  // Input all buyer BTC UTXOs for ordinal price
  selectedBtcUtxos.forEach((utxo) => {
    console.log('utxo :>> ', utxo);

    MusigWallet.addInput(
      psbt,
      utxo.txid,
      utxo.vout,
      utxo.value
    )
  });

  console.log('edicts :>> ', edicts);

  const mintstone = new Runestone(edicts, none(), none(), none());

  // Add output runestone
  psbt.addOutput({
    script: mintstone.encipher(),
    value: 0,
  });

  // Calculate sum of rune utxos array values
  let runeUtxoArraySum = runeUtxos.reduce(
    (accum: number, utxo: IUtxo) => accum + utxo.value,
    0
  );

  // Calculate sum of btc utxos array values
  let selectedBtcUtxosSum = selectedBtcUtxos.reduce(
    (accum: number, utxo: IUtxo) => accum + utxo.value,
    0
  );

  // Calculate sum of output btc utxos array values
  let outputBtcUtxosSum = bundledDataArray.reduce(
    (accum: number, item: any) => accum + item.btc_amount,
    0
  );

  psbt.addOutput({
    address: MusigWallet.address,
    value: selectedBtcUtxosSum + runeUtxoArraySum - redeemFee - outputBtcUtxosSum,
  });

  // Add output for rune airdrop
  for (let i = 0; i < bundledDataArray.length; i++) {
    psbt.addOutput({
      address: bundledDataArray[i].address,
      value: bundledDataArray[i].btc_amount,
    });
  }

  return psbt;
};
