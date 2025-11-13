// client/canvas.js
// CanvasManager — DPR-safe, supports strokes and basic shapes (line, rect, circle)

class CanvasManager {
  constructor(canvasEl){
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');

    // core state
    this.remoteTemp = new Map();
    this.opIndex = []; // committed ops
    this.color = '#000000';
    this.width = 4;
    this.isErasing = false;

    // drawing / shape state
    this.drawing = false;
    this.currentOpId = null;
    this.currentPoints = []; // for strokes
    this.currentShape = null; // { shapeType, start:{x,y}, end:{x,y}, color, width }

    this._pendingDraw = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setStyle({ color, width, eraser } = {}) {
    if (color !== undefined) this.color = color;
    if (width !== undefined) this.width = width;
    if (eraser !== undefined) this.isErasing = eraser;
    this._effectiveColor = this.color;
  }

  resize(){
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;

    try {
      const old = document.createElement('canvas');
      old.width = this.canvas.width;
      old.height = this.canvas.height;
      old.getContext('2d').drawImage(this.canvas, 0, 0);
    } catch (e) {}

    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.redrawFromOps();
  }

  // STROKES
  startStroke(opId, x, y, eraser = false){
    this.drawing = true;
    this.currentOpId = opId;
    this.currentPoints = [{ x, y }];
    this.currentIsEraser = eraser;
  }
  addPoint(x, y){
    if (!this.drawing) return;
    this.currentPoints.push({ x, y });
    this.scheduleDraw();
  }
  endStroke({ userId, color, width, eraser } = {}){
    if (!this.drawing) return null;
    const op = {
      id: this.currentOpId || crypto.randomUUID(),
      type: 'stroke',
      userId: userId || null,
      color: (eraser ? null : (color || this.color)),
      width: width || this.width,
      eraser: !!eraser,
      points: this.currentPoints.slice()
    };
    this.opIndex.push(op);
    this.drawing = false;
    this.currentOpId = null;
    this.currentPoints = [];
    this.currentIsEraser = false;
    this.redrawFromOps();
    return op;
  }

  // SHAPES (one-shot, no chunking)
  startShape(shapeType, startX, startY, { color, width } = {}){
    this.currentShape = {
      shapeType,
      start: { x: startX, y: startY },
      end: { x: startX, y: startY },
      color: color || this.color,
      width: width || this.width
    };
    this.scheduleDraw();
  }
  updateShape(x, y){
    if (!this.currentShape) return;
    this.currentShape.end = { x, y };
    this.scheduleDraw();
  }
  endShape({ userId } = {}){
    if (!this.currentShape) return null;
    const id = crypto.randomUUID();
    const op = {
      id,
      type: 'shape',
      shapeType: this.currentShape.shapeType,
      userId: userId || null,
      color: this.currentShape.color,
      width: this.currentShape.width,
      start: this.currentShape.start,
      end: this.currentShape.end
    };
    this.opIndex.push(op);
    this.currentShape = null;
    this.redrawFromOps();
    return op;
  }

  // remote handling
  remoteChunk(opId, points = [], color = '#000', width = 4, eraser = false){
    // strokes only use chunks; shapes are committed whole
    if (!this.remoteTemp.has(opId)) {
      this.remoteTemp.set(opId, { points: [], color, width, eraser });
    }
    const bucket = this.remoteTemp.get(opId);
    bucket.points.push(...points);
    this.scheduleDraw();
  }

  commitRemoteOp(op){
    if (!op) return;
    if (this.remoteTemp.has(op.id)) this.remoteTemp.delete(op.id);
    this.opIndex.push(op);
    this.redrawFromOps();
  }

  removeOp(opId){
    if (!opId) return;
    this.opIndex = Array.isArray(this.opIndex) ? this.opIndex.filter(o => o.id !== opId) : [];
    this.redrawFromOps();
  }

  // drawing helpers
  drawStrokeOp(op){
    if (!op || !op.points || op.points.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = op.width;
    if (op.eraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = op.color || this._effectiveColor || '#000';
    }
    ctx.beginPath();
    const pts = op.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++){
      const p = pts[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawShapeOp(op){
    if (!op || !op.start || !op.end) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = op.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = op.color || this._effectiveColor || '#000';

    const sx = op.start.x, sy = op.start.y, ex = op.end.x, ey = op.end.y;
    if (op.shapeType === 'line') {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    } else if (op.shapeType === 'rect') {
      const x = Math.min(sx, ex);
      const y = Math.min(sy, ey);
      const w = Math.abs(ex - sx);
      const h = Math.abs(ey - sy);
      ctx.strokeRect(x, y, w, h);
    } else if (op.shapeType === 'circle') {
      const cx = (sx + ex) / 2;
      const cy = (sy + ey) / 2;
      const rx = Math.abs(ex - sx) / 2;
      const ry = Math.abs(ey - sy) / 2;
      const r = Math.max(1, Math.sqrt(rx*rx + ry*ry));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  redrawFromOps(){
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const ops = Array.isArray(this.opIndex) ? this.opIndex : [];
    for (const op of ops){
      try {
        if (op.type === 'stroke') this.drawStrokeOp(op);
        else if (op.type === 'shape') this.drawShapeOp(op);
      } catch (e) {
        console.warn('drawOp failed', e, op);
      }
    }

    // remote in-progress strokes
    for (const [opId, buff] of this.remoteTemp.entries()){
      this.drawStrokeOp({ id: opId, points: buff.points, color: buff.color, width: buff.width, eraser: buff.eraser, type: 'stroke' });
    }

    // local in-progress stroke
    if (this.currentPoints && this.currentPoints.length){
      const tempOp = {
        id: 'local',
        type: 'stroke',
        points: this.currentPoints,
        color: this.currentIsEraser ? null : (this._effectiveColor || this.color),
        width: this.width,
        eraser: !!this.currentIsEraser
      };
      this.drawStrokeOp(tempOp);
    }

    // local preview shape
    if (this.currentShape) {
      this.drawShapeOp({ type: 'shape', shapeType: this.currentShape.shapeType, start: this.currentShape.start, end: this.currentShape.end, color: this.currentShape.color, width: this.currentShape.width });
    }
  }

  scheduleDraw(){
    if (this._pendingDraw) return;
    this._pendingDraw = true;
    requestAnimationFrame(() => {
      this._pendingDraw = false;
      this.redrawFromOps();
    });
  }
}

window.CanvasManager = CanvasManager;
