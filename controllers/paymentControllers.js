const BlockBee = require("@blockbee/api");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
let crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const Plan = require("../models/Plan");
const Subscriber = require("../models/PostSubscriber");

const apiKey = process.env.API;

const callbackUrl =
  "https://8rn6q1r6-4000.inc1.devtunnels.ms/api/users/callback";

let pubkey =
  "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3FT0Ym8b3myVxhQW7ESuuu6lo\ndGAsUJs4fq+Ey//jm27jQ7HHHDmP1YJO7XE7Jf/0DTEJgcw4EZhJFVwsk6d3+4fy\nBsn0tKeyGMiaE6cVkX0cy6Y85o8zgc/CwZKc0uw6d5siAo++xl2zl+RGMXCELQVE\nox7pp208zTvown577wIDAQAB\n-----END PUBLIC KEY-----";

const createPaymentAddress = async (coin, req, type) => {
  try {
    let { userId } = req.body;
    if (!userId) {
      throw new Error("User is not found");
    }
    userId = userId + "@" + type;
    const uniqueid = uuidv4();

    const blockbeeParams = {
      confirmations: 3,
      uniqueid: uniqueid,
    };
    const bb = new BlockBee(
      coin,
      "",
      callbackUrl,
      userId,
      blockbeeParams,
      apiKey
    );

    // console.log("bb", bb);

    const address = await bb.getAddress();
    // console.log("address", address);
    return address;
  } catch (error) {
    console.error("Error in createPaymentAddress:", error.message);
    throw error;
  }
};

const makePaymemt = async (req, res) => {
  try {
    const mode = req.query.mode;
    if (!mode || (mode !== "TOPUP" && mode !== "VERIFICATION")) {
      throw new Error(
        "Invalid or missing mode parameter. Expected 'TOPUP' or 'VERIFICATION'."
      );
    }
    const coin = "ltc";

    const conversion = await BlockBee.getConvert(coin, "1", "usdt", apiKey);

    let amount;
    if (conversion && conversion.value_coin) {
      const valueCoin = parseFloat(conversion.value_coin);
      const additional20Percent = valueCoin * 0.2;
      amount = valueCoin + additional20Percent;

      amount = amount.toFixed(8);
    } else {
      amount = "0.03";
    }

    const fees = await BlockBee.getEstimate(coin, apiKey, 1, "default");

    const paymentAddress = await createPaymentAddress(coin, req, mode);

    return res.status(200).json({ paymentAddress, amount, coin, conversion });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

async function updateUserVerificationStatus(userId) {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { verified: true },
      { new: true }
    );

    if (!updatedUser) {
      throw new Error(`User with ID ${userId} not found.`);
    }
    console.log("USER VERIFIED SUCCESSFULLY");
  } catch (error) {
    throw error;
  }
}

async function updateToken(userId, tokenAmount) {
  try {
    const conversion = await BlockBee.getConvert("ltc", "1", "usdt", apiKey);
    // console.log("conversion", conversion.value_coin);
    // console.log("tokenAmount in LTC", tokenAmount);

    if (tokenAmount < conversion.value_coin) {
      throw new Error(
        "Token amount is less than the minimum required ($1 equivalent in LTC)."
      );
    }

    const tokenRate = 10;
    const incrementAmount = Math.round(
      (tokenAmount / conversion.value_coin) * tokenRate
    );

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      { $inc: { token: incrementAmount } },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    console.log(
      `User ${userId}'s token balance updated by ${incrementAmount} tokens.`
    );
  } catch (error) {
    console.error(`Error updating token balance: ${error.message}`);
    throw error;
  }
}

