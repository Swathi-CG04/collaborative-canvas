// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { RoomManager } = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'client')));

const rooms = new RoomManager();

io.on('connection', socket => {
  console.log('conn:', socket.id);

  socket.on('join', ({room, user}) => {
    socket.join(room);
    socket.data.room = room;
    socket.data.user = user;
    rooms.addUser(room, socket.id, user);

    // send init state
    const state = rooms.getState(room);
    socket.emit('init_state', state);

    // broadcast user list
    io.to(room).emit('user_list', rooms.getUsers(room));
  });

  socket.on('pointer', data => {
    const room = socket.data.room;
    if(!room) return;
    socket.to(room).emit('pointer', data);
  });

  socket.on('stroke_chunk', data => {
    const room = socket.data.room;
    if(!room) return;
    socket.to(room).emit('stroke_chunk', data);
  });

  socket.on('stroke_commit', data => {
    const room = socket.data.room;
    if(!room) return;
    const op = rooms.addOp(room, data.op);
    // broadcast op_add to everyone
    io.to(room).emit('op_add', op);
  });

  socket.on('undo_request', () => {
    const room = socket.data.room;
    if(!room) return;
    const removed = rooms.undo(room);
    if(removed) io.to(room).emit('op_remove', {opId: removed.id});
  });

  socket.on('redo_request', () => {
    const room = socket.data.room;
    if(!room) return;
    const op = rooms.redo(room);
    if(op) io.to(room).emit('op_add', op);
  });

  socket.on('clear', () => {
    const room = socket.data.room;
    if(!room) return;
    rooms.clear(room);
    io.to(room).emit('clear');
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if(room) {
      rooms.removeUser(room, socket.id);
      io.to(room).emit('user_list', rooms.getUsers(room));
    }
  });
});

server.listen(PORT, () => console.log('listening', PORT));
