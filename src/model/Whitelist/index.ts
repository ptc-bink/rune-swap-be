import mongoose from "mongoose";

const WhiteList = new mongoose.Schema({
    address: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: Number, required: true },
    sendBtcTxId: { type: String, required: false },
    receiveRuneTxId: { type: String, required: false },
    createdAt: { type: Date, default: new Date() },
});

// Status 0 : User is listed but not claimed
// Status 1 : User claimed but sendBTC Tx not confirmed
// Status 2 : User sendBTC Tx confirmed
// Status 3 : User airdropped but not confirmed
// Status 4 : Airdrop Tx confirmed

const WhiteListModal = mongoose.model("WhiteList", WhiteList);

export default WhiteListModal;