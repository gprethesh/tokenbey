const express = require("express");
const router = express.Router();
const postControllers = require("../controllers/postControllers");
const { verifyToken, optionallyVerifyToken } = require("../middleware/auth");

router.get("/", verifyToken, postControllers.getPosts);
router.get("/place", verifyToken, postControllers.getPostsInProfile);
router.post("/", verifyToken, postControllers.createPost);
router.post(
  "/checkVerificatiom/:id",
  verifyToken,
  postControllers.checkUserVerificationStatus
);

router.get("/:id", verifyToken, postControllers.getPost);
router.patch("/:id", verifyToken, postControllers.updatePost);
router.delete("/:id", verifyToken, postControllers.deletePost);

router.post("/like/:id", verifyToken, postControllers.likePost);
router.delete("/like/:id", verifyToken, postControllers.unlikePost);

router.post("/dislike/:id", verifyToken, postControllers.disLikePost);
router.delete("/dislike/:id", verifyToken, postControllers.rmDisLikePost);

router.get("/liked/:id", verifyToken, postControllers.getUserLikedPosts);
router.get("/like/:postId/users", postControllers.getUserLikes);

module.exports = router;