const confirmPayment = async (req, res) => {
  try {
    // console.log("everything ok");
    let sig_b64 = req.headers["x-ca-signature"];

    let signature = new Buffer.from(sig_b64, "base64");

    // console.log("end of keys");

    let data;
    let userId;
    let verificationTag;

    if (req.method === "GET") {
      // console.log("inside of get method");

      const decodedQuery = {};
      for (const key in req.query) {
        decodedQuery[key] = decodeURIComponent(req.query[key]);
      }

      const userIdParts = Object.keys(decodedQuery)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .filter((key) => !isNaN(key))
        .map((key) => decodedQuery[key]);

      userId = userIdParts.join("");

      const splitUserId = userId.split("@");
      if (splitUserId.length > 1) {
        userId = splitUserId[0];
        verificationTag = splitUserId[1];
      }

      try {
        userId = mongoose.Types.ObjectId(userId);
      } catch (error) {
        console.error("Invalid userId:", error);
        return;
      }

      data = "https://8rn6q1r6-4000.inc1.devtunnels.ms" + req.originalUrl;

      // console.log("userId:", userId);
      // console.log("verificationTag:", verificationTag);
    }

    if (verify(data, pubkey, signature)) {
      // console.log("SUCCESS");
      const {
        address_in,
        confirmations,
        txid_in,
        txid_out,
        fee_coin,
        value_coin,
        coin,
      } = req.query;

      const existingTransaction = await Transaction.findOne({ txid_in });
      if (existingTransaction) {
        // console.log("Transaction already processed");
        return res
          .status(409)
          .json({ "Transaction already processed": txid_in });
      }

      const newTransaction = new Transaction({
        transactionId: txid_in,
        userId,
        address_in,
        coinType: coin,
        TransactionType: verificationTag,
        amountSent: value_coin,
        txid_out,
        transactionFee: fee_coin,
        transactionDate: new Date(),
        status: "Completed",
      });

      try {
        if (verificationTag === "VERIFICATION") {
          await updateUserVerificationStatus(userId);
        } else if (verificationTag === "TOPUP") {
          await updateToken(userId, value_coin);
        } else {
          // console.error("Wrong payment mode");
          return res.status(400).json({ error: "Wrong payment mode" });
        }

        await newTransaction.save();
        console.log("Transaction saved successfully");
        res.status(200).send("Transaction processed successfully");
      } catch (error) {
        console.error("Error during processing:", error.message);
        res.status(500).json({ error: error.message });
      }
    } else {
      console.log("Invalid signature");
      res.status(401).send("Invalid signature");
    }
  } catch (error) {
    console.log("error", error.message);
    return res.status(400).json({ error: error.message });
  }
};

function verify(data, pubkey, signature) {
  let verifier = crypto.createVerify("RSA-SHA256");

  verifier.update(data);
  return verifier.verify(pubkey, signature);
}

const subPaymentAddress = async (coin, type, userId, sub) => {
  try {
    Id = `${type}@${userId}@${sub}`;

    const uniqueid = uuidv4();

    const blockbeeParams = {
      confirmations: 3,
      uniqueid: uniqueid,
    };
    const bb = new BlockBee(coin, "", callbackUrl, Id, blockbeeParams, apiKey);

    // console.log("bb", bb);

    const address = await bb.getAddress();
    // console.log("address", address);
    // console.log("ok - subPaymentAddress");
    return address;
  } catch (error) {
    console.error("Error in subPaymentAddress:", error.message);
    throw error;
  }
};

const SubMakePayment = async (req, res) => {
  try {
    const mode = req.query.mode;
    const { userId } = req.body;
    const sub = req.query.sub;
    const coin = "bep20_usdt";

    if (
      !mode ||
      (mode !== "basic" && mode !== "premium" && mode !== "ultimate")
    ) {
      throw new Error(
        "Invalid or missing mode parameter. Expected 'basic/premium/ultimate'."
      );
    }
    if (!sub) {
      throw new Error("Invalid or missing subscriber's id.");
    }
    // console.log("userId", userId);

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).send("User not found");
    }

    const subscription = await Plan.findOne({ userId: sub });
    if (!subscription) {
      return res.status(404).send("This user has set up no subscription plan");
    }

    const planDetails = subscription.plans[mode];

    if (JSON.stringify(planDetails) === "{}") {
      return res.status(404).send(`No ${mode} plan found for this user`);
    }

    const paymentAddress = await subPaymentAddress(coin, mode, userId, sub);

    return res.status(200).json({ paymentAddress, planDetails, coin });
  } catch (err) {
    console.log("error", err);
    return res.status(400).json({ error: err.message });
  }
};

