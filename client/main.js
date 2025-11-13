// client/main.js
(function () {
  const canv = document.getElementById('canvas');
  const canvasMgr = new CanvasManager(canv);
  window._cm = canvasMgr;
  const ws = makeWS();
  window._ws = ws;

  // UI elements
  const joinBtn = document.getElementById('joinBtn');
  const roomEl = document.getElementById('room');
  const nameEl = document.getElementById('name');
  const colorEl = document.getElementById('color');
  const widthEl = document.getElementById('width');
  const toolPen = document.getElementById('tool-pen');
  const toolEraser = document.getElementById('tool-eraser');
  const toolLine = document.getElementById('tool-line');
  const toolRect = document.getElementById('tool-rect');
  const toolCircle = document.getElementById('tool-circle');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const clearBtn = document.getElementById('clear');
  const usersDiv = document.getElementById('users');

  // user identity
  const user = { id: crypto.randomUUID(), name: (nameEl.value || 'guest') };

  // per-tool state
  const toolState = {
    pen:   { width: 4,  color: '#000000', eraser: false },
    eraser:{ width: 20, color: null,      eraser: true },
    'shape-line': { width: 4, color: '#000000', shapeType: 'line' },
    'shape-rect': { width: 4, color: '#000000', shapeType: 'rect' },
    'shape-circle': { width: 4, color: '#000000', shapeType: 'circle' }
  };
  let activeTool = 'pen';

  // UI helpers
  function setActiveTool(tool){
    activeTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const mapping = {
      pen: toolPen, eraser: toolEraser,
      'shape-line': toolLine, 'shape-rect': toolRect, 'shape-circle': toolCircle
    };
    if (mapping[tool]) mapping[tool].classList.add('active');

    // reflect tool values
    const cfg = toolState[tool] || toolState.pen;
    widthEl.value = cfg.width;
    if (cfg.color) colorEl.value = cfg.color;
    colorEl.disabled = !!cfg.eraser;
    colorEl.style.opacity = cfg.eraser ? 0.5 : 1;

    // apply canvas style for strokes
    canvasMgr.setStyle({ color: cfg.color || canvasMgr.color, width: cfg.width, eraser: !!cfg.eraser });
  }

  // join
  joinBtn.onclick = () => {
    user.name = nameEl.value || 'guest';
    ws.join(roomEl.value || 'main', user);
  };

  // color/width change affects active tool
  colorEl.onchange = () => {
    const val = colorEl.value;
    if (!toolState[activeTool]) toolState[activeTool] = { width: parseInt(widthEl.value,10)||4, color: val };
    toolState[activeTool].color = val;
    if (!toolState[activeTool].eraser) canvasMgr.setStyle({ color: val });
  };
  widthEl.oninput = () => {
    const w = parseInt(widthEl.value, 10) || 1;
    if (!toolState[activeTool]) toolState[activeTool] = { width: w, color: '#000' };
    toolState[activeTool].width = w;
    canvasMgr.setStyle({ width: w });
  };

  undoBtn.onclick = () => ws.requestUndo();
  redoBtn.onclick = () => ws.requestRedo();
  clearBtn.onclick = () => ws.clear();

  toolPen.onclick = () => setActiveTool('pen');
  toolEraser.onclick = () => setActiveTool('eraser');
  toolLine.onclick = () => setActiveTool('shape-line');
  toolRect.onclick = () => setActiveTool('shape-rect');
  toolCircle.onclick = () => setActiveTool('shape-circle');
  setActiveTool(activeTool);

  // auto-join on load
  (function autoJoin(){
    const room = roomEl.value || 'main';
    user.name = nameEl.value || 'guest';
    ws.join(room, user);
    console.log('Auto-joined', room, user && user.name ? `${user.name} (${user.id})` : room);
  })();

  // ------------------------
  // Improved user list rendering with deterministic fallback color + contrast
  // ------------------------
  function renderUserList(users){
    const count = (users && users.length) || 0;
    const header = `<div class="users-header"><div><strong>Users</strong></div><div class="user-count">${count} online</div></div>`;

    const list = (users || []).map(u => {
      const initials = (u.name || 'G').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
      const color = u.color || colorFromId(u.id);
      const textColor = getContrastColor(color);
      return `<div class="user-item">
        <div class="user-badge" style="background:${color}; color:${textColor}">${initials}</div>
        <div class="user-meta"><div class="user-name">${u.name}</div><div class="user-id">${(u.id||'').toString().slice(0,6)}</div></div>
      </div>`;
    }).join('');

    usersDiv.innerHTML = header + `<div class="user-list">${list}</div>`;
  }

  // deterministic color fallback from id (so same user -> same color)
  function colorFromId(id){
    if(!id) return '#999999';
    // simple hash -> hue mapping
    let h = 0;
    for(let i=0;i<id.length;i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    const hue = Math.abs(h) % 360;
    return `hsl(${hue} 70% 45%)`;
  }

  // pick readable text color (black or white) for a background
  function getContrastColor(bg) {
    // supports #hex and hsl(...) from above
    if(typeof bg === 'string' && bg.startsWith('hsl')) {
      // parse lightness value (match both 'hsl(h s% l%)' and 'hsl(h s l)')
      const m = bg.match(/hsl\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*\)/) || bg.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)/);
      if(m && m[3]) {
        const L = parseFloat(m[3]);
        return (L < 60) ? '#fff' : '#000';
      }
      return '#fff';
    }
    // hex fallback
    let hex = (bg || '').replace('#','');
    if(hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    if(hex.length !== 6) return '#fff';
    const r = parseInt(hex.substr(0,2),16);
    const g = parseInt(hex.substr(2,2),16);
    const b = parseInt(hex.substr(4,2),16);
    // relative luminance (YIQ)
    const yiq = (r*299 + g*587 + b*114)/1000;
    return yiq >= 128 ? '#000' : '#fff';
  }

  // ------------------------
  // socket handlers for user list & drawing
  // ------------------------
  ws.on('user_list', users => {
    renderUserList(users || []);
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

  // drawing & shape logic
  function getPos(e){
    const r = canv.getBoundingClientRect();
    const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    return { x: clientX - r.left, y: clientY - r.top, clientX, clientY };
  }

  canv.style.touchAction = 'none';

  // shape temporary state for clients (to avoid mixing with stroke state)
  let currentShapeLocal = null; // { shapeType, start, opId }

  canv.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { canv.setPointerCapture && canv.setPointerCapture(e.pointerId); } catch (err) {}
    const pos = getPos(e);
    const opId = crypto.randomUUID();
    const cfg = toolState[activeTool] || toolState.pen;

    if (activeTool.startsWith('shape-')) {
      // start shape
      currentShapeLocal = { shapeType: cfg.shapeType, start: { x: pos.x, y: pos.y }, opId, color: cfg.color, width: cfg.width };
      canvasMgr.startShape(cfg.shapeType, pos.x, pos.y, { color: cfg.color, width: cfg.width });
      // no chunks for shapes; will commit on pointerup
    } else {
      // stroke (pen/eraser)
      const isEraser = !!cfg.eraser;
      const colorToSend = cfg.color;
      const widthToSend = cfg.width;
      canvasMgr.setStyle({ color: colorToSend || canvasMgr.color, width: widthToSend, eraser: isEraser });
      canvasMgr.startStroke(opId, pos.x, pos.y, isEraser);
      ws.sendChunk(opId, [{ x: pos.x, y: pos.y }], colorToSend, widthToSend, isEraser);
      // send pointer (lightweight)
      ws.sendPointer(roomEl.value, pos.clientX, pos.clientY);
      canv._currentOpId = opId;
      canv._lastSend = Date.now();
    }
  });

  canv.addEventListener('pointermove', e => {
    const pos = getPos(e);
    // if drawing stroke
    if (canv._currentOpId) {
      canvasMgr.addPoint(pos.x, pos.y);
      const now = Date.now();
      if (!canv._lastSend) canv._lastSend = 0;
      const throttleMs = 30;
      if (now - canv._lastSend > throttleMs) {
        const lastPts = canvasMgr.currentPoints.slice(-8);
        const cfg = toolState[activeTool] || toolState.pen;
        const isEraser = !!cfg.eraser;
        ws.sendChunk(canv._currentOpId, lastPts, cfg.color, cfg.width, isEraser);
        ws.sendPointer(roomEl.value, pos.clientX, pos.clientY);
        canv._lastSend = now;
      }
    } else if (currentShapeLocal) {
      // update local preview shape
      canvasMgr.updateShape(pos.x, pos.y);
    }
  });

  canv.addEventListener('pointerup', e => {
    e.preventDefault();
    try { canv.releasePointerCapture && canv.releasePointerCapture(e.pointerId); } catch (err) {}
    const pos = getPos(e);

    if (currentShapeLocal) {
      // finalize shape op and commit to server
      canvasMgr.updateShape(pos.x, pos.y);
      const op = canvasMgr.endShape({ userId: user.id });
      if (op) ws.commitOp(op);
      currentShapeLocal = null;
    } else {
      // finalize stroke
      canvasMgr.addPoint(pos.x, pos.y);
      const cfg = toolState[activeTool] || toolState.pen;
      const isEraser = !!cfg.eraser;
      const colorToSend = cfg.color;
      const widthToSend = cfg.width;
      const op = canvasMgr.endStroke({ userId: user.id, color: colorToSend, width: widthToSend, eraser: isEraser });
      if (op) ws.commitOp(op);
      canv._currentOpId = null;
    }
  });

  // expose for debugging
  window._toolState = toolState;
  window._user = user;
})();
