const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const Comment = require("../models/Comment");
const PostLike = require("../models/PostLike");
const PostDisLike = require("../models/PostDisLike");
const paginate = require("../util/paginate");
const cooldown = new Set();
const Subscriber = require("../models/PostSubscriber");

USER_LIKES_PAGE_SIZE = 9;

const checkUserSubscription = async (userId, profileOwnerId) => {
  try {
    const userIdStr = userId.toString();
    const profileOwnerIdStr = profileOwnerId.toString();

    if (userIdStr === profileOwnerIdStr) {
      console.log("User is the profile owner");
      return true;
    }

    if (
      !mongoose.Types.ObjectId.isValid(userIdStr) ||
      !mongoose.Types.ObjectId.isValid(profileOwnerIdStr)
    ) {
      console.log("Invalid userId or profileOwnerId");
      return false;
    }

    const currentDateTime = new Date();

    const subscription = await Subscriber.findOne({
      userId: mongoose.Types.ObjectId(userIdStr),
      profileOwnerId: mongoose.Types.ObjectId(profileOwnerIdStr),
      subscriptionStatus: "active",
      startDate: { $lte: currentDateTime },
      endDate: { $gte: currentDateTime },
    });

    return !!subscription;
  } catch (error) {
    console.error("Error in checkUserSubscription:", error);
    throw error;
  }
};

const createSubscription = async (userId, profileOwnerId, day) => {
  try {
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(profileOwnerId)
    ) {
      console.log("Invalid userId or profileOwnerId");
      return null;
    }

    if (userId === profileOwnerId) {
      console.log("A user cannot subscribe to themselves.");
      return null;
    }

    const endDate = new Date("2024-01-01T00:00:00.000+00:00");

    let subscription = await Subscriber.findOne({
      userId: mongoose.Types.ObjectId(userId),
      profileOwnerId: mongoose.Types.ObjectId(profileOwnerId),
    });

    if (subscription) {
      subscription.endDate = endDate;
      subscription.startDate = new Date();
      subscription.subscriptionStatus = "active";
    } else {
      subscription = new Subscriber({
        userId: mongoose.Types.ObjectId(userId),
        profileOwnerId: mongoose.Types.ObjectId(profileOwnerId),
        subscriptionStatus: "active",
        startDate: new Date(),
        endDate: endDate,
      });
    }

    await subscription.save();

    return subscription;
  } catch (error) {
    console.error("Error in createSubscription:", error);
    throw error;
  }
};

const checkUserTokenCount = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.token || user.token <= 0) {
      throw new Error("User does not have a positive token count");
    }

    return true;
  } catch (err) {
    throw err;
  }
};

const deductUserTokens = async (userId, tokenAmount) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    if (tokenAmount <= 0) {
      throw new Error("Invalid token amount to deduct");
    }

    if (!user.token || user.token < tokenAmount) {
      throw new Error("User does not have enough tokens");
    }

    user.token -= tokenAmount;

    await user.save();

    return `Successfully deducted ${tokenAmount} tokens from user ${userId}`;
  } catch (err) {
    throw err;
  }
};

const checkUserVerificationStatus = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    return user.verified;
  } catch (err) {
    throw err;
  }
};

const createPost = async (req, res) => {
  try {
    const { title, content, userId, isPrivate, username } = req.body;

    const isVerified = await checkUserVerificationStatus(userId);

    if (!isVerified) {
      throw new Error("User is not verified");
    }

    if (!(title && content)) {
      throw new Error("All input required");
    }

    if (cooldown.has(userId)) {
      throw new Error(
        "You are posting too frequently. Please try again shortly."
      );
    }

    cooldown.add(userId);
    setTimeout(() => {
      cooldown.delete(userId);
    }, 6);

    const post = await Post.create({
      title,
      content,
      poster: userId,
      isPrivate: isPrivate || false,
      username: username || null,
    });

    res.json(post);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

const getPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      throw new Error("Post does not exist");
    }

    const post = await Post.findById(postId)
      .populate("poster", "-password")
      .lean();

    // Check if the user is subscribed to the poster
    if (post.isPrivate) {
      const isSubscribed = await checkUserSubscription(userId, post.poster._id);
      if (!isSubscribed) {
        throw new Error(
          "This is a private post. You need to be a subscriber to view it."
        );
      }
    }

    if (!post) {
      throw new Error("Post does not exist");
    }

    if (userId) {
      await setLiked([post], userId);
    }

    await enrichWithUserLikePreview([post]);

    return res.json(post);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

const updatePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { content, userId, isAdmin } = req.body;

    const isVerified = await checkUserVerificationStatus(userId);

    if (!isVerified) {
      throw new Error("User is not verified");
    }
    const post = await Post.findById(postId);

    if (!post) {
      throw new Error("Post does not exist");
    }

    if (post.poster != userId && !isAdmin) {
      throw new Error("Not authorized to update post");
    }

    post.content = content;
    post.edited = true;

    await post.save();

    return res.json(post);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId, isAdmin } = req.body;

    const isVerified = await checkUserVerificationStatus(userId);

    if (!isVerified) {
      throw new Error("User is not verified");
    }

    const post = await Post.findById(postId);

    if (!post) {
      throw new Error("Post does not exist");
    }

    if (post.poster != userId && !isAdmin) {
      throw new Error("Not authorized to delete post");
    }

    await post.remove();

    await Comment.deleteMany({ post: post._id });

    return res.json(post);
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: err.message });
  }
};

