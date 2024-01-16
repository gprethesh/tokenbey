const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    address_in: {
      type: String,
      required: true,
      trim: true,
    },
    coinType: {
      type: String,
      required: true,
      trim: true,
    },
    TransactionType: {
      type: String,
    },
    amountSent: {
      type: Number,
      required: true,
    },
    txid_out: {
      type: String,
      required: true,
      trim: true,
    },
    transactionFee: {
      type: Number,
      required: true,
    },
    transactionDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      default: "Completed",
      enum: ["Pending", "Completed", "Failed"],
    },
  },
  { timestamps: true }
);

transactionSchema.index({ transactionId: 1, userId: 1 });

transactionSchema.methods.toJSON = function () {
  const transaction = this;
  const transactionObject = transaction.toObject();

  delete transactionObject.__v; // Remove version key

  return transactionObject;
};

// Static method example
transactionSchema.statics.findByTransactionId = function (transactionId) {
  return this.findOne({ transactionId });
};

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
