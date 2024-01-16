const mongoose = require("mongoose");

const PlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
    plans: {
      basic: {
        amount: {
          type: Number,
          required: true,
        },
        days: {
          type: Number,
          required: true,
        },
      },
      premium: {
        amount: {
          type: Number,
          required: true,
        },
        days: {
          type: Number,
          required: true,
        },
      },
      ultimate: {
        amount: {
          type: Number,
          required: true,
        },
        days: {
          type: Number,
          required: true,
        },
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Plan", PlanSchema);
