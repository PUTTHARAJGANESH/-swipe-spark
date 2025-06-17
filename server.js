const express = require('express');
const bodyParser = require('body-parser');
const socket = require('socket.io');
const admin = require('firebase-admin');
const path = require('path');
const app = express();

// ✅ Load Firebase service account from Render ENV variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 🔧 Middleware and settings
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// 🧠 In-memory chat pairing (simple matchmaking)
const waitingUsers = [];
const userToRoom = {};

// 🔐 Routes
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
      const newUser = await usersRef.add({ name, password });
      userId = newUser.id;
      console.log("✅ New user created:", name);
    } else {
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data();
      if (userData.password !== password) {
        return res.send('❌ Wrong password. <a href="/">Go back</a>');
      }
      userId = userDoc.id;
      console.log("🔓 Returning user:", name);
    }

    res.render('chat', { name, userId });

  } catch (err) {
    console.error("⚠️ Login error:", err.message);
    res.send('⚠️ Something went wrong. Try again.');
  }
});

// ✅ Start the server
const server = app.listen(3000, () => {
  console.log("✅ Server running on port 3000");
});

// ✅ Setup Socket.io AFTER the server starts
const io = socket(server);

// 🎯 Real-time chat logic
io.on('connection', (socket) => {
  console.log("👤 A user connected");

  socket.on('join', (userId) => {
    socket.userId = userId;
    console.log(`📡 User ${userId} joined`);
  });

  socket.on('new chat', () => {
    console.log(`🔍 ${socket.userId} wants to chat`);

    if (waitingUsers.length > 0) {
      const partnerSocket = waitingUsers.shift();
      const roomId = `room-${Date.now()}`;

      userToRoom[socket.userId] = roomId;
      userToRoom[partnerSocket.userId] = roomId;

      socket.join(roomId);
      partnerSocket.join(roomId);

      io.to(roomId).emit('chat start', {
        message: '✨ You are now connected to a new user!',
      });

    } else {
      waitingUsers.push(socket);
      console.log(`⏳ ${socket.userId} is waiting for a partner`);
    }
  });

  socket.on('chat message', (data) => {
    const room = userToRoom[socket.userId];
    if (room) {
      io.to(room).emit('chat message', data);
    }
  });

  socket.on('disconnect', () => {
    console.log("❌ User disconnected");
    const index = waitingUsers.indexOf(socket);
    if (index !== -1) {
      waitingUsers.splice(index, 1);
    }
  });
});
