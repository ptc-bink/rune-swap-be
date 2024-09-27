import mongoose from "mongoose";

const TaprootMultisig = new mongoose.Schema({
  cosigner: [
    { type: String, required: true }
  ],
  threshold: { type: Number, required: true },
  privateKey: { type: String, required: true },
  tapscript: { type: String, required: true },
  address: { type: String, required: true },
  txBuilding: { type: Boolean, required: true },
  txId: { type: String, required: false },
  assets: {
    runeId1: { type: String, required: false },
    runeId2: { type: String, required: false },
    runeAmount1: { type: Number, required: false },
    runeAmount2: { type: Number, required: false },
    divisibility1: { type: Number, required: false },
    divisibility2: { type: Number, required: false },
  },
  createdAt: { type: Date, default: new Date() },
});

const TaprootMultisigModal = mongoose.model("Taprootmultisig", TaprootMultisig);

export default TaprootMultisigModal;