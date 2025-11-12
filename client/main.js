// client/main.js
(function () {
  const canv = document.getElementById('canvas');
  const canvasMgr = new CanvasManager(canv);
  window._cm = canvasMgr;
  const ws = makeWS();
  window._ws = ws;

  const joinBtn = document.getElementById('joinBtn');
  const roomEl = document.getElementById('room');
  const nameEl = document.getElementById('name');
  const colorEl = document.getElementById('color');
  const widthEl = document.getElementById('width');
  const toolPen = document.getElementById('tool-pen');
  const toolEraser = document.getElementById('tool-eraser');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const clearBtn = document.getElementById('clear');
  const usersDiv = document.getElementById('users');

  const user = { id: crypto.randomUUID(), name: (nameEl.value || 'guest') };

  // per-tool persistent state (pen + eraser only)
  const toolState = {
    pen:   { width: 4,  color: '#000000', eraser: false },
    eraser:{ width: 20, color: null,      eraser: true }
  };
  let activeTool = 'pen';

  function reflectToolToUI(tool) {
    const cfg = toolState[tool] || { width:4, color:'#000', eraser: false };
    widthEl.value = cfg.width;
    if (cfg.color) colorEl.value = cfg.color;
    colorEl.disabled = !!cfg.eraser;
    colorEl.style.opacity = cfg.eraser ? 0.5 : 1;
    canvasMgr.setStyle({ color: cfg.color || canvasMgr.color, width: cfg.width, eraser: !!cfg.eraser });
  }

  joinBtn.onclick = () => {
    user.name = nameEl.value || 'guest';
    ws.join(roomEl.value || 'main', user);
  };

  colorEl.onchange = () => {
    const val = colorEl.value;
    if (!toolState[activeTool]) toolState[activeTool] = { width: parseInt(widthEl.value,10)||4, color: val, eraser:false };
    toolState[activeTool].color = val;
    if (!toolState[activeTool].eraser) {
      canvasMgr.setStyle({ color: val });
    }
  };

  widthEl.oninput = () => {
    const w = parseInt(widthEl.value, 10) || 1;
    if (!toolState[activeTool]) toolState[activeTool] = { width: w, color: '#000', eraser: false };
    toolState[activeTool].width = w;
    canvasMgr.setStyle({ width: w });
  };

  undoBtn.onclick = () => ws.requestUndo();
  redoBtn.onclick = () => ws.requestRedo();
  clearBtn.onclick = () => ws.clear();

  function setActiveTool(tool) {
    activeTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (tool === 'pen') toolPen.classList.add('active');
    if (tool === 'eraser') toolEraser.classList.add('active');
    if (!toolState[tool]) toolState[tool] = { width: 4, color: '#000000', eraser: tool === 'eraser' };
    reflectToolToUI(tool);
  }

  toolPen.onclick = () => setActiveTool('pen');
  toolEraser.onclick = () => setActiveTool('eraser');

  setActiveTool(activeTool);

  (function autoJoin(){
    const room = roomEl.value || 'main';
    user.name = nameEl.value || 'guest';
    ws.join(room, user);
    console.log('Auto-joined', room, user);
  })();

  function getPos(e){
    const r = canv.getBoundingClientRect();
    const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  }

  canv.style.touchAction = 'none';

  canv.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { canv.setPointerCapture && canv.setPointerCapture(e.pointerId); } catch (err) {}
    const p = getPos(e);
    const opId = crypto.randomUUID();

    const cfg = toolState[activeTool];
    const isEraser = !!cfg.eraser;
    const colorToSend = cfg.color;
    const widthToSend = cfg.width;

    canvasMgr.setStyle({ color: colorToSend || canvasMgr.color, width: widthToSend, eraser: isEraser });
    canvasMgr.startStroke(opId, p.x, p.y, isEraser);

    ws.sendChunk(opId, [{ x: p.x, y: p.y }], colorToSend, widthToSend, isEraser);
    canv._currentOpId = opId;
    canv._lastSend = Date.now();
  });

  canv.addEventListener('pointermove', e => {
    const p = getPos(e);
    canvasMgr.addPoint(p.x, p.y);

    const now = Date.now();
    if (!canv._lastSend) canv._lastSend = 0;
    const throttleMs = 30;
    if (now - canv._lastSend > throttleMs && canv._currentOpId) {
      const lastPts = canvasMgr.currentPoints.slice(-8);
      const cfg = toolState[activeTool];
      const isEraser = !!cfg.eraser;
      const colorToSend = cfg.color;
      const widthToSend = cfg.width;
      ws.sendChunk(canv._currentOpId, lastPts, colorToSend, widthToSend, isEraser);
      canv._lastSend = now;
    }
    if (roomEl.value) ws.sendPointer(roomEl.value, p.x, p.y);
  });

  canv.addEventListener('pointerup', e => {
    e.preventDefault();
    try { canv.releasePointerCapture && canv.releasePointerCapture(e.pointerId); } catch (err) {}
    const p = getPos(e);
    canvasMgr.addPoint(p.x, p.y);

    const cfg = toolState[activeTool];
    const isEraser = !!cfg.eraser;
    const colorToSend = cfg.color;
    const widthToSend = cfg.width;

    const op = canvasMgr.endStroke({ userId: user.id, color: colorToSend, width: widthToSend, eraser: isEraser });
    if (op) ws.commitOp(op);
    canv._currentOpId = null;
  });

  ws.on('init_state', data => {
    canvasMgr.opIndex = Array.isArray(data.opLog) ? data.opLog : [];
    canvasMgr.redrawFromOps();
  });

  ws.on('stroke_chunk', d => {
    canvasMgr.remoteChunk(d.opId, d.points || [], d.color, d.width, !!d.eraser);
  });

  ws.on('op_add', op => {
    canvasMgr.commitRemoteOp(op);
  });

  ws.on('op_remove', ({ opId }) => {
    canvasMgr.removeOp(opId);
  });

  ws.on('clear', () => {
    canvasMgr.opIndex = [];
    canvasMgr.remoteTemp.clear();
    canvasMgr.redrawFromOps();
  });

  ws.on('user_list', users => {
    usersDiv.innerHTML = users.map(u => `<div>${u.name}</div>`).join('');
  });

  window._toolState = toolState;
  window._activeTool = () => activeTool;
})();