const setLiked = async (posts, userId) => {
  let searchCondition = {};
  if (userId) searchCondition = { userId };

  const userPostLikes = await PostLike.find(searchCondition);

  posts.forEach((post) => {
    userPostLikes.forEach((userPostLike) => {
      if (userPostLike.postId.equals(post._id)) {
        post.liked = true;
        return;
      }
    });
  });
};

const enrichWithUserLikePreview = async (posts) => {
  const postMap = posts.reduce((result, post) => {
    result[post._id] = post;
    return result;
  }, {});

  const postLikes = await PostLike.find({
    postId: { $in: Object.keys(postMap) },
  })
    .limit(200)
    .populate("userId", "username");

  postLikes.forEach((postLike) => {
    const post = postMap[postLike.postId];
    if (!post.userLikePreview) {
      post.userLikePreview = [];
    }
    post.userLikePreview.push(postLike.userId);
  });
};

const getUserLikedPosts = async (req, res) => {
  try {
    const likerId = req.params.id;
    const { userId } = req.body;
    let { page, sortBy } = req.query;

    if (!sortBy) sortBy = "-createdAt";
    if (!page) page = 1;

    let posts = await PostLike.find({ userId: likerId })
      .sort(sortBy)
      .populate({ path: "postId", populate: { path: "poster" } })
      .lean();

    posts = paginate(posts, 10, page);

    const count = posts.length;

    let responsePosts = [];
    posts.forEach((post) => {
      responsePosts.push(post.postId);
    });

    if (userId) {
      await setLiked(responsePosts, userId);
    }

    await enrichWithUserLikePreview(responsePosts);

    return res.json({ data: responsePosts, count });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: err.message });
  }
};

const getPosts = async (req, res) => {
  try {
    const { userId } = req.body;
    let { page, sortBy, author, search, liked } = req.query;

    if (!sortBy) sortBy = "-likeCount"; // Default sort by likeCount
    if (!page) page = 1;

    const date24HoursAgo = new Date();
    date24HoursAgo.setHours(date24HoursAgo.getHours() - 24);

    let query = {
      createdAt: { $gte: date24HoursAgo },
      isPrivate: false,
    };

    let posts = await Post.find(query)
      .populate("poster", "-password")
      .sort(sortBy)
      .lean();

    if (search) {
      posts = posts.filter((post) =>
        post.title.toLowerCase().includes(search.toLowerCase())
      );
    }

    const count = posts.length;

    posts = paginate(posts, 10, page);

    if (userId) {
      await setLiked(posts, userId);
    }

    await enrichWithUserLikePreview(posts);

    return res.json({ data: posts, count });
  } catch (err) {
    console.log(err.message);
    return res.status(400).json({ error: err.message });
  }
};

const getPostsCOPY = async (req, res) => {
  try {
    console.log("getPosts called");
    const { userId } = req.body;

    // console.log("userId", userId);
    let { page, sortBy, author, search, liked } = req.query;

    console.log("author", liked);

    if (!sortBy) sortBy = "-createdAt";
    if (!page) page = 1;

    let posts = await Post.find({ isPrivate: false })
      .populate("poster", "-password")
      .sort(sortBy)
      .lean();

    if (search) {
      posts = posts.filter((post) =>
        post.title.toLowerCase().includes(search.toLowerCase())
      );
    }

    const count = posts.length;

    posts = paginate(posts, 10, page);

    if (userId) {
      await setLiked(posts, userId);
    }

    await enrichWithUserLikePreview(posts);

    // console.log("getPosts done", posts);

    return res.json({ data: posts, count });
  } catch (err) {
    console.log(err.message);
    return res.status(400).json({ error: err.message });
  }
};

