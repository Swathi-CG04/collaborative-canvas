README.md
---------
Collaborative Canvas (Vanilla JS + Node + Socket.io)

Quick start
-----------
1. clone repo
2. cd collaborative-canvas
3. npm install
4. npm start
5. open http://localhost:3000 in multiple tabs to test

Testing with multiple users
---------------------------
- Open 2+ browser tabs and join the same room name.
- Draw on one tab — others should show strokes in real-time.
- Use Undo/Redo buttons to test global undo/redo across tabs.
- You can also open from different devices (same LAN or deployed server).

Files
-----
- client/index.html
- client/style.css
- client/canvas.js  # drawing + batching + UI
- client/websocket.js  # socket client
- client/main.js  # wires UI and canvas
- server/server.js
- server/rooms.js
- server/drawing-state.js

Commands
--------
- npm install
- npm start  # starts server on 3000

Known issues
------------
- No persistent storage (in-memory opLog).
- Global undo pops last global op; selective undo not implemented.
- Redo cleared if new op is committed after undo.

Time spent
----------
Estimated: 10-18 hours (prototype + polishing + documentation).

