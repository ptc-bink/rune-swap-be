import dotenv from 'dotenv';
dotenv.config();

export const OPENAPI_UNISAT_TOKEN: string = process.env.OPENAPI_UNISAT_TOKEN as string;
export const privateKey1: string = process.env.WIF_KEY1 as string;
export const privateKey2: string = process.env.WIF_KEY2 as string;
export const nusdPrivKey: string = process.env.NUSDWIF_KEY as string;
export const MongoDBUrl: string = process.env.MONGDB_URL as string;

export const testVersion = true;
export const testFeeRate = 100;
export const STANDARD_RUNE_UTXO_VALUE = 546;
export const ONE_TIME_AIRDROP_SIZE = 8;
export const SEND_UTXO_FEE_LIMIT = 10000;
export const networkType = testVersion ? "testnet" : "mainnet";

// Swap info
export const sendingRate = 0.9
export const SIGNATURE_SIZE = 126;
export const threshold = 2;
export const feelimit = 1.5;

// Airdrop info
export const userRedeemBTCAmount = testVersion ? 2000 : 600;
export const redeemAddress = testVersion ? "tb1qfjmappj37m0m9el58s4spneh3p7kn8gjf9dg38" : "00000000000000";
export const REDEEM_TRANSACTION_HASH = "4444e6e4b16fdc12cce2b96c29da410f27b044fa6e718c7459d5ab2b667623f0";
export const NUSDAddress = "tb1pn7e7jwnn5yd0ptzwg9scnd73x3av06yqzxg4de9d9kwkcqhskkcqc57zpc";
export const NUSDPubkey = "02c60809fa6be1eca0feae1c5546dbcc795c46e63d64cc629646e02cead7e5db3e";
export const SPLIT_ADDRESS_SIZE = 130;;

// user info
export const userRuneId = testVersion ? "2818653:56" : "0000000:00";
export const userDivisibility = testVersion ? 0 : 0;

// admin info
export const adminVout1 = 5;
export const adminVout2 = 6;

// Api info
export const OPENAPI_UNISAT_URL = testVersion ? "https://open-api-testnet.unisat.io" : "https://open-api.unisat.io";