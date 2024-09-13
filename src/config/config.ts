import dotenv from 'dotenv';
dotenv.config();

export const testVersion = true;
export const sendingRate = 0.9
export const OPENAPI_UNISAT_TOKEN = process.env.OPENAPI_UNISAT_TOKEN;
export const SIGNATURE_SIZE = 126;
export const threshold = 2;

export const feelimit = 1.5;
export const testFeeRate = 1000;

export const OPENAPI_UNISAT_URL = testVersion ? "https://open-api-testnet.unisat.io" : "https://open-api.unisat.io";

// user info
export const userRuneId = "2818689:38"
export const userDivisibility = 0

// admin info
export const adminVout1 = 5;
export const adminVout2 = 6;