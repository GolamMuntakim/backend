const express = require('express');
const app = express();
require('dotenv').config()
const cors = require('cors');
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken')

const port = process.env.PORT || 5000;

// middleware 
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://ssl-blog-bd.netlify.app'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser())

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  console.log(token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access!!' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    console.log({ decoded })
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ajfjwu7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// 
async function run() {
    try {
      const usersCollection = client.db('ssl-blog').collection('users')
      const postCollection = client.db('ssl-blog').collection('post')
  
      // auth related api
      app.post('/jwt', async (req, res) => {
        const user = req.body
        console.log({ user })
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: '5h',
        })
        res
          .cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      })
      //logout
      app.get('/logout', async (req, res) => {
        try {
          res
            .clearCookie('token', {
              maxAge: 0,
              secure: process.env.NODE_ENV === 'production',
              sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            })
            .send({ success: true })
          console.log('Logout successful')
        } catch (err) {
          res.status(500).send(err)
        }
      })    
  
  
      //save user data in database
      app.put('/user', async (req, res) => {
        const user = req.body;
        console.log(user)
        const query = { name:user?.name , email: user?.email }
        console.log(query)
        //check if the user exist
        const isExist = await usersCollection.findOne(query)
        if (isExist) {
          return res.send(isExist)
        }
        // save user for the first time
        const options = { upsert: true }
        const updateDoc = {
          $set: {
            ...user,
            timestamp: Date.now(),
          },
        }
        console.log(user)
        const result = await usersCollection.updateOne(query, updateDoc, options)
        res.send(result)
      })
        //get all user data from database
    app.get('/users', verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })
    // get posts
    app.get('/get-post', async (req, res) => {
      const result = await postCollection.find().toArray()
      res.send(result)
    })
   
  
  
      //get user info by email from db 
      app.get('/user/:email', async (req, res) => {
        const email = req.params.email
        const result = await usersCollection.findOne({ email })
        res.send(result)
      })
     
      // make admin
    app.patch('/users/admin/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })
    // delete users
    app.delete('/users/:id', verifyToken, async (req, res) => {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) }
          const result = await usersCollection.deleteOne(query)
          res.send(result)
        })
         // block user
    app.patch('/users/block/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      try {
        // Find the user by ID to get their email
        const user = await usersCollection.findOne(filter);
        console.log(user)
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
        // Delete all properties added by this user
        const deleteResult = await usersCollection.deleteMany({ 'user.email': user.email });
        console.log(`Deleted ${deleteResult.deletedCount} properties added by user ${user.email}`);
        // Update user role to fraud
        const updatedDoc = {
          $set: {
            role: 'blocked'
          }
        };
        const updateResult = await usersCollection.updateOne(filter, updatedDoc);
        if (updateResult.modifiedCount > 0) {
          res.send({ message: 'User role updated to fraud and properties deleted', modifiedCount: updateResult.modifiedCount });
        } else {
          res.status(500).send({ message: 'Failed to update user role' });
        }
      } catch (error) {
        console.error('Error updating user role and deleting properties:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

      
       //save post data in db
    app.post('/post', verifyToken, async (req, res) => {
      const propertyData = req.body
      const result = await postCollection.insertOne(propertyData)
      res.send(result)
    })
    //get all in post from db
        app.get('/all-post', async (req, res) => {
          const search = req.query.search
          let query = {
            title: { $regex: search, $options: 'i' }
          }
          const result = await postCollection.find(query).toArray()
          res.send(result)
        })
        // users added post
        app.get('/my-added/:email', verifyToken, async (req, res) => {
          const email = req.params.email
          let query = { 'users.email': email }
          const result = await postCollection.find(query).toArray()
          res.send(result)
        })
        // delete user post
        app.delete('/post/:id', verifyToken, async (req, res) => {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) }
          const result = await postCollection.deleteOne(query)
          res.send(result)
        })
        // update post data
    app.put('/post/update/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const prostData = req.body
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: prostData,
      }
      const result = await postCollection.updateOne(query, updateDoc)
      res.send(result)
    })
     //get single property data using _id
     app.get('/details/:id', async (req, res) => {
      const id = req.params.id
      const result = await postCollection.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })
      // await client.db("admin").command({ ping: 1 });
      console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
      // Ensures that the client will close when you finish/error
      // await client.close();
    }
  }
  run().catch(console.dir);
  
  
  app.get('/', (req, res) => {
    res.send('blog')
  })
  app.listen(port, () => {
    console.log(`blog ${port}`);
  })