const getPostsInProfile = async (req, res) => {
  try {
    const { userId } = req.body;
    let { page, author } = req.query;

    if (!author) {
      return res.status(400).json({ error: "Author is required" });
    }

    let sortBy = "-createdAt";
    if (!page) page = 1;

    const authorProfile = await User.findOne({ username: author });
    if (!authorProfile) {
      return res.status(404).json({ error: "Author not found" });
    }
    const profileOwnerId = authorProfile._id;

    const canViewPrivatePosts = await checkUserSubscription(
      userId,
      profileOwnerId
    );

    let query = { username: author };
    if (!canViewPrivatePosts) {
      query.isPrivate = false;
    }

    let posts = await Post.find(query).sort(sortBy).lean();

    const count = posts.length;

    posts = paginate(posts, 10, page);

    if (userId) {
      await setLiked(posts, userId);
    }

    await enrichWithUserLikePreview(posts);

    return res.json({ data: posts, count });
  } catch (err) {
    console.log(err.message);
    return res.status(400).json({ error: err.message });
  }
};

const likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId } = req.body;

    const isVerified = await checkUserVerificationStatus(userId);

    if (!isVerified) {
      throw new Error("User is not verified");
    }

    await checkUserTokenCount(userId);
    await deductUserTokens(userId, 1);

    const post = await Post.findById(postId);

    if (!post) {
      throw new Error("Post does not exist");
    }

    const existingPostLike = await PostLike.findOne({ postId, userId });

    if (existingPostLike) {
      throw new Error("Post is already Upvoted");
    }

    await PostLike.create({
      postId,
      userId,
    });

    post.likeCount = (await PostLike.find({ postId })).length;

    await post.save();

    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

const unlikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId } = req.body;

    const isVerified = await checkUserVerificationStatus(userId);

    if (!isVerified) {
      throw new Error("User is not verified");
    }

    const post = await Post.findById(postId);

    if (!post) {
      throw new Error("Post does not exist");
    }

    const existingPostLike = await PostLike.findOne({ postId, userId });

    if (!existingPostLike) {
      throw new Error("Post is already not down Voted");
    }

    await existingPostLike.remove();

    post.likeCount = (await PostLike.find({ postId })).length;

    await post.save();

    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

const disLikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId } = req.body;

    const isVerified = await checkUserVerificationStatus(userId);

    if (!isVerified) {
      throw new Error("User is not verified");
    }

    await checkUserTokenCount(userId);
    await deductUserTokens(userId, 1);

    const post = await Post.findById(postId);

    if (!post) {
      throw new Error("Post does not exist");
    }

    const existingPostLike = await PostDisLike.findOne({ postId, userId });

    if (existingPostLike) {
      throw new Error("Post is already Down Voted");
    }

    await PostDisLike.create({
      postId,
      userId,
    });

    post.disLikeCount = (await PostDisLike.find({ postId })).length;

    await post.save();

    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

const rmDisLikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId } = req.body;

    const isVerified = await checkUserVerificationStatus(userId);

    if (!isVerified) {
      throw new Error("User is not verified");
    }

    const post = await Post.findById(postId);

    if (!post) {
      throw new Error("Post does not exist");
    }

    const existingPostLike = await PostDisLike.findOne({ postId, userId });

    if (!existingPostLike) {
      throw new Error("Post is already not Down Voted");
    }

    await existingPostLike.remove();

    post.disLikeCount = (await PostDisLike.find({ postId })).length;

    await post.save();

    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

const getUserLikes = async (req, res) => {
  try {
    const { postId } = req.params;
    const { anchor } = req.query;

    const postLikesQuery = PostLike.find({ postId: postId })
      .sort("_id")
      .limit(USER_LIKES_PAGE_SIZE + 1)
      .populate("userId", "username");

    if (anchor) {
      postLikesQuery.where("_id").gt(anchor);
    }

    const postLikes = await postLikesQuery.exec();

    const hasMorePages = postLikes.length > USER_LIKES_PAGE_SIZE;

    if (hasMorePages) postLikes.pop();

    const userLikes = postLikes.map((like) => {
      return {
        id: like._id,
        username: like.userId.username,
      };
    });

    return res
      .status(400)
      .json({ userLikes: userLikes, hasMorePages, success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

module.exports = {
  getPost,
  getPosts,
  createPost,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  disLikePost,
  rmDisLikePost,
  getUserLikedPosts,
  getUserLikes,
  checkUserVerificationStatus,
  getPostsInProfile,
};