const createSubscription = async (userId, profileOwnerId, mode, value_coin) => {
  try {
    // Validate user IDs
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(profileOwnerId)
    ) {
      console.log("Invalid userId or profileOwnerId");
      throw new Error(`Invalid userId or profileOwnerId`);
    }

    if (userId === profileOwnerId) {
      console.log("A user cannot subscribe to themselves.");
      throw new Error(`A user cannot subscribe to themselves.`);
    }

    const subscriptionPlan = await Plan.findOne({ userId: profileOwnerId });
    if (!subscriptionPlan) {
      throw new Error(`This user has set up no subscription plan`);
    }

    const planDetails = subscriptionPlan.plans[mode];

    if (JSON.stringify(planDetails) === "{}") {
      throw new Error(`No ${mode} plan found for this user`);
    }

    const daysToAdd = planDetails.days;
    const amount = planDetails.amount;

    if (value_coin < amount) {
      throw new Error(`The ${value_coin} amount sent is lessthan ${amount} `);
    }

    const baseDate = new Date();

    function addDays(date, days) {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    }

    const endDate = addDays(baseDate, daysToAdd);

    console.log("End Date:", endDate.toISOString());

    // Check if a subscription already exists
    let subscription = await Subscriber.findOne({
      userId: mongoose.Types.ObjectId(userId),
      profileOwnerId: mongoose.Types.ObjectId(profileOwnerId),
    });

    if (subscription) {
      // Subscription exists, update it
      subscription.endDate = endDate.toISOString();
      subscription.startDate = new Date();
      subscription.subscriptionStatus = "active";
      subscription.subscriptionType = mode;
    } else {
      // Create a new subscription object
      subscription = new Subscriber({
        userId: mongoose.Types.ObjectId(userId),
        profileOwnerId: mongoose.Types.ObjectId(profileOwnerId),
        subscriptionStatus: "active",
        subscriptionType: mode,
        startDate: new Date(),
        endDate: endDate.toISOString(),
      });
    }

    await subscription.save();

    return subscription;
  } catch (error) {
    console.error("Error in createSubscription:", error);
    throw error;
  }
};

const SubConfirmPayment = async (req, res) => {
  try {
    let sig_b64 = req.headers["x-ca-signature"];

    let signature = new Buffer.from(sig_b64, "base64");

    let data;
    let userId;
    let mode;
    let sub;

    if (req.method === "GET") {
      console.log("inside of get method");

      const decodedQuery = {};
      for (const key in req.query) {
        decodedQuery[key] = decodeURIComponent(req.query[key]);
      }

      const userIdParts = Object.keys(decodedQuery)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .filter((key) => !isNaN(key))
        .map((key) => decodedQuery[key]);

      let combinedUserId = userIdParts.join("");

      const splitUserId = combinedUserId.split("@");
      if (splitUserId.length === 3) {
        mode = splitUserId[0];
        userId = splitUserId[1];
        sub = splitUserId[2];

        try {
          userId = mongoose.Types.ObjectId(userId);
          sub = mongoose.Types.ObjectId(sub);
        } catch (error) {
          console.error("Invalid format for userId or sub:", error);
          return;
        }
      } else {
        console.error("Invalid format for combinedUserId");
        return;
      }

      data = "https://8rn6q1r6-4000.inc1.devtunnels.ms" + req.originalUrl;

      console.log("mode", mode);
      console.log("userId", userId);
      console.log("sub", sub);
    }

    if (!verify(data, pubkey, signature)) {
      console.log("SUCCESS");
      const {
        address_in,
        confirmations,
        txid_in,
        txid_out,
        fee_coin,
        value_coin,
        coin,
      } = req.query;

      const existingTransaction = await Transaction.findOne({ txid_in });
      if (existingTransaction) {
        console.log("Transaction already processed");
        return res
          .status(409)
          .json({ "Transaction already processed": txid_in });
      }

      const newTransaction = new Transaction({
        transactionId: txid_in,
        userId,
        address_in,
        coinType: coin,
        TransactionType: mode,
        amountSent: value_coin,
        txid_out,
        transactionFee: fee_coin,
        transactionDate: new Date(),
        status: "Completed",
      });

      try {
        if (mode === "basic" || mode === "premium" || mode === "ultimate") {
          await createSubscription(userId, sub, mode, value_coin);
        } else {
          console.error("Wrong payment mode");
          return res.status(400).json({ error: "Wrong payment mode" });
        }

        await newTransaction.save();
        // console.log("Transaction saved successfully");
        res.status(200).send("Transaction processed successfully");
      } catch (error) {
        console.error("Error during processing:", error.message);
        res.status(500).json({ error: error.message });
      }
    } else {
      console.log("Invalid signature");
      res.status(401).send("Invalid signature");
    }
  } catch (error) {
    console.log("error", error.message);
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  makePaymemt,
  confirmPayment,
  SubMakePayment,
  SubConfirmPayment,
};
