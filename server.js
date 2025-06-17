// 1. Import modules
const express = require('express');
const bodyParser = require('body-parser');
const socket = require('socket.io');
const admin = require('firebase-admin');
const path = require('path');
const app = express();

// 2. Setup Firebase from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 3. Express config
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// 4. Routes
app.get('/', (req, res) => {
  res.render('login');
});

app.post('/chat', async (req, res) => {
  const { name, password } = req.body;
  const usersRef = db.collection('users');
  const userSnap = await usersRef.where('name', '==', name).get();

  let userId;

  if (userSnap.empty) {
    const newUser = await usersRef.add({ name, password });
    userId = newUser.id;
  } else {
    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();
    if (userData.password !== password) {
      return res.send('❌ Wrong password. Please go back and try again.');
    }
    userId = userDoc.id;
  }

  res.render('chat', { name, userId });
});

// 5. Start server FIRST
const server = app.listen(3000, () => {
  console.log('✅ Server running on port 3000');
});

// 6. THEN define io
const io = socket(server);

// 7. Now write io.on(...) after io is defined
const waitingUsers = [];
const userToRoom = {};

io.on('connection', (socket) => {
  console.log('👤 A user connected');

  let currentRoom = null;

  socket.on('join', (userId) => {
    socket.userId = userId;
    console.log(`User ${userId} joined`);
  });

  socket.on('new chat', () => {
    console.log(`🔍 ${socket.userId} is looking for chat`);

    if (waitingUsers.length > 0) {
      const partnerSocket = waitingUsers.shift();
      const roomId = `room-${Date.now()}`;

      userToRoom[socket.userId] = roomId;
      userToRoom[partnerSocket.userId] = roomId;

      socket.join(roomId);
      partnerSocket.join(roomId);

      currentRoom = roomId;

      io.to(roomId).emit('chat start', {
        message: `✨ You're now chatting privately!`
      });
    } else {
      waitingUsers.push(socket);
    }
  });

  socket.on('chat message', (data) => {
    const room = userToRoom[socket.userId];
    if (room) {
      io.to(room).emit('chat message', data);
    }
  });

  socket.on('disconnect', () => {
    const index = waitingUsers.indexOf(socket);
    if (index !== -1) waitingUsers.splice(index, 1);
  });
});
