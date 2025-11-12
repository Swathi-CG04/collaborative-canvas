// server/rooms.js
const { v4: uuidv4 } = require('uuid');

// each room: { users: Map(socketId => user), opLog: [ops], redoStack: [] }
class RoomManager {
  constructor(){
    this.rooms = new Map();
  }

  _ensure(room){
    if(!this.rooms.has(room)){
      this.rooms.set(room, { users: new Map(), opLog: [], redoStack: [] });
    }
    return this.rooms.get(room);
  }

  addUser(room, socketId, user){
    const r = this._ensure(room);
    r.users.set(socketId, user);
  }

  removeUser(room, socketId){
    const r = this._ensure(room);
    r.users.delete(socketId);
  }

  getUsers(room){
    const r = this._ensure(room);
    return Array.from(r.users.values());
  }

  getState(room){
    const r = this._ensure(room);
    return { opLog: r.opLog };
  }

  addOp(room, op){
    const r = this._ensure(room);
    r.opLog.push(op);
    // new op invalidates redo history
    r.redoStack = [];
    return op;
  }

  undo(room){
    const r = this._ensure(room);
    if(r.opLog.length === 0) return null;
    const op = r.opLog.pop();
    r.redoStack.push(op);
    return op;
  }

  redo(room){
    const r = this._ensure(room);
    if(r.redoStack.length === 0) return null;
    const op = r.redoStack.pop();
    r.opLog.push(op);
    return op;
  }

  clear(room){
    const r = this._ensure(room);
    r.opLog = [];
    r.redoStack = [];
  }
}

module.exports = { RoomManager };
