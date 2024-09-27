export interface IRuneUtxo {
    txid: string;
    vout: number;
    value: number;
    scriptpubkey: string;
    amount: number;
}

export interface IWhiteList {
    musigId: string,
    address: string,
    amount: string,
    status: number
    sendBtcTxId: string,
    receiveRuneTxId: string,
}

export interface IUTXO {
    txid: string;
    vout: number;
    status: {
        confirmed: boolean;
        block_height: number;
        block_hash: string;
        block_time: number;
    };
    value: number;
}

export interface ITXSTATUS {
    confirmed: boolean,
    block_height: number,
    block_hash: string,
    block_time: number
}

export interface IUtxo {
    txid: string;
    vout: number;
    value: number;
    scriptpubkey?: string;
    amount?: number,
    divisibility?: number
}

export interface IRuneUtxo {
    txid: string;
    vout: number;
    value: number;
    scriptpubkey: string;
    amount: number;
    divisibility: number;
}

export enum WalletTypes {
    UNISAT = "Unisat",
    XVERSE = "Xverse",
    HIRO = "Hiro",
    OKX = "Okx",
}

// Initialize tree element file type
export interface ITreeItem {
    address: string;
    total_amount: number;
    children: Array<ITreeItem>;
    utxo_value: number;
    utxo_txid: string;
    utxo_vout: number;
}

export interface IWIFWallet {
    networkType: string;
    privateKey: string;
}

export interface ISeedWallet {
    networkType: string;
    seed: string;
    index: number;
}

export interface IMusigAssets {
    leafPubkeys: any,
    threshold: number,
    privateKey: string,
}