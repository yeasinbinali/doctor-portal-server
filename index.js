const express = require('express');
const cors = require('cors');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');

const stripe = require("stripe")('sk_test_51N0kpOBCZp0IjDn9A1YjiQVk63nCpleK5Z68tHAAI5QxBmdnxRsduGlyYwujNoMaoQWe3QW46soWohJEuVia5h4g00Yh7O0uFE');

require('dotenv').config();

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d7bt1.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send({message: 'unauthorized access'});
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            return res.status(401).send({message: 'unathorized access'});
        }
        req.decoded = decoded;
        next();
    })
}

async function run(){
    try{
        const appointmentOptionsCollection = client.db('doctor-portal').collection('appointmentOptions');
        const bookingsCollection = client.db('doctor-portal').collection('bookings');
        const usersCollection = client.db('doctor-portal').collection('users');
        const doctorsCollection = client.db('doctor-portal').collection('doctors');
        const reviewsCollection = client.db('doctor-portal').collection('reviews');
        const paymentCollection = client.db('doctor-portal').collection('payment');

        app.get('/appointmentOptions', async(req, res) => {
            const date = req.query.date;
            const query = {};
            const appointmentOptions = await appointmentOptionsCollection.find(query).toArray();

            const bookingQuery = {appointmentDate: date};
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            appointmentOptions.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookingSlots = optionBooked.map(book => book.slot);
                const remaining = option.slots.filter(slot => !bookingSlots.includes(slot));
                option.slots = remaining;
            })

            res.send(appointmentOptions);

        })

        app.post('/users', async(req, res) => {
            const users = req.body;
            const result = await usersCollection.insertOne(users);
            res.send(result);
        })

        app.get('/users', async(req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })

        app.post("/create-payment-intent", async(req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ],
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            });
        })

        app.post('/payment', async(req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            const id = payment.bookingId;
            const filter = {_id: new ObjectId(id)};
            const updatedDoc = {
                $set: {
                    paid: true,
                    paymentId: payment.transactionId
                }
            }
            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.get('/jwt', async(req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);

            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'});
                return res.send({accessToken: token});
            }
            return res.status(403).send({accessToken: ''})

        })

        app.get('/bookings', verifyJWT, async(req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if(decodedEmail !== email){
                res.status(403).send({message: 'unathorized access'});
            }

            const query = {email: email};
            const bookingEmail = await bookingsCollection.find(query).toArray();
            res.send(bookingEmail);
        })

        app.post('/bookings', async(req, res) => {
            const bookings = req.body;
            const query = {
                appointmentDate: bookings.appointmentDate,
                email: bookings.email,
                treatment: bookings.treatment
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if(alreadyBooked.length){
                const message = `You already have a booking on ${bookings.appointmentDate}`
                return res.send({acknowledged: false, message})
            }

            const result = await bookingsCollection.insertOne(bookings);
            res.send(result);
        })

        app.get('/bookings/:id', async(req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const booking = await bookingsCollection.findOne(query);
            res.send(booking);
        })

        // updated price

        // app.get('/addprice', async(req, res) => {
        //     const filter = {};
        //     const options = { upsert: true };
        //     const updatedDoc = {
        //         $set: {
        //             price: 99
        //         }
        //     }
        //     const result = await appointmentOptionsCollection.updateMany(filter, updatedDoc, options);
        //     res.send(result);
        // })

        app.get('/appointmentSpecialty', async(req, res) => {
            const query = {};
            const result = await appointmentOptionsCollection.find(query).project({name: 1}).toArray();
            res.send(result);
        })

        app.get('/doctors', async(req, res) => {
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        })

        app.post('/doctors', async(req, res) => {
            const doctors = req.body;
            const result = await doctorsCollection.insertOne(doctors);
            res.send(result);
        })

        app.get('/reviews', async(req, res) => {
            const query = {};
            const reviews = await reviewsCollection.find(query).toArray();
            res.send(reviews);
        })

        app.post('/reviews', async(req, res) => {
            const reviews = req.body;
            const result = await reviewsCollection.insertOne(reviews);
            res.send(result);
        })
    }
    finally{

    }
}
run().catch(console.dir);

app.get('/', async(req, res) => {
    res.send('doctor portal server is running');
})

app.listen(port, () => {
    console.log(`Doctor portal running on port ${port}`);
})