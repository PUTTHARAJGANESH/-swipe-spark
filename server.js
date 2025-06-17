// Socket.io Matching Logic
const waitingUsers = []; // Queue to store users waiting for chat
const userToRoom = {};   // Mapping userId → room

io.on('connection', (socket) => {
  console.log('👤 A user connected');

  let currentRoom = null;

  socket.on('join', (userId) => {
    socket.userId = userId;
    console.log(`User ${userId} joined`);
  });

  // When user clicks "New Chat"
  socket.on('new chat', () => {
    console.log(`🔍 ${socket.userId} is looking for chat`);

    if (waitingUsers.length > 0) {
      const partnerSocket = waitingUsers.shift();

      // Create a room
      const roomId = `room-${Date.now()}`;
      userToRoom[socket.userId] = roomId;
      userToRoom[partnerSocket.userId] = roomId;

      socket.join(roomId);
      partnerSocket.join(roomId);

      currentRoom = roomId;

      io.to(roomId).emit('chat start', {
        message: `✨ You are now connected!`,
      });
    } else {
      // No one to chat with — wait
      waitingUsers.push(socket);
    }
  });

  // Message handling
  socket.on('chat message', (data) => {
    const room = userToRoom[socket.userId];
    if (room) {
      io.to(room).emit('chat message', data);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ A user disconnected');
    const index = waitingUsers.indexOf(socket);
    if (index !== -1) waitingUsers.splice(index, 1);
  });
});
