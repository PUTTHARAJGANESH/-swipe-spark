const express = require('express');
const bodyParser = require('body-parser');
const socket = require('socket.io');
const admin = require('firebase-admin');
const path = require('path');
const app = express();

// Firebase config from Render environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Express setup
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Store online users (in memory for now)
let onlineUsers = {};

// 👉 Login route
app.get('/', (req, res) => {
  res.render('login');
});

app.post('/chat', async (req, res) => {
  const { name, password } = req.body;

  try {
    const usersRef = db.collection('users');
    const userSnap = await usersRef.where('name', '==', name).get();

    let userId;

    if (userSnap.empty) {
      // New user — save to database
      const newUser = await usersRef.add({ name, password });
      userId = newUser.id;
      console.log('🆕 New user added:', name);
    } else {
      // Existing user — check password
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data();
      if (userData.password !== password) {
        return res.send('❌ Incorrect password. Go back and try again.');
      }
      userId = userDoc.id;
      console.log('✅ Existing user logged in:', name);
    }

    // Show chat page with name + userId
    res.render('chat', { name, userId });

  } catch (err) {
    console.error('Login Error:', err);
    res.send('⚠️ Error logging in');
  }
});

// Start server
const server = app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

// Socket.io for chat
const io = socket(server);
io.on('connection', (socket) => {
  console.log('🔌 New socket connected');

  socket.on('join', (userId) => {
    onlineUsers[userId] = socket.id;
    console.log('👤 User joined:', userId);
  });

  socket.on('chat message', (data) => {
    io.emit('chat message', data); // Broadcast to everyone
  });

  socket.on('disconnect', () => {
    // Remove user from online list
    for (const id in onlineUsers) {
      if (onlineUsers[id] === socket.id) {
        delete onlineUsers[id];
        break;
      }
    }
  });
});
