const User = require("../models/User");
const Plan = require("../models/Plan");

const setOrUpdatePlan = async (req, res) => {
  const { userId } = req.body;
  const planUpdates = req.body;

  try {
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).send("User not found");
    }

    const validatePlanAmount = (plan) => {
      return plan.amount >= 10;
    };

    if (planUpdates.basic && !validatePlanAmount(planUpdates.basic)) {
      return res
        .status(400)
        .send("Basic plan amount must be at least 10 and non-negative");
    }
    if (planUpdates.premium && !validatePlanAmount(planUpdates.premium)) {
      return res
        .status(400)
        .send("Premium plan amount must be at least 10 and non-negative");
    }
    if (planUpdates.ultimate && !validatePlanAmount(planUpdates.ultimate)) {
      return res
        .status(400)
        .send("Ultimate plan amount must be at least 10 and non-negative");
    }

    let updateObject = {};
    if (planUpdates.basic) {
      updateObject["plans.basic"] = planUpdates.basic;
    }
    if (planUpdates.premium) {
      updateObject["plans.premium"] = planUpdates.premium;
    }
    if (planUpdates.ultimate) {
      updateObject["plans.ultimate"] = planUpdates.ultimate;
    }

    const updatedPlan = await Plan.findOneAndUpdate(
      { userId: userId },
      { $set: updateObject },
      { new: true, upsert: true }
    );

    res.status(200).json(updatedPlan);
  } catch (error) {
    res.status(500).send("Server error");
  }
};

module.exports = {
  setOrUpdatePlan,
};
