import { Psbt, Transaction } from "bitcoinjs-lib";

import { createAirdropRunestoneTx } from "../psbt/createAirdropRunestoneTx";
import { ITreeItem } from '../../utils/type';
import { pushBTCpmt } from "../service";
import { networkType } from "../../config/config";

export const treeTravelAirdrop = async (
  data: ITreeItem,
  runeId: string,
  seed: string
): Promise<ITreeItem> => {
  if (data.children.length == 0) {
    return data;
  } else {
    // implementation to create/broadcast transaction, will update the children's utxo data

    //create recursive runestone transaction
    const txHex: string = createAirdropRunestoneTx(data, runeId, seed);

    ////////////////////////////////////////////////////////////////////////////////
    //
    // broadcast transaction on live version
    const txid: any = await pushBTCpmt(txHex);
    //
    ////////////////////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////////
    // remove on live version
    // const txid: string =
    //   "cbef6b81b45a9b4c859928292589701cc058032a5bd8711ab649807b9402188c";
    //
    ////////////////////////////////////////////////////////////////////////////////

    console.log("Sent Runestone Airdrop Transaction => ", txid);

    for (let i = 0; i < data.children.length; i++) {
      // update child item's utxo_txid, utxo_vout field
      data.children[i].utxo_txid = txid;
      data.children[i].utxo_vout = i + 1;
    }
    // initialize new updated Children array
    let updatedChildrenData: Array<ITreeItem> = [];

    // Loop the recursive function
    for (let i = 0; i < data.children.length; i++) {
      // Push new updated item to the instance array
      updatedChildrenData.push(
        await treeTravelAirdrop(data.children[i], runeId, seed)
      );
    }
    return {
      ...data,
      children: updatedChildrenData,
    };
  }
};
