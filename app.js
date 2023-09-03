const express = require("express");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

// connection between database and server

let db = null;
const intializeServerAndDatabase = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Started Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`Database Error: ${e.message}`);
    process.exit(1);
  }
};

intializeServerAndDatabase();

//Authenticate With Jwt Token
const jwtTokenAuthencation = (request, response, next) => {
  const authorization = request.headers["authorization"];
  let jwtToken;
  if (authorization === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authorization.split(" ")[1];
    jwt.verify(jwtToken, "Rakesh_User", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        //console.log(payload);
        request.username = payload;
        next();
      }
    });
  }
};

// Authenticate user
const authenticateUser = async (request, response, next) => {
  const { username } = request.username;
  const { tweetId } = request.params;
  const getTweetUserId = `
    SELECT 
    user_id 
    FROM tweet 
    WHERE 
    tweet_id = ${tweetId} 
    `;
  const responseDb1 = await db.get(getTweetUserId);
  const followingId = responseDb1.user_id;
  //console.log(followingId);

  const getFollwerUserId = ` 
    SELECT 
    user_id 
    FROM 
    user 
    WHERE 
    username = "${username}"
    `;
  const responseDb2 = await db.get(getFollwerUserId);
  const Follower_id = responseDb2.user_id;
  request.user_id = Follower_id;

  const getFollowingUserIds = `
    SELECT 
    following_user_id AS following_user_id 
    FROM follower 
    WHERE 
    follower_user_id = ${Follower_id}
    `;
  const responseDb3 = await db.all(getFollowingUserIds);
  //console.log(responseDb3);
  const index = responseDb3.findIndex((eachItem) => {
    if (eachItem.following_user_id === followingId) {
      return true;
    } else {
      return false;
    }
  });
  if (index === -1) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

// API 1 (Register User)

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const getUser = `
    SELECT 
    * 
    FROM 
    user 
    WHERE username = "${username}"
    `;
  const responseDb = await db.get(getUser);
  //console.log(responseDb);
  if (responseDb !== undefined) {
    //console.log(responseDb);
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const createUser = `
      INSERT INTO user(username,name,password,gender) 
      VALUES ("${username}","${name}","${hashedPassword}","${gender}")
      `;
    await db.run(createUser);
    response.status(200);
    response.send("User created successfully");
  }
});

// API 2 (LOGIN USER)
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUser = ` 
    SELECT 
    * 
    FROM 
    user 
    WHERE 
    username = "${username}"
    `;
  const responseDb = await db.get(getUser);
  if (responseDb === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const verifyPassword = await bcrypt.compare(password, responseDb.password);
    if (verifyPassword === true) {
      const payLoad = {
        username: username,
      };
      const jwtToken = jwt.sign(payLoad, "Rakesh_User");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// convert to snake_case to camelCase(tweet)
const convertToCamelCaseTweet = (database) => {
  return {
    userName: database.username,
    tweet: database.tweet,
    dateTime: database.date_time,
  };
};
// API 3 (GET ALL tweets )
app.get(
  "/user/tweets/feed/",
  jwtTokenAuthencation,
  async (request, response) => {
    const { username } = request.username;
    const getUSerId = ` SELECT 
    user_id 
    FROM user 
    WHERE 
    username = "${username}"
    `;
    const responseDb1 = await db.get(getUSerId);
    const user_id = responseDb1.user_id;

    const getFollowingUsers = ` SELECT
    following_user_id 
    FROM 
    follower 
    WHERE 
    follower_user_id = ${user_id}
    `;
    const responseDb2 = await db.all(getFollowingUsers);
    const followingUsers = [];
    for (let item of responseDb2) {
      followingUsers.push(item.following_user_id);
    }
    console.log(followingUsers);

    const getTweets = `
    SELECT 
    user.username AS userName,
    tweet.tweet as tweet,
    tweet.date_time AS dateTime
    FROM tweet INNER JOIN user ON user.user_id = tweet.user_id 
    WHERE tweet.user_id IN (${followingUsers}) 
    ORDER BY tweet.date_time DESC,
    tweet.user_id ASC
    LIMIT 4
    OFFSET 0
    `;
    const responseDb3 = await db.all(getTweets);
    console.log(responseDb3);
    response.send(responseDb3);
  }
);
// API 4 (GET User Following)
app.get("/user/following/", jwtTokenAuthencation, async (request, response) => {
  const { username } = request.username;
  let id;
  const getUSerId = ` SELECT
     user_id
     FROM 
     user
     WHERE  
     username = "${username}"
  `;
  const responseDb1 = await db.get(getUSerId);
  id = responseDb1.user_id;
  console.log(id);

  const getFollowingDetails = `SELECT 
  user.name 
  FROM user INNER JOIN follower ON user.user_id = follower.following_user_id 
  WHERE 
  follower.follower_user_id = ${id} 
   
  `;
  const responseDb2 = await db.all(getFollowingDetails);
  response.send(responseDb2);
});
// API 5 (GET User Followers)
app.get("/user/followers/", jwtTokenAuthencation, async (request, response) => {
  const { username } = request.username;
  let id;
  const getUSerId = ` SELECT
     user_id
     FROM 
     user
     WHERE  
     username = "${username}"
  `;
  const responseDb1 = await db.get(getUSerId);
  id = responseDb1.user_id;
  console.log(id);

  const getFollowingDetails = `SELECT 
  user.name 
  FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id 
  WHERE 
  follower.following_user_id = ${id} 
   
  `;
  const responseDb2 = await db.all(getFollowingDetails);
  response.send(responseDb2);
});

// API 6 (GET TWEET )
app.get(
  "/tweets/:tweetId/",
  jwtTokenAuthencation,
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetStatsQuery = `
         SELECT
         T.tweet AS tweet,
         COUNT(DISTINCT T.like_id) AS likes,
         COUNT(DISTINCT reply.reply_id) AS replies,
         tweet.date_time AS dateTime
          FROM 
          (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS T 
          INNER JOIN reply ON T.tweet_id = reply.tweet_id
          WHERE
          tweet.tweet_id = ${tweetId}
        `;
    const responseDb4 = await db.get(getTweetStatsQuery);
    response.send(responseDb4);
  }
);

// API 7
app.get(
  "/tweets/:tweetId/likes",
  jwtTokenAuthencation,
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetStatsQuery = `
         SELECT
         user.username AS username 
         FROM
         like INNER JOIN user ON like.user_id = user.user_id
         WHERE 
         like.tweet_id = ${tweetId}
        `;
    const responseDb4 = await db.all(getTweetStatsQuery);
    //console.log(responseDb4);
    let users = [];
    for (let user of responseDb4) {
      users.push(user.username);
    }
    response.send({ users });
  }
);

