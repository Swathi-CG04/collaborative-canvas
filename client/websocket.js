// client/websocket.js
// Thin socket.io wrapper with debug exposure

const socket = io(); // assumes /socket.io/socket.io.js loaded from server
// expose for debug
window.__socket = socket;

function makeWS(){
  let currentRoom = null;
  let currentUser = null;

  socket.on('connect', () => {
    console.log('[ws] connected', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[ws] disconnected', reason);
  });

  return {
    join(room, user){
      currentRoom = room;
      currentUser = user;
      socket.emit('join', { room, user });
      console.log('[ws] join', room, user);
    },
    sendPointer(room, x, y){
      socket.emit('pointer', { userId: currentUser && currentUser.id, x, y });
    },
    // now includes eraser flag
    sendChunk(opId, points, color, width, eraser = false){
      socket.emit('stroke_chunk', { opId, points, color, width, eraser });
    },
    commitOp(op){
      socket.emit('stroke_commit', { op });
    },
    requestUndo(){
      socket.emit('undo_request');
    },
    requestRedo(){
      socket.emit('redo_request');
    },
    clear(){
      socket.emit('clear');
    },
    on(event, cb){
      socket.on(event, cb);
    },
    socket // expose raw socket for advanced debug if needed
  };
}

window.makeWS = makeWS; // expose factory globally
