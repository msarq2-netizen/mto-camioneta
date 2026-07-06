/* ============================================================
   MTO Servicios HVAC — Control de Camioneta
   app.js — Lógica principal (estado, checklist, fotos, firma, envío)
   v1.0 — Producción
   Mismo patrón de arquitectura que mto-fichaje/app.js
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────────
   ⚙️  CONFIGURACIÓN — Editá aquí antes de desplegar
──────────────────────────────────────────────────────────────── */
const CONFIG = {
  // ── GOOGLE APPS SCRIPT ──────────────────────────────────────
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzFl4gwF0vd7lyjDI6XKRHQpeI0_3UfY28Xs5BiftU3MaEDF16eILfEh68kPp_xrMnPrQ/exec',

  // ── EMPRESA / UNIDAD ─────────────────────────────────────────
  COMPANY_NAME: 'MTO Servicios HVAC',
  VEHICLE_LABEL: 'Camioneta Service',
  VEHICLE_PLATE: '', // ej. "AD 123 BB" — opcional, sólo informativo en UI

  // ── EMPLEADOS (agrupados por sector, igual que mto-fichaje) ──
  EMPLOYEE_GROUPS: [
    {
      label: '🔧 Servicio Mantenimiento',
      members: [
        'GOMEZ LEANDRO AGUSTIN',
        'GUERRA MARTIN ALEJANDRO',
        'LUGO MARCELO FABIAN',
        'DE ANDREIS GASTON ARIEL',
        'ANDINO CAMPOS DIEGO MAXIMILIANO',
        'PARADA EZEQUIEL ORLANDO',
        'QUINTANA VICTOR ALEJANDRO',
      ],
    },
    {
      label: '🏢 Oficina Administrativa',
      members: [
        'NICOLAS TRAUTMANN',
        'GENOVEVA JURADO',
        'MATIAS MOSOVICH',
        'AYELEN VECCHIARELLI',
        'LUCAS ALVAREZ',
        'MAXIMILIANO SUAREZ',
      ],
    },
    {
      label: '🏗️ Obras',
      members: [
        'NAHUEL BARRIOS',
      ],
    },
  ],

  // ── SECTOR POR DEFECTO SEGÚN GRUPO ────────────────────────────
  DEFAULT_SECTOR_BY_GROUP: {
    '🔧 Servicio Mantenimiento': 'Mantenimiento',
    '🏢 Oficina Administrativa': 'Administración',
    '🏗️ Obras': 'Obras',
  },

  // ── CHECKLIST (mismo para retiro y devolución) ────────────────
  CHECKLIST_ITEMS: [
    { key: 'golpes',        icon: '🚗', label: 'Sin golpes visibles' },
    { key: 'luces',         icon: '💡', label: 'Luces funcionando' },
    { key: 'cubiertas',     icon: '🛞', label: 'Cubiertas en buen estado' },
    { key: 'documentacion', icon: '📄', label: 'Documentación presente' },
    { key: 'matafuego',     icon: '🧯', label: 'Matafuego presente' },
    { key: 'chaleco',       icon: '🦺', label: 'Chaleco reflectivo' },
    { key: 'balizas',       icon: '🔺', label: 'Balizas' },
    { key: 'botiquin',      icon: '⛑️', label: 'Botiquín' },
  ],

  // ── FOTOS OBLIGATORIAS ────────────────────────────────────────
  REQUIRED_PHOTOS: [
    { key: 'frente',       icon: '🚐', label: 'Frente' },
    { key: 'lateral_izq',  icon: '⬅️', label: 'Lateral izquierdo' },
    { key: 'lateral_der',  icon: '➡️', label: 'Lateral derecho' },
    { key: 'trasera',      icon: '🔙', label: 'Parte trasera' },
  ],

  // ── AVISO DE USO PROLONGADO (informativo, calculado en admin) ─
  EXPECTED_MAX_HOURS: 8,

  // ── GPS (mejor esfuerzo, no bloqueante) ───────────────────────
  GPS_TIMEOUT_MS: 8000,
};

