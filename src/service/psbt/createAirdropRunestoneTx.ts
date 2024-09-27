import * as Bitcoin from "bitcoinjs-lib";
import { networkType, privateKey1, testVersion } from "../../config/config";
import { RuneId, Runestone, none } from "runelib";

import initializeWallet from "../wallet/initializeWallet";
import { SeedWallet } from "../wallet/SeedWallet";
import { ITreeItem } from '../../utils/type';
import app from "../../server";
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from "ecpair";
import { tapTweakHash } from "bitcoinjs-lib/src/payments/bip341";
import { pushRawTx } from "../service";
import { WIFWallet } from "../wallet/WIFWallet";

const ECPair = ECPairFactory(ecc);
const network = testVersion ? Bitcoin.networks.testnet : Bitcoin.networks.bitcoin;

function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33);
}

function tweakSigner(signer: Bitcoin.Signer, opts: any = {}): Bitcoin.Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

export const signAndSend = async (
  keyPair: Bitcoin.Signer,
  psbt: Bitcoin.Psbt,
  address: string
) => {
  psbt.signAllInputs(keyPair)
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  console.log(`Broadcasting Transaction Hex: ${tx.toHex()}`);
  const txid = await pushRawTx(tx.toHex());
  console.log(`Success! Txid is ${txid}`);

  return txid
}

const newLocaWallet = new WIFWallet({ networkType: "testnet", privateKey: privateKey1 as string });
const keyPair = newLocaWallet.ecPair;
const temptweakedSigner = tweakSigner(keyPair, { network });

export const createAirdropRunestoneTx = (
  data: ITreeItem,
  rune_id: string,
  seed: string
): string => {
  //Create psbt instance
  const psbt = new Bitcoin.Psbt({
    network: testVersion ? Bitcoin.networks.testnet : Bitcoin.networks.bitcoin,
  });

  console.log('app.locals.walletIndex :>> ', app.locals.walletIndex);
  // Initialize seed Wallet
  const wallet: SeedWallet = initializeWallet(
    networkType,
    seed,
    app.locals.walletIndex
  );

  console.log('wallet.address :>> ', wallet.address);

  // Create redeem Runestone
  const edicts: any = [];
  for (let i = 0; i < data.children.length; i++) {
    edicts.push({
      id: new RuneId(+rune_id.split(":")[0], +rune_id.split(":")[1]),
      amount: data.children[i].total_amount,
      output: i + 1,
    });
  }
  const mintstone = new Runestone(edicts, none(), none(), none());

  // Add input Rune UTXO
  psbt.addInput({
    hash: data.utxo_txid,
    index: data.utxo_vout,
    witnessUtxo: {
      value: data.utxo_value,
      script: wallet.output,
    },
    tapInternalKey: Buffer.from(wallet.publicKey, "hex").subarray(1, 33),
  });
  // Add output runestone
  psbt.addOutput({
    script: mintstone.encipher(),
    value: 0,
  });

  // Add output rune utxo
  for (let i = 0; i < data.children.length; i++) {
    psbt.addOutput({
      address: data.children[i].address, // rune receive address
      value: data.children[i].utxo_value,
    });
  }

  console.log('psbt.toHex() :>> ', psbt.toHex());

  // Sign psbt using admin wallet
  const signedPsbt: Bitcoin.Psbt = wallet.signPsbt(psbt, wallet.ecPair);

  // return Virtual Size of Runestone Transaction
  return signedPsbt.extractTransaction().toHex();
};
