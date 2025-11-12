// client/canvas.js
// CanvasManager — DPR-safe, defensive, realtime-friendly
// Pen = opaque, Eraser = destination-out

class CanvasManager {
  constructor(canvasEl){
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');

    // core state
    this.localOps = new Map();
    this.remoteTemp = new Map();
    this.opIndex = [];
    this.color = '#000000';
    this.width = 4;
    this.isErasing = false;

    // drawing state
    this.drawing = false;
    this.currentOpId = null;
    this.currentPoints = [];

    // scheduling flag
    this._pendingDraw = false;

    // initial sizing + listeners
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

  remoteChunk(opId, points = [], color = '#000', width = 4, eraser = false){
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

  drawOp(op){
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

  redrawFromOps(){
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const ops = Array.isArray(this.opIndex) ? this.opIndex : [];
    for (const op of ops){
      try { this.drawOp(op); } catch (e) { console.warn('drawOp failed', e, op); }
    }
    for (const [opId, buff] of this.remoteTemp.entries()){
      this.drawOp({ id: opId, points: buff.points, color: buff.color, width: buff.width, eraser: buff.eraser });
    }
    if (this.currentPoints && this.currentPoints.length){
      const tempOp = {
        id: 'local',
        points: this.currentPoints,
        color: this.currentIsEraser ? null : (this._effectiveColor || this.color),
        width: this.width,
        eraser: !!this.currentIsEraser
      };
      this.drawOp(tempOp);
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
