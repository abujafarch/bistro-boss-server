const express = require('express')
const app = express()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')

// const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;


//middlewares
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send(`Your Boss server now running for what have you done`)
})




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.f46fr3f.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const database = client.db('bistroDb')
        const menuCollection = database.collection('menu')
        const reviewsCollection = database.collection('reviews')
        const cartCollection = database.collection('carts')
        const usersCollection = database.collection('users')
        const paymentCollection = database.collection('payments')

        //jwt related apis
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        })

        //own middlewares
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization)
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'forbidden access' })
            }

            const token = req.headers.authorization.split(' ')[1]
            console.log(token);
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Forbidden access' })
                }
                req.decoded = decoded
                next()
            })
        }

        //verifyAdmin using middleware
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded?.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }

        //USER RELATED APIS

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded?.email) {
                return res.status(403).send({ message: 'unauthorized access' })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let admin = false
            if (user) {
                admin = user?.role === 'admin'
            }
            res.send({ admin })
        })

        app.post('/users', async (req, res) => {
            const user = req.body
            console.log(user);
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'User already exists', insertedId: null })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })


        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray()
            res.send(result)
        })

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body
            const result = await menuCollection.insertOne(item)
            res.send(result)
        })

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.deleteOne(query)
            res.send(result)
        })

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: id }
            const result = await menuCollection.findOne(query)
            // console.log(result);
            res.send(result)
        })

        app.patch('/menu/:id', async (req, res) => {
            const id = req.params.id
            const item = req.body
            const filter = { _id: id }
            const updateDoc = {
                $set: {
                    name: item.name,
                    recipe: item.recipe,
                    price: item.price,
                    category: item.category,
                    image: item.image
                }
            }
            const result = await menuCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray()
            res.send(result)
        })


        app.get('/carts', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await cartCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const item = req.body
            const result = await cartCollection.insertOne(item)
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query)
            res.send(result)
        })

        //payment intent 
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body
            const amount = parseInt(price * 100)
            console.log(amount, "inside amount payment");
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body
            const paymentResult = await paymentCollection.insertOne(payment)

            //carefully delete each item from cart
            // const query = {}
            console.log('payment info: ', payment);
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartCollection.deleteMany(query)
            res.send({ paymentResult, deleteResult });
        })

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const result = await paymentCollection.find(query).toArray()
            res.send(result)
        })

        //admin states here
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await usersCollection.estimatedDocumentCount()
            const menuItems = await menuCollection.estimatedDocumentCount()
            const orders = await paymentCollection.estimatedDocumentCount()

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$price' }
                    }
                }
            ]).toArray()
            // console.log(result);
            const revenue = result.length > 0 ? result[0].totalRevenue : 0

            res.send({ users, menuItems, orders, revenue })
        })

        //order stats
        app.get('/order-stats', async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuIds'
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: { $sum: 1 },
                        totalRevenue: { $sum: '$menuItems.price' }
                    }    
                },
                {
                    $project:{
                        _id: 0,
                        category: "$_id",
                        quantity: '$quantity',
                        revenue: '$totalRevenue'
                    }
                }
            ]).toArray()

            res.send(result)
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);





app.listen(port, () => {
    console.log(`I am listening form port: ${port}`);
})