/* ──────────────────────────────────────────────────────────────
   ESTADO GLOBAL
──────────────────────────────────────────────────────────────── */
const state = {
  currentScreen: 'screenLoadingStatus',
  vehicle: null,        // estado actual de la camioneta (desde backend)
  flow: null,            // 'retiro' | 'devolucion'
  employee: null,
  employeeGroupLabel: null,
  viajeId: null,         // id del viaje abierto (sólo en devolución)

  // Formulario
  sector: '',
  destino: '',
  motivo: '',
  km: '',
  fuel: '1/2',
  estadoGeneral: 'Bueno',
  observation: '',

  // Checklist { golpes:true, ... }
  checklist: {},

  // Fotos { frente: dataURL, lateral_izq: dataURL, ... , extra_1: dataURL }
  photos: {},
  extraPhotoCount: 0,

  // Firma
  signatureDataURL: null,
  signatureEmpty: true,

  // Inconveniente (sólo devolución)
  hasIncident: false,
  incidentType: 'choque',
  incidentDesc: '',

  // GPS
  gpsCoords: null,

  logs: [],
};

/* ──────────────────────────────────────────────────────────────
   UTILIDADES
──────────────────────────────────────────────────────────────── */
const utils = {
  formatDateTime(date = new Date()) {
    const d = String(date.getDate()).padStart(2, '0');
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${d}/${mo}/${y} ${h}:${mi}:${s}`;
  },
  formatTime(date = new Date()) {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  },
  getInitials(name) {
    return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  },
  formatElapsed(ms) {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  },
  show(id) { const el = document.getElementById(id); if (el) { el.style.display = ''; el.classList.remove('hidden'); } },
  hide(id) { const el = document.getElementById(id); if (el) { el.style.display = 'none'; el.classList.add('hidden'); } },
  setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; },
  setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  log(level, msg, data = null) {
    state.logs.push({ ts: new Date().toISOString(), level, msg, data });
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[MTO Camioneta][${level.toUpperCase()}] ${msg}`, data || '');
  },
};

/* ──────────────────────────────────────────────────────────────
   TOAST
──────────────────────────────────────────────────────────────── */
const toast = {
  show(msg, type = 'info', duration = 4000) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },
  success(msg, d) { this.show(msg, 'success', d); },
  error(msg, d) { this.show(msg, 'error', d); },
  info(msg, d) { this.show(msg, 'info', d); },
  warning(msg, d) { this.show(msg, 'warning', d); },
};

/* ──────────────────────────────────────────────────────────────
   GPS — mejor esfuerzo, no bloqueante
──────────────────────────────────────────────────────────────── */
const gpsManager = {
  async request() {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), CONFIG.GPS_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeout);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        () => { clearTimeout(timeout); resolve(null); },
        { enableHighAccuracy: true, timeout: CONFIG.GPS_TIMEOUT_MS, maximumAge: 0 }
      );
    });
  },
};