// API 8(GET REPLIES)
app.get(
  "/tweets/:tweetId/replies/",
  jwtTokenAuthencation,
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `SELECT
     user.name AS name,
     reply.reply AS reply
     FROM 
     reply INNER JOIN user ON reply.user_id = user.user_id 
     WHERE
     reply.tweet_id = ${tweetId}
    `;
    const responseDb = await db.all(getRepliesQuery);
    response.send({ replies: responseDb });
  }
);

// API 9 (GET ALL TWEETS)
app.get("/user/tweets/", jwtTokenAuthencation, async (request, response) => {
  const { username } = request.username;
  const getUserId = ` SELECT 
user_id 
FROM 
user 
WHERE 
user.username = "${username}"
`;
  const responseDb1 = await db.get(getUserId);
  const user_id = responseDb1.user_id;
  const tweetObj = {};
  console.log(user_id);
  const gteAllTweets = `
  SELECT 
  T.tweet AS tweet,
  COUNT(DISTINCT T.like_id) AS likes,
  COUNT(DISTINCT reply.reply_id) AS replies,
  T.date_time AS dateTime

  FROM (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) 
  AS T INNER JOIN reply ON T.tweet_id = reply.tweet_id
  WHERE tweet.user_id = ${user_id}

  `;
  const responseDb = await db.all(gteAllTweets);
  response.send(responseDb);
});

// API 10 (POST TWEET)
app.post("/user/tweets/", jwtTokenAuthencation, async (request, response) => {
  const { tweet } = request.body;
  const createTweetQuery = `
    INSERT INTO tweet(tweet) 
    VALUES ("${tweet}")
    `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// API 11 (DELETE TODO)
app.delete(
  "/tweets/:tweetId/",
  jwtTokenAuthencation,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request.username;

    const getTweetUserId = ` 
    SELECT 
    user_id 
    FROM 
    tweet 
    WHERE tweet_id = ${tweetId} 
    `;
    const responseDb1 = await db.get(getTweetUserId);
    const tweetUserId = responseDb1.user_id;

    const getUserId = `
  SELECT 
  user_id
  FROM 
  user 
  WHERE username = "${username}"
  `;
    const responseDb2 = await db.get(getUserId);
    const user_id = responseDb2.user_id;

    if (tweetUserId === user_id) {
      const deleteTweetQuery = `
      DELETE FROM tweet 
      WHERE tweet_id = ${tweetId}
      `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
