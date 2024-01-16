const mongoose = require("mongoose");

const SubscriberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
    profileOwnerId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "expired"],
    },
    subscriptionType: {
      type: String,
      enum: ["basic", "premium", "ultimate"],
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("subscriber", SubscriberSchema);
