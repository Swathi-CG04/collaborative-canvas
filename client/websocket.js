// client/websocket.js
// Robust Socket.IO client loader + wrapper that waits for the client lib and socket init.
// Replace BACKEND with your Render URL.

const BACKEND = "https://collaborative-canvas-nvg7.onrender.com"; // <- your Render URL
const CDN_PRIMARY = "https://cdn.socket.io/4.7.2/socket.io.min.js";
const CDN_FALLBACK = "https://cdn.jsdelivr.net/npm/socket.io-client@4.7.2/dist/socket.io.min.js";

let _socket = null;
let _readyResolve;
let _readyReject;
const _readyPromise = new Promise((res, rej) => { _readyResolve = res; _readyReject = rej; });

function loadScript(url) {
  return new Promise((resolve, reject) => {
    // if already loaded
    if (typeof io !== 'undefined') return resolve();
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = (e) => reject(new Error('failed to load ' + url));
    document.head.appendChild(s);
  });
}

async function ensureIoClient() {
  if (typeof io !== 'undefined') return;
  // try primary then fallback
  try {
    await loadScript(CDN_PRIMARY);
    if (typeof io === 'undefined') throw new Error('io still undefined after primary');
    return;
  } catch (err) {
    console.warn('[websocket] primary CDN failed:', err.message);
    try {
      await loadScript(CDN_FALLBACK);
      if (typeof io === 'undefined') throw new Error('io still undefined after fallback');
      return;
    } catch (err2) {
      console.error('[websocket] fallback CDN failed:', err2.message);
      throw err2;
    }
  }
}

function initSocketOnce() {
  if (_socket) return _socket;
  if (typeof io === 'undefined') {
    console.warn('[websocket] initSocketOnce called but io is undefined');
    return null;
  }
  try {
    _socket = io(BACKEND, { transports: ['websocket', 'polling'] });
    window.__socket = _socket;
    _socket.on('connect', () => console.log('[ws] connected', _socket.id));
    _socket.on('disconnect', (reason) => console.log('[ws] disconnected', reason));
    _socket.on('connect_error', (err) => console.warn('[ws] connect_error', err && err.message));
    _readyResolve(_socket);
  } catch (e) {
    _readyReject(e);
    console.error('[websocket] init error', e);
  }
  return _socket;
}

// Start loading immediately (but doesn't block)
ensureIoClient()
  .then(() => {
    console.log('[websocket] socket.io client loaded (cdn)');
    try { initSocketOnce(); } catch(e){ console.error(e); }
  })
  .catch(err => {
    console.error('[websocket] failed to load socket client libs:', err);
    _readyReject(err);
  });

// wrapper API that waits until the socket is ready
function withSocket(cb) {
  return _readyPromise.then(sock => {
    if (!sock) throw new Error('socket not available');
    return cb(sock);
  }).catch(err => {
    console.warn('[websocket] action aborted; socket not ready', err);
  });
}

function makeWS(){
  let lastRoom = null;
  let lastUser = null;

  return {
    join(room, user){
      lastRoom = room; lastUser = user;
      withSocket(sock => {
        sock.emit('join', { room, user });
        console.log('[ws] join', room, (user && user.name) ? `${user.name} (${user.id||'no-id'})` : room);
      });
    },
    sendPointer(room, x, y){
      withSocket(sock => sock.emit('pointer', { x, y }));
    },
    sendChunk(opId, points, color, width, eraser = false){
      withSocket(sock => sock.emit('stroke_chunk', { opId, points, color, width, eraser }));
    },
    commitOp(op){
      withSocket(sock => sock.emit('stroke_commit', { op }));
    },
    requestUndo(){
      withSocket(sock => sock.emit('undo_request'));
    },
    requestRedo(){
      withSocket(sock => sock.emit('redo_request'));
    },
    clear(){
      withSocket(sock => sock.emit('clear'));
    },
    on(event, cb){
      // when ready, attach handler
      _readyPromise.then(sock => { if (sock) sock.on(event, cb); }).catch(()=>{/*noop*/});
    },
    // debug helpers
    get socket(){ return _socket; },
    ready: _readyPromise
  };
}

window.makeWS = makeWS;