/* ──────────────────────────────────────────────────────────────
   FIRMA DIGITAL (canvas)
──────────────────────────────────────────────────────────────── */
const signaturePad = {
  canvas: null,
  ctx: null,
  drawing: false,

  init() {
    this.canvas = document.getElementById('signatureCanvas');
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.ctx.lineWidth = 2.2;
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = '#111827';

    const getPos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const point = e.touches ? e.touches[0] : e;
      return { x: point.clientX - r.left, y: point.clientY - r.top };
    };

    const start = (e) => {
      e.preventDefault();
      this.drawing = true;
      state.signatureEmpty = false;
      utils.hide('signatureHint');
      const p = getPos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      const p = getPos(e);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
    };
    const end = () => { this.drawing = false; };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    this.canvas.addEventListener('touchstart', start, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('touchend', end);
  },

  clear() {
    if (!this.ctx || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    state.signatureEmpty = true;
    utils.show('signatureHint');
  },

  getDataURL() {
    if (!this.canvas || state.signatureEmpty) return null;
    return this.canvas.toDataURL('image/png', 0.8);
  },
};

/* ──────────────────────────────────────────────────────────────
   API — comunicación con Google Apps Script
──────────────────────────────────────────────────────────────── */
const api = {
  async getStatus() {
    const url = `${CONFIG.APPS_SCRIPT_URL}?action=status&ts=${Date.now()}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async send(action, payload) {
    const formData = new FormData();
    formData.append('action', action);
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== null && v !== undefined) {
        formData.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: formData, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error('Tiempo de espera agotado al enviar datos. Revisá la conexión.');
      throw err;
    }
  },
};

/* ──────────────────────────────────────────────────────────────
   CONTROLADOR PRINCIPAL
──────────────────────────────────────────────────────────────── */
const app = {

  async init() {
    utils.log('info', 'App initializing', { company: CONFIG.COMPANY_NAME });
    this._populateEmployees();
    this._startClock();
    await this.refreshStatus();
  },

  _populateEmployees() {
    const sel = document.getElementById('employeeSelect');
    CONFIG.EMPLOYEE_GROUPS.forEach(group => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      group.members.slice().sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.dataset.group = group.label;
        opt.textContent = name;
        optgroup.appendChild(opt);
      });
      sel.appendChild(optgroup);
    });
  },

  _startClock() {
    const update = () => {
      const now = new Date();
      utils.setText('headerTime', utils.formatTime(now));
      utils.setText('summaryTime', utils.formatTime(now));
    };
    update();
    setInterval(update, 1000);
  },

  /* ── Consultar estado actual de la camioneta ─────────────── */
  async refreshStatus() {
    this.showScreen('screenLoadingStatus');
    try {
      const data = await api.getStatus();
      state.vehicle = data;
      this._renderStatusBanner(data);
      this.showScreen('screenWelcome');
    } catch (err) {
      utils.log('error', 'Status fetch failed', err.message);
      toast.error('No se pudo conectar con el servidor. Verificá tu conexión.', 6000);
      // Modo degradado: permitir seguir igual asumiendo disponible, con aviso
      state.vehicle = { success: false, enUso: false };
      this._renderStatusBanner(state.vehicle);
      this.showScreen('screenWelcome');
    }
  },

  _renderStatusBanner(data) {
    const dot = document.getElementById('statusDot');
    const badge = document.getElementById('statusBadge');
    const extra = document.getElementById('statusExtra');

    if (data.enUso) {
      dot.className = 'vehicle-status-dot inuse';
      badge.className = 'vehicle-badge-lg inuse';
      badge.textContent = '🔴 En uso';
      const salida = data.horaSalida ? new Date(data.horaSalida) : null;
      extra.classList.remove('hidden');
      extra.innerHTML = `
        <div class="vehicle-inuse-row"><span class="key">👤 La tiene</span><span class="val">${data.empleado || '—'}</span></div>
        <div class="vehicle-inuse-row"><span class="key">🕐 Desde</span><span class="val">${salida ? salida.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
        <div class="vehicle-inuse-row"><span class="key">📍 Destino</span><span class="val">${data.destino || '—'}</span></div>
      `;
    } else {
      dot.className = 'vehicle-status-dot available';
      badge.className = 'vehicle-badge-lg available';
      badge.textContent = '🟢 Disponible';
      extra.classList.add('hidden');
      extra.innerHTML = '';
    }
  },

  /* ── Navegación ───────────────────────────────────────────── */
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(id);
    if (screen) screen.classList.add('active');
    state.currentScreen = id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  goBack(target) {
    this.showScreen(target);
  },

  /* ── PASO 1: decidir flujo según empleado + estado ───────── */
  checkAndContinue() {
    const sel = document.getElementById('employeeSelect');
    const employeeName = sel.value.trim();
    if (!employeeName) {
      toast.error('Por favor seleccioná tu nombre.');
      sel.focus();
      return;
    }
    const selectedOption = sel.options[sel.selectedIndex];
    state.employee = employeeName;
    state.employeeGroupLabel = selectedOption.dataset.group;

    const v = state.vehicle || {};

    if (v.enUso && v.empleado === employeeName) {
      // Devolución
      state.flow = 'devolucion';
      state.viajeId = v.viajeId;
      state.km = v.kmRetiro || '';
      this._resetFormState();
      utils.setText('datosTitle', 'Devolver camioneta');
      utils.setText('datosEmployeeLabel', `👤 ${employeeName}`);
      utils.hide('retiroFields');
      document.getElementById('kmInput').placeholder = `Km al retirar: ${v.kmRetiro || '—'}`;
      this.showScreen('screenDatos');

    } else if (v.enUso && v.empleado !== employeeName) {
      // Bloqueado
      this._renderBlockedScreen(v);
      this.showScreen('screenBlocked');

    } else {
      // Retiro
      state.flow = 'retiro';
      state.viajeId = null;
      this._resetFormState();
      utils.setText('datosTitle', 'Retirar camioneta');
      utils.setText('datosEmployeeLabel', `👤 ${employeeName}`);
      utils.show('retiroFields');
      document.getElementById('kmInput').placeholder = 'Ej: 84210';
      const defaultSector = CONFIG.DEFAULT_SECTOR_BY_GROUP[state.employeeGroupLabel] || '';
      document.getElementById('sectorInput').value = defaultSector;
      this.showScreen('screenDatos');
    }
  },

  _resetFormState() {
    state.checklist = {};
    state.photos = {};
    state.extraPhotoCount = 0;
    state.hasIncident = false;
    state.incidentDesc = '';
    document.getElementById('destinoInput') && (document.getElementById('destinoInput').value = '');
    document.getElementById('motivoInput') && (document.getElementById('motivoInput').value = '');
    document.getElementById('kmInput').value = '';
    document.getElementById('observationInput').value = '';
    this._renderChecklist();
    this._renderPhotoGrid();

    // Título dinámico del checklist / fotos / confirmar
    const incidentCard = document.getElementById('incidentCard');
    incidentCard.style.display = state.flow === 'devolucion' ? '' : 'none';
    utils.setText('btnConfirmLabel', state.flow === 'devolucion' ? '✓ Devolver camioneta' : '✓ Retirar camioneta');
    utils.setText('fotosSubtitle', state.flow === 'devolucion'
      ? 'Volvé a fotografiar la unidad al devolverla.'
      : 'Tomá las 4 fotos obligatorias. Podés agregar más si es necesario.');
  },

  _renderBlockedScreen(v) {
    utils.setText('blockedEmployee', v.empleado || '—');
    const salida = v.horaSalida ? new Date(v.horaSalida) : null;
    utils.setText('blockedTime', salida ? salida.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—');
    utils.setText('blockedDestino', v.destino || '—');
    utils.setText('blockedElapsed', salida ? utils.formatElapsed(Date.now() - salida.getTime()) : '—');
  },

  /* ── PASO 2: Datos → Checklist ───────────────────────────── */
  goToChecklist() {
    state.sector = document.getElementById('sectorInput')?.value.trim() || state.sector;
    state.destino = document.getElementById('destinoInput')?.value.trim() || '';
    state.motivo = document.getElementById('motivoInput')?.value.trim() || '';
    state.km = document.getElementById('kmInput').value.trim();
    state.fuel = document.getElementById('fuelInput').value;
    state.estadoGeneral = document.getElementById('estadoInput').value;

    if (!state.km) {
      toast.error('Ingresá el kilometraje actual.');
      document.getElementById('kmInput').focus();
      return;
    }
    if (state.flow === 'retiro' && !state.destino) {
      toast.error('Ingresá el destino del viaje.');
      document.getElementById('destinoInput').focus();
      return;
    }

    this.showScreen('screenChecklist');
  },

  _renderChecklist() {
    const container = document.getElementById('checklistContainer');
    container.innerHTML = CONFIG.CHECKLIST_ITEMS.map(item => `
      <div class="checklist-item" id="chk_${item.key}" onclick="app.toggleChecklist('${item.key}')">
        <span class="checklist-icon">${item.icon}</span>
        <span class="checklist-label">${item.label}</span>
        <span class="checklist-check">✓</span>
      </div>
    `).join('');
  },

  toggleChecklist(key) {
    state.checklist[key] = !state.checklist[key];
    const el = document.getElementById(`chk_${key}`);
    if (el) el.classList.toggle('checked', !!state.checklist[key]);
  },

  /* ── PASO 3: Checklist → Fotos ────────────────────────────── */
  goToFotos() {
    this.showScreen('screenFotos');
  },

  _renderPhotoGrid() {
    const grid = document.getElementById('photoGrid');
    grid.innerHTML = CONFIG.REQUIRED_PHOTOS.map(p => this._photoSlotHTML(p.key, p.icon, p.label, true)).join('');
    this._updatePhotoNextButton();
  },

  _photoSlotHTML(key, icon, label, required) {
    return `
      <div class="photo-slot" id="slot_${key}" onclick="app.capturePhoto('${key}')">
        <span class="slot-icon">${icon}</span>
        <span class="slot-label">${label}${required ? '<span class="slot-required"> *</span>' : ''}</span>
      </div>
    `;
  },

  addExtraPhotoSlot() {
    state.extraPhotoCount++;
    const key = `extra_${state.extraPhotoCount}`;
    const grid = document.getElementById('photoGrid');
    const wrap = document.createElement('div');
    wrap.innerHTML = this._photoSlotHTML(key, '📷', 'Foto adicional', false);
    grid.appendChild(wrap.firstElementChild);
  },

  capturePhoto(key) {
    this._pendingPhotoKey = key;
    const input = document.getElementById('hiddenPhotoInput');
    input.value = '';
    input.onchange = (e) => this._handlePhotoFile(e, key);
    input.click();
  },

  _handlePhotoFile(e, key) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.photos[key] = ev.target.result;
      this._paintPhotoSlot(key);
      this._updatePhotoNextButton();
    };
    reader.readAsDataURL(file);
  },

  _paintPhotoSlot(key) {
    const slot = document.getElementById(`slot_${key}`);
    if (!slot) return;
    slot.classList.add('filled');
    slot.innerHTML = `
      <img src="${state.photos[key]}" alt="${key}">
      <span class="slot-badge">✓</span>
      <button class="slot-remove" onclick="event.stopPropagation(); app.removePhoto('${key}')">✕</button>
    `;
  },

  removePhoto(key) {
    delete state.photos[key];
    const slot = document.getElementById(`slot_${key}`);
    if (slot) {
      slot.classList.remove('filled');
      const cfg = CONFIG.REQUIRED_PHOTOS.find(p => p.key === key);
      slot.innerHTML = `<span class="slot-icon">${cfg ? cfg.icon : '📷'}</span><span class="slot-label">${cfg ? cfg.label + ' <span class="slot-required">*</span>' : 'Foto adicional'}</span>`;
    }
    this._updatePhotoNextButton();
  },

  _updatePhotoNextButton() {
    const allRequired = CONFIG.REQUIRED_PHOTOS.every(p => !!state.photos[p.key]);
    document.getElementById('btnFotosNext').disabled = !allRequired;
  },

  /* ── PASO 4: Fotos → Confirmar ────────────────────────────── */
  async goToConfirm() {
    this.showScreen('screenConfirm');
    signaturePad.init();
    signaturePad.clear();

    utils.setText('summaryGPS', 'Obteniendo...');
    const coords = await gpsManager.request();
    state.gpsCoords = coords;
    utils.setText('summaryGPS', coords ? `±${Math.round(coords.accuracy)}m` : 'No disponible');
  },

  setIncident(value) {
    state.hasIncident = value;
    document.getElementById('btnIncidentYes').classList.toggle('active', value);
    document.getElementById('btnIncidentNo').classList.toggle('active', !value);
    document.getElementById('incidentDetail').classList.toggle('hidden', !value);
  },

  clearSignature() { signaturePad.clear(); },

  /* ── ENVÍO FINAL ──────────────────────────────────────────── */
  async submitTrip() {
    state.observation = document.getElementById('observationInput').value.trim();
    state.signatureDataURL = signaturePad.getDataURL();

    if (state.flow === 'devolucion') {
      state.incidentType = document.getElementById('incidentType').value;
      state.incidentDesc = document.getElementById('incidentDesc').value.trim();
      if (state.hasIncident && !state.incidentDesc) {
        toast.error('Describí brevemente el inconveniente.');
        return;
      }
    }

    const now = new Date();
    this.showScreen('screenLoadingSubmit');
    utils.setText('loadingTitle', state.flow === 'devolucion' ? 'Registrando devolución...' : 'Registrando retiro...');
    utils.setText('loadingMsg', 'Subiendo fotos y datos...');
    this._animateProgress(0, 60, 1200);

    const basePayload = {
      employee: state.employee,
      km: state.km,
      fuel: state.fuel,
      estadoGeneral: state.estadoGeneral,
      checklist: state.checklist,
      observation: state.observation,
      signature: state.signatureDataURL || '',
      lat: state.gpsCoords?.lat?.toFixed(7) || '',
      lng: state.gpsCoords?.lng?.toFixed(7) || '',
      accuracy: state.gpsCoords?.accuracy?.toFixed(1) || '',
      datetime: utils.formatDateTime(now),
      timestamp: now.toISOString(),
      userAgent: navigator.userAgent,
    };

    // Adjuntar fotos con prefijo photo_
    Object.entries(state.photos).forEach(([k, v]) => { basePayload[`photo_${k}`] = v; });

    try {
      let result;
      if (state.flow === 'retiro') {
        result = await api.send('retirar', {
          ...basePayload,
          sector: state.sector,
          destino: state.destino,
          motivo: state.motivo,
        });
      } else {
        result = await api.send('devolver', {
          ...basePayload,
          viajeId: state.viajeId,
          hasIncident: state.hasIncident ? 'SI' : 'NO',
          incidentType: state.hasIncident ? state.incidentType : '',
          incidentDesc: state.hasIncident ? state.incidentDesc : '',
        });
      }

      this._animateProgress(60, 100, 500);
      await utils.sleep(500);

      if (result.success) {
        this._showResult(true, result, now);
      } else {
        throw new Error(result.message || 'El servidor rechazó la operación.');
      }
    } catch (err) {
      utils.log('error', 'Submit failed', err.message);
      this._showResult(false, { message: err.message }, now);
    }
  },

  _animateProgress(from, to, duration) {
    const bar = document.getElementById('loadingProgress');
    if (!bar) return;
    const start = performance.now();
    const animate = (t) => {
      const elapsed = t - start;
      const pct = Math.min(from + (to - from) * (elapsed / duration), to);
      bar.style.width = pct + '%';
      if (elapsed < duration) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  },

  _showResult(success, data, now) {
    const isDevolucion = state.flow === 'devolucion';
    const html = success ? `
      <div class="result-icon success">✅</div>
      <h2 class="result-title" style="color:var(--accent-success)">${isDevolucion ? '¡Camioneta devuelta!' : '¡Camioneta retirada!'}</h2>
      <p class="result-sub">${isDevolucion ? 'La unidad quedó disponible nuevamente.' : 'Buen viaje. Recordá devolverla al finalizar.'}</p>
      <div class="result-details">
        <div class="result-detail-row"><span class="key">👤 Empleado</span><span class="val">${state.employee}</span></div>
        <div class="result-detail-row"><span class="key">🧭 Kilometraje</span><span class="val">${state.km}</span></div>
        <div class="result-detail-row"><span class="key">⛽ Combustible</span><span class="val">${state.fuel}</span></div>
        <div class="result-detail-row"><span class="key">🕐 Hora</span><span class="val">${utils.formatTime(now)}</span></div>
        ${isDevolucion && data.kmRecorridos ? `<div class="result-detail-row"><span class="key">🛣️ Km recorridos</span><span class="val">${data.kmRecorridos}</span></div>` : ''}
        ${isDevolucion && data.tiempoUso ? `<div class="result-detail-row"><span class="key">⏱️ Tiempo de uso</span><span class="val">${data.tiempoUso}</span></div>` : ''}
      </div>
    ` : `
      <div class="result-icon error">❌</div>
      <h2 class="result-title" style="color:var(--accent-danger)">Error al registrar</h2>
      <p class="result-sub">No se pudo completar la operación.<br><small style="color:var(--text-muted)">${data.message || 'Error desconocido'}</small></p>
      <div style="margin-top:var(--space-4)">
        <button class="btn btn-ghost btn-full" onclick="app.showScreen('screenConfirm')">🔄 Reintentar</button>
      </div>
    `;
    utils.setHTML('resultCard', html);
    this.showScreen('screenResult');
  },

  /* ── Reset completo ──────────────────────────────────────── */
  async resetToStart() {
    state.employee = null;
    state.flow = null;
    state.viajeId = null;
    state.checklist = {};
    state.photos = {};
    state.extraPhotoCount = 0;
    state.hasIncident = false;
    state.gpsCoords = null;
    state.logs = [];
    document.getElementById('employeeSelect').value = '';
    await this.refreshStatus();
  },
};

/* ──────────────────────────────────────────────────────────────
   INICIAR AL CARGAR LA PÁGINA
──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
