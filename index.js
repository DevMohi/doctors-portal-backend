const express = require('express')
const app = express();
const jwt = require('jsonwebtoken');
const cors = require('cors');
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

// middletier 
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.otnmq.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
// console.log(uri) to check password 

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// verifying step 
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}


async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');
        const userCollection = client.db('doctors_portal').collection('users');

        app.get('/service', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray()
            res.send(services)
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        })

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: {
                        role: 'admin'
                    }
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send({ result });
            }
            else {
                res.status(403).send({ message: 'forbidden' })
            }

        })


        //This is not the proper way to query after learning more about mongodb use aggregate,lookup ,pipeline,match,group
        app.get('/available', async (req, res) => {
            const date = req.query.date;
            //step1 : get all services
            const services = await serviceCollection.find().toArray()
            //step 2 : get the bookings of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray()

            //step3 : for each service,
            services.forEach(service => {
                //step4: find bookings for that service.output : [{},{},{}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);

                //step5 : select slots for the servicebookings: ['','','']
                const bookedSlots = serviceBookings.map(book => book.slot)

                //step 6: select those slots that are not in bookedslots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7: set available to slots to make it easier
                service.slots = available;
            })

            res.send(services)
        })

        /* API naming convention
            *app.get('/booking') get all bookings in this collection or get more than one by filter
            *app.get('/booking/:id') get a specific booking
            *app.post('/booking') add a new booking
            *app.patch('/booking/:id') // update a specific id 
            *app.put('/booking/:id) //upsert => update(if exists) or insert 
            *app.delete('/booking/:id') // delete a specific id
        */

        app.get('/booking', verifyJWT, async (req, res) => {
            //patient is email address
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            // aita use korse so that onno keo valid token die tumar token use na kore
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray()
                return res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'forbidden access' })
            }

        })

        app.post('/booking', async (req, res) => {
            // post pabo body theke 
            const booking = req.body;
            //aikane query kora hocce to see if a tratment booking exist
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exist = await bookingCollection.findOne(query)
            if (exist) {
                return res.send({ success: false, booking: exist })
            }
            const result = bookingCollection.insertOne(booking);
            res.send({ success: true, result });
        })
    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from doctors uncle');
})

app.listen(port, () => {
    console.log(`Doctos App listening on port ${port}`)
})