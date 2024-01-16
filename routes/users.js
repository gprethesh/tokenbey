const express = require("express");
const router = express.Router();
const userControllers = require("../controllers/userControllers");
const paymentControllers = require("../controllers/paymentControllers");
const planControllers = require("../controllers/planControllers");
const { check } = require("express-validator");
const { verifyToken } = require("../middleware/auth");

router.post("/register", userControllers.register);
router.post("/login", userControllers.login);
router.get("/random", userControllers.getRandomUsers);

router.get("/pay", verifyToken, paymentControllers.makePaymemt);
router.get("/callback", paymentControllers.confirmPayment);

router.get("/callbacksub", paymentControllers.SubConfirmPayment);

router.get("/plan", verifyToken, planControllers.setOrUpdatePlan);
router.get("/subpay", verifyToken, paymentControllers.SubMakePayment);

router.get("/:username", userControllers.getUser);
router.patch("/:id", verifyToken, userControllers.updateUser);

router.post("/follow/:id", verifyToken, userControllers.follow);
router.delete("/unfollow/:id", verifyToken, userControllers.unfollow);

router.get("/followers/:id", userControllers.getFollowers);
router.get("/following/:id", userControllers.getFollowing);

module.exports = router;
