/* ============================================================
   MTO Servicios HVAC — Panel Administrativo · Camioneta
   admin.js — Dashboard, filtros, mantenimiento, daños, charts
   v1.0 — Producción
   Mismo patrón de arquitectura que mto-fichaje/admin.js
   ============================================================ */

'use strict';

/* ── Configuración ────────────────────────────────────────── */
const ADMIN_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzFl4gwF0vd7lyjDI6XKRHQpeI0_3UfY28Xs5BiftU3MaEDF16eILfEh68kPp_xrMnPrQ/exec',
  ADMIN_PIN: '1234',          // ← CAMBIAR en Codigo.gs también
  COMPANY_NAME: 'MTO Servicios HVAC',
  VEHICLE_LABEL: 'Camioneta Service',
  MONTHS_ES: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  EXPECTED_MAX_HOURS: 8,       // aviso de uso prolongado
  MAINTENANCE_SOON_DAYS: 30,   // vencimientos "próximos" (días)
  MAINTENANCE_SOON_KM: 500,    // aviso por kilometraje próximo a vencer
  MAINTENANCE_LABELS: { SERVICE: '🛠️ Service', ACEITE: '🛢️ Cambio de aceite', VTV: '🚦 VTV', SEGURO: '🛡️ Seguro', PATENTE: '🪪 Patente', OTRO: '📋 Otro' },
  INCIDENT_LABELS: { choque: '💥 Choque', rayon: '⚡ Rayón', desperfecto: '🔧 Desperfecto', multa: '🚔 Multa', otro: '❓ Otro' },
};

/* ── Estado global ────────────────────────────────────────── */
const adminState = {
  trips: [],
  filteredTrips: [],
  employees: [],
  maintenance: [],
  damages: [],
  charts: {},
  activeTab: 'records',
  isLoading: false,
  currentTripDetail: null,
};

/* ── Toast helper ─────────────────────────────────────────── */
const adminToast = {
  show(msg, type='info', dur=4000) {
    const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => { el.style.animation='toastOut 0.3s ease forwards'; setTimeout(()=>el.remove(),300); }, dur);
  },
  success(m,d){this.show(m,'success',d);}, error(m,d){this.show(m,'error',d);},
  info(m,d){this.show(m,'info',d);}, warning(m,d){this.show(m,'warning',d);},
};

/* ── Utilidades ───────────────────────────────────────────── */
const adminUtils = {
  parseDate(str) {
    if (!str) return null;
    str = String(str).trim().replace(/,/g, '');
    if (str.includes('/')) {
      const [datePart, timePart=''] = str.split(' ');
      const [d, m, y] = datePart.split('/');
      if (!d || !m || !y) return null;
      return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${timePart||'00:00:00'}`);
    }
    const dt = new Date(str);
    return isNaN(dt.getTime()) ? null : dt;
  },
  formatDate(date) { if (!date) return '—'; return date.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' }); },
  formatDateTime(date) { if (!date) return '—'; return date.toLocaleString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); },
  getInitials(name) { return (name||'?').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase(); },
  diffHours(a, b) { if (!a || !b) return 0; return Math.abs(b - a) / 3600000; },
  formatHoursMin(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  },
  dateKey(date) { if (!date) return ''; return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; },
  monthKey(date) { if (!date) return ''; return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; },
  daysUntil(date) { if (!date) return null; return Math.ceil((date - new Date()) / 86400000); },
  parseGPS(str) {
    if (!str) return null;
    const [lat, lng] = String(str).split(',').map(parseFloat);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  },
  safeJSON(str, fallback) { try { return JSON.parse(str); } catch(e) { return fallback; } },
};

/* ──────────────────────────────────────────────────────────────
   DATOS — parseo de filas del Sheet "Viajes"
   Columnas 0..37 (A..AL) según ESQUEMA_BASE_DATOS.md
──────────────────────────────────────────────────────────────── */
const dataProcessor = {

  parseTrip(row) {
    return {
      id: row[0] || '',
      fechaRetiro: adminUtils.parseDate(row[1]),
      empleado: row[2] || '',
      sector: row[3] || '',
      destino: row[4] || '',
      motivo: row[5] || '',
      kmRetiro: parseFloat(row[6]) || 0,
      combustibleRetiro: row[7] || '',
      estadoGeneralRetiro: row[8] || '',
      checklistRetiro: adminUtils.safeJSON(row[9], {}),
      fotosRetiro: (row[10] || '').split('|').filter(Boolean),
      firmaRetiro: row[11] || '',
      gpsRetiro: adminUtils.parseGPS(row[12]),
      precisionGPSRetiro: row[13] || '',
      dispositivoRetiro: row[14] || '',
      ipRetiro: row[15] || '',
      fechaDevolucion: adminUtils.parseDate(row[16]),
      kmDevolucion: parseFloat(row[17]) || 0,
      combustibleDevolucion: row[18] || '',
      estadoGeneralDevolucion: row[19] || '',
      checklistDevolucion: adminUtils.safeJSON(row[20], {}),
      fotosDevolucion: (row[21] || '').split('|').filter(Boolean),
      firmaDevolucion: row[22] || '',
      gpsDevolucion: adminUtils.parseGPS(row[23]),
      precisionGPSDevolucion: row[24] || '',
      dispositivoDevolucion: row[25] || '',
      ipDevolucion: row[26] || '',
      kmRecorridos: parseFloat(row[27]) || 0,
      tiempoUso: row[28] || '',
      huboInconveniente: (row[29] || '').toUpperCase() === 'SI',
      tipoInconveniente: row[30] || '',
      descripcionInconveniente: row[31] || '',
      observaciones: row[32] || '',
      estadoRegistro: row[33] || 'CERRADO',
      cerradoPorAdmin: (row[36] || '').toUpperCase() === 'SI',
    };
  },

  computeStats(trips) {
    const now = new Date();
    const closed = trips.filter(t => t.estadoRegistro !== 'EN_USO' && t.fechaDevolucion);
    const totalKm = closed.reduce((sum, t) => sum + (t.kmRecorridos || 0), 0);
    const daysWithUse = new Set(closed.map(t => adminUtils.dateKey(t.fechaRetiro))).size || 1;
    const avgDaily = totalKm / daysWithUse;
    const totalHours = closed.reduce((sum, t) => sum + adminUtils.diffHours(t.fechaRetiro, t.fechaDevolucion), 0);

    const byEmployee = {};
    trips.forEach(t => { byEmployee[t.empleado] = (byEmployee[t.empleado] || 0) + 1; });
    const topUser = Object.entries(byEmployee).sort((a,b) => b[1]-a[1])[0];

    const thisMonthTrips = trips.filter(t => t.fechaRetiro && t.fechaRetiro.getMonth() === now.getMonth() && t.fechaRetiro.getFullYear() === now.getFullYear());

    return { totalTrips: trips.length, totalKm, avgDaily, totalHours, topUser, thisMonthTrips, closed };
  },

  computeEmployeeStats(employeeName, trips) {
    const empTrips = trips.filter(t => t.empleado === employeeName);
    const closed = empTrips.filter(t => t.estadoRegistro !== 'EN_USO' && t.fechaDevolucion);
    const totalKm = closed.reduce((s,t) => s + (t.kmRecorridos||0), 0);
    const totalHours = closed.reduce((s,t) => s + adminUtils.diffHours(t.fechaRetiro, t.fechaDevolucion), 0);
    const incidents = empTrips.filter(t => t.huboInconveniente).length;
    return { employeeName, tripCount: empTrips.length, totalKm, totalHours: totalHours.toFixed(1), incidents };
  },
};

/* ──────────────────────────────────────────────────────────────
   GRÁFICOS (Chart.js)
──────────────────────────────────────────────────────────────── */
const chartsManager = {
  defaults: { color: 'rgba(241,245,249,0.85)', grid: 'rgba(255,255,255,0.06)', font: { family: "'Inter', sans-serif", size: 11 } },

  destroyAll() { Object.values(adminState.charts).forEach(c => { try { c.destroy(); } catch(e){} }); adminState.charts = {}; },

  buildDailyChart(trips) {
    const ctx = document.getElementById('chartDaily'); if (!ctx) return;
    const last14 = []; const now = new Date();
    for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate()-i); last14.push(adminUtils.dateKey(d)); }
    const labels = last14.map(k => k.slice(5));
    const data = last14.map(k => trips.filter(t => adminUtils.dateKey(t.fechaRetiro) === k).length);
    if (adminState.charts.daily) adminState.charts.daily.destroy();
    adminState.charts.daily = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Viajes', data, backgroundColor:'rgba(59,130,246,0.5)', borderColor:'rgba(59,130,246,0.9)', borderWidth:1, borderRadius:4 }]}, options:this._commonOptions() });
  },

  buildKmMonthChart(trips) {
    const ctx = document.getElementById('chartKmMonth'); if (!ctx) return;
    const months = []; const now = new Date();
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth()-i, 1); months.push(adminUtils.monthKey(d)); }
    const labels = months.map(k => ADMIN_CONFIG.MONTHS_ES[parseInt(k.split('-')[1])-1].slice(0,3));
    const data = months.map(k => trips.filter(t => adminUtils.monthKey(t.fechaRetiro) === k).reduce((s,t)=>s+(t.kmRecorridos||0),0));
    if (adminState.charts.kmMonth) adminState.charts.kmMonth.destroy();
    adminState.charts.kmMonth = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Km', data, backgroundColor:'rgba(16,185,129,0.5)', borderColor:'rgba(16,185,129,0.9)', borderWidth:1, borderRadius:4 }]}, options:this._commonOptions() });
  },

  buildEmployeeChart(trips) {
    const ctx = document.getElementById('chartEmployee'); if (!ctx) return;
    const grouped = {};
    trips.forEach(t => { grouped[t.empleado] = (grouped[t.empleado]||0)+1; });
    const sorted = Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (adminState.charts.employee) adminState.charts.employee.destroy();
    adminState.charts.employee = new Chart(ctx, { type:'bar', data:{ labels: sorted.map(([n])=>n.split(' ')[0]), datasets:[{ label:'Viajes', data: sorted.map(([,c])=>c), backgroundColor:'rgba(99,102,241,0.5)', borderColor:'rgba(99,102,241,0.9)', borderWidth:1, borderRadius:4 }]}, options:{ ...this._commonOptions(), indexAxis:'y' } });
  },

  buildMonthlyChart(trips) {
    const ctx = document.getElementById('chartMonthly'); if (!ctx) return;
    const months = []; const now = new Date();
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth()-i, 1); months.push(adminUtils.monthKey(d)); }
    const labels = months.map(k => ADMIN_CONFIG.MONTHS_ES[parseInt(k.split('-')[1])-1].slice(0,3) + ' ' + k.split('-')[0].slice(2));
    const data = months.map(k => trips.filter(t => adminUtils.monthKey(t.fechaRetiro) === k).length);
    if (adminState.charts.monthly) adminState.charts.monthly.destroy();
    adminState.charts.monthly = new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'Retiros', data, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.15)', fill:true, tension:0.35, pointBackgroundColor:'#f59e0b' }]}, options:this._commonOptions() });
  },

  _commonOptions() {
    const d = this.defaults;
    return {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'rgba(13,18,38,0.95)', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, titleFont:d.font, bodyFont:d.font } },
      scales:{ x:{ ticks:{ color:d.color, font:d.font }, grid:{ color:d.grid } }, y:{ ticks:{ color:d.color, font:d.font }, grid:{ color:d.grid } } },
    };
  },
};

/* ──────────────────────────────────────────────────────────────
   API — comunicación con Apps Script
──────────────────────────────────────────────────────────────── */
const adminApi = {
  async get(action) {
    const resp = await fetch(`${ADMIN_CONFIG.APPS_SCRIPT_URL}?action=${action}&ts=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },
  async post(action, payload) {
    const formData = new FormData();
    formData.append('action', action);
    Object.entries(payload).forEach(([k,v]) => { if (v !== null && v !== undefined) formData.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); });
    const resp = await fetch(ADMIN_CONFIG.APPS_SCRIPT_URL, { method:'POST', body: formData });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },
};

/* ──────────────────────────────────────────────────────────────
   EXPORTACIÓN
──────────────────────────────────────────────────────────────── */
const exporter = {
  toCSV(trips) {
    const headers = ['ID','Estado','Empleado','FechaRetiro','KmRetiro','FechaDevolucion','KmDevolucion','KmRecorridos','TiempoUso','Destino','Motivo','Inconveniente','TipoInconveniente','Observaciones'];
    const rows = trips.map(t => [
      t.id, t.estadoRegistro, t.empleado,
      t.fechaRetiro ? adminUtils.formatDateTime(t.fechaRetiro) : '—', t.kmRetiro,
      t.fechaDevolucion ? adminUtils.formatDateTime(t.fechaDevolucion) : '—', t.kmDevolucion,
      t.kmRecorridos, t.tiempoUso, `"${(t.destino||'').replace(/"/g,'""')}"`, `"${(t.motivo||'').replace(/"/g,'""')}"`,
      t.huboInconveniente ? 'SI' : 'NO', t.tipoInconveniente, `"${(t.observaciones||'').replace(/"/g,'""')}"`,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `MTO_HVAC_Camioneta_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    adminToast.success('CSV exportado correctamente.');
  },

  toPDF(trips, stats) {
    const printWin = window.open('', '_blank');
    const rows = trips.slice(0, 200).map(t => `
      <tr>
        <td>${t.fechaRetiro ? adminUtils.formatDateTime(t.fechaRetiro) : '—'}</td>
        <td>${t.empleado}</td>
        <td>${t.destino||'—'}</td>
        <td>${t.fechaDevolucion ? adminUtils.formatDateTime(t.fechaDevolucion) : '<b style="color:#ef4444">EN USO</b>'}</td>
        <td>${t.kmRecorridos||'—'} km</td>
        <td>${t.huboInconveniente ? '<b style="color:#f59e0b">SÍ</b>' : '✓'}</td>
      </tr>`).join('');
    printWin.document.write(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte de Camioneta</title>
      <style>
        body{font-family:system-ui,sans-serif;font-size:11px;color:#1a1a2e;padding:20px;}
        h1{font-size:18px;margin-bottom:4px;} h2{font-size:13px;color:#555;margin-bottom:16px;}
        table{border-collapse:collapse;width:100%;} th{background:#0a0f1e;color:#fff;padding:6px 8px;text-align:left;font-size:10px;}
        td{padding:5px 8px;border-bottom:1px solid #eee;} tr:nth-child(even){background:#f8f9fa;}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
        .stat{background:#f0f4ff;padding:10px;border-radius:8px;} .stat b{display:block;font-size:20px;color:#0a0f1e;} .stat span{font-size:10px;color:#666;}
        @media print{body{padding:0;}}
      </style></head><body>
      <h1>🚐 Reporte de Uso de Camioneta — ${ADMIN_CONFIG.COMPANY_NAME}</h1>
      <h2>Generado: ${new Date().toLocaleString('es-AR')}</h2>
      <div class="stats">
        <div class="stat"><b>${stats.totalTrips}</b><span>Viajes totales</span></div>
        <div class="stat"><b>${Math.round(stats.totalKm)}</b><span>Km recorridos</span></div>
        <div class="stat"><b>${stats.totalHours.toFixed(0)}h</b><span>Horas de uso</span></div>
        <div class="stat"><b>${stats.topUser ? stats.topUser[0].split(' ')[0] : '—'}</b><span>Top usuario</span></div>
      </div>
      <table><thead><tr><th>Retiro</th><th>Empleado</th><th>Destino</th><th>Devolución</th><th>Km</th><th>Incidente</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="margin-top:16px;color:#999;font-size:10px;">Mostrando ${Math.min(trips.length,200)} de ${trips.length} viajes.</p>
      </body></html>`);
    printWin.document.close();
    setTimeout(() => printWin.print(), 500);
  },
};

/* ──────────────────────────────────────────────────────────────
   APP ADMIN PRINCIPAL
──────────────────────────────────────────────────────────────── */
const adminApp = {

  login() {
    const pin = document.getElementById('adminPinInput').value.trim();
    if (pin === ADMIN_CONFIG.ADMIN_PIN) {
      document.getElementById('adminLogin').style.display = 'none';
      document.getElementById('adminDashboard').style.display = 'block';
      this.init();
    } else {
      adminToast.error('PIN incorrecto. Intentá de nuevo.');
      document.getElementById('adminPinInput').value = '';
    }
  },

  logout() {
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('adminLogin').style.display = 'flex';
    document.getElementById('adminPinInput').value = '';
    chartsManager.destroyAll();
  },

  async init() {
    await this.loadData();
    setInterval(() => this._renderVehicleHero(), 1000); // timer en vivo
  },

  async loadData() {
    if (adminState.isLoading) return;
    adminState.isLoading = true;
    const btn = document.getElementById('btnRefresh');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Cargando...'; }

    try {
      const [tripsResp, empResp, mntResp, dmgResp] = await Promise.all([
        adminApi.get('getData'), adminApi.get('getEmployees'), adminApi.get('getMaintenance'), adminApi.get('getDamages'),
      ]);

      adminState.trips = (tripsResp.rows || []).filter(r => r && r[0]).map(r => dataProcessor.parseTrip(r)).sort((a,b) => (b.fechaRetiro||0) - (a.fechaRetiro||0));
      adminState.filteredTrips = [...adminState.trips];
      adminState.employees = (empResp.rows || []).filter(r => r && r[1]).map(r => ({ id:r[0], nombre:r[1], sector:r[2], pin:r[3], activo:(r[4]||'SI').toUpperCase()!=='NO', fechaAlta:r[5], email:r[6], telefono:r[7] }));
      adminState.maintenance = (mntResp.rows || []).filter(r => r && r[0]).map(r => ({ id:r[0], tipo:r[1], fechaRealizado: adminUtils.parseDate(r[2]), kmRealizado:r[3], fechaVencimiento: adminUtils.parseDate(r[4]), kmProxVenc:r[5], proveedor:r[6], costo:r[7], obs:r[8] }));
      adminState.damages = (dmgResp.rows || []).filter(r => r && r[0]).map(r => ({ id:r[0], viajeId:r[1], fecha: adminUtils.parseDate(r[2]), tipo:r[3], descripcion:r[4], fotoUrl:r[5], costo:r[6], estado:r[7] }));

      this._renderVehicleHero();
      this._renderStats();
      this._renderExpiryAlerts();
      this._populateEmployeeFilter();
      this.applyFilters();
      this.renderEmployeesTab();
      this.renderMaintenanceTab();
      this.renderDamagesTab();
      this.renderCharts();

      const lastUpdate = new Date().toLocaleTimeString('es-AR');
      document.getElementById('dashSubtitle').textContent = `${ADMIN_CONFIG.COMPANY_NAME} · ${adminState.trips.length} viajes · Actualizado ${lastUpdate}`;
      adminToast.success(`${adminState.trips.length} viajes cargados.`);

    } catch(err) {
      console.error(err);
      adminToast.error(`Error al cargar datos: ${err.message}`);
      document.getElementById('dashSubtitle').textContent = 'Error al cargar datos. Verificá la URL del script.';
    } finally {
      adminState.isLoading = false;
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Actualizar'; }
    }
  },

  /* ── Hero de estado actual ────────────────────────────────── */
  _getOpenTrip() { return adminState.trips.find(t => t.estadoRegistro === 'EN_USO'); },

  _renderVehicleHero() {
    const open = this._getOpenTrip();
    const badge = document.getElementById('vhBadge');
    const elapsed = document.getElementById('vhElapsed');
    const details = document.getElementById('vhDetails');
    const actions = document.getElementById('vhActions');
    if (!badge) return;

    if (open) {
      badge.className = 'vehicle-badge-lg inuse';
      badge.textContent = '🔴 En uso';
      const ms = Date.now() - (open.fechaRetiro ? open.fechaRetiro.getTime() : Date.now());
      const hrs = ms / 3600000;
      elapsed.style.display = '';
      elapsed.className = `badge ${hrs > ADMIN_CONFIG.EXPECTED_MAX_HOURS ? 'badge-red' : 'badge-blue'}`;
      elapsed.textContent = `⏱️ ${adminUtils.formatHoursMin(hrs)}`;
      if (hrs > ADMIN_CONFIG.EXPECTED_MAX_HOURS) elapsed.textContent += ' — uso prolongado';
      details.style.display = '';
      details.innerHTML = `👤 <b>${open.empleado}</b> · 📍 ${open.destino || '—'} · 🕐 Salió ${open.fechaRetiro ? open.fechaRetiro.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—'} · 🧭 ${open.kmRetiro} km`;
      actions.style.display = '';
      adminState._openTripId = open.id;
    } else {
      badge.className = 'vehicle-badge-lg available';
      badge.textContent = '🟢 Disponible';
      elapsed.style.display = 'none';
      details.style.display = 'none';
      actions.style.display = 'none';
    }
  },

  /* ── Stats ─────────────────────────────────────────────────── */
  _renderStats() {
    const s = dataProcessor.computeStats(adminState.trips);
    document.getElementById('statTrips').textContent = s.totalTrips;
    document.getElementById('statTripsChange').textContent = `${s.closed.length} finalizados`;
    document.getElementById('statKm').textContent = Math.round(s.totalKm).toLocaleString('es-AR');
    document.getElementById('statAvgDaily').textContent = `${Math.round(s.avgDaily)} km`;
    document.getElementById('statHours').textContent = adminUtils.formatHoursMin(s.totalHours);
    document.getElementById('statTopUser').textContent = s.topUser ? s.topUser[0] : '—';
    document.getElementById('statTopUserCount').textContent = s.topUser ? `${s.topUser[1]} viajes` : '—';
    document.getElementById('statMonthTrips').textContent = s.thisMonthTrips.length;
    document.getElementById('statMonthLabel').textContent = ADMIN_CONFIG.MONTHS_ES[new Date().getMonth()];
  },

  /* ── Alertas de vencimientos ──────────────────────────────── */
  _renderExpiryAlerts() {
    const panel = document.getElementById('expiryAlertPanel');
    const currentKm = Math.max(0, ...adminState.trips.map(t => Math.max(t.kmRetiro||0, t.kmDevolucion||0)), 0);
    const items = [];

    adminState.maintenance.forEach(m => {
      if (m.fechaVencimiento) {
        const days = adminUtils.daysUntil(m.fechaVencimiento);
        if (days !== null && days <= ADMIN_CONFIG.MAINTENANCE_SOON_DAYS) {
          items.push({ tipo: m.tipo, motivo: days < 0 ? `Vencido hace ${Math.abs(days)} días` : `Vence en ${days} días`, level: days < 0 ? 'overdue' : 'soon' });
        }
      }
      if (m.kmProxVenc && currentKm > 0) {
        const kmRest = parseFloat(m.kmProxVenc) - currentKm;
        if (kmRest <= ADMIN_CONFIG.MAINTENANCE_SOON_KM) {
          items.push({ tipo: m.tipo, motivo: kmRest < 0 ? `Superado por ${Math.abs(Math.round(kmRest))} km` : `Faltan ${Math.round(kmRest)} km`, level: kmRest < 0 ? 'overdue' : 'soon' });
        }
      }
    });

    if (items.length === 0) { panel.innerHTML = ''; return; }

    panel.innerHTML = `<div style="margin-bottom:var(--space-6);">
      ${items.map(it => `
        <div class="expiry-item ${it.level}">
          <span class="expiry-icon">${it.level === 'overdue' ? '🔴' : '🟡'}</span>
          <div class="expiry-info">
            <div class="expiry-title">${ADMIN_CONFIG.MAINTENANCE_LABELS[it.tipo] || it.tipo}</div>
            <div class="expiry-date">${it.motivo}</div>
          </div>
        </div>`).join('')}
    </div>`;
  },

  _populateEmployeeFilter() {
    const sel = document.getElementById('filterEmployee');
    const current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    const names = [...new Set(adminState.trips.map(t => t.empleado))].sort();
    names.forEach(n => { const opt = document.createElement('option'); opt.value = n; opt.textContent = n; if (n === current) opt.selected = true; sel.appendChild(opt); });
  },

  /* ── Filtros / búsqueda ───────────────────────────────────── */
  applyFilters() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const emp = document.getElementById('filterEmployee')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';
    const destino = (document.getElementById('filterDestino')?.value || '').toLowerCase().trim();
    const month = document.getElementById('filterMonth')?.value || '';

    adminState.filteredTrips = adminState.trips.filter(t => {
      if (emp && t.empleado !== emp) return false;
      if (status && t.estadoRegistro !== status) return false;
      if (destino && !(t.destino||'').toLowerCase().includes(destino)) return false;
      if (month && adminUtils.monthKey(t.fechaRetiro) !== month) return false;
      if (search) {
        const haystack = `${t.empleado} ${t.destino} ${t.motivo} ${t.observaciones}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    this.renderRecordsTable();
  },

  clearFilters() {
    ['searchInput','filterEmployee','filterStatus','filterDestino','filterMonth'].forEach(id => { const el = document.getElementById(id); if (el) el.value=''; });
    adminState.filteredTrips = [...adminState.trips];
    this.renderRecordsTable();
  },

  /* ── Tabla de historial ───────────────────────────────────── */
  renderRecordsTable() {
    const tbody = document.getElementById('recordsTable');
    const count = document.getElementById('recordsCount');
    const trips = adminState.filteredTrips;
    count.textContent = `Mostrando ${trips.length} de ${adminState.trips.length} viajes`;

    if (trips.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:var(--space-8);color:var(--text-muted);">Sin registros para el filtro seleccionado.</td></tr>';
      return;
    }

    const statusBadge = { EN_USO: '<span class="badge badge-red">🔴 En uso</span>', CERRADO: '<span class="badge badge-green">✓ Cerrado</span>', CERRADO_MANUAL: '<span class="badge badge-yellow">🔒 Manual</span>' };

    tbody.innerHTML = trips.slice(0, 500).map(t => `
      <tr>
        <td>${statusBadge[t.estadoRegistro] || t.estadoRegistro}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:26px;height:26px;border-radius:50%;background:var(--accent-gradient);display:grid;place-items:center;font-size:9px;font-weight:700;flex-shrink:0;">${adminUtils.getInitials(t.empleado)}</div>
            <span class="truncate">${t.empleado}</span>
          </div>
        </td>
        <td style="white-space:nowrap;">${t.fechaRetiro ? adminUtils.formatDateTime(t.fechaRetiro) : '—'}<br><span style="color:var(--text-muted);font-size:var(--fs-xs);">${t.kmRetiro} km</span></td>
        <td style="white-space:nowrap;">${t.fechaDevolucion ? adminUtils.formatDateTime(t.fechaDevolucion) + `<br><span style="color:var(--text-muted);font-size:var(--fs-xs);">${t.kmDevolucion} km</span>` : '—'}</td>
        <td class="truncate" title="${t.destino}">${t.destino || '—'}</td>
        <td>${t.kmRecorridos ? t.kmRecorridos + ' km' : '—'}</td>
        <td>${t.tiempoUso || '—'}</td>
        <td>${t.huboInconveniente ? `<span class="badge badge-red" title="${t.descripcionInconveniente}">⚠️ ${ADMIN_CONFIG.INCIDENT_LABELS[t.tipoInconveniente]||t.tipoInconveniente}</span>` : '<span class="badge badge-green">✓</span>'}</td>
        <td><div class="photo-thumb-row">${[...t.fotosRetiro, ...t.fotosDevolucion].slice(0,3).map(u => `<img src="${u}" onclick="adminApp.openPhoto('${u}')" onerror="this.style.display='none'">`).join('')}</div></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm" onclick="adminApp.openTripDetail('${t.id}')" title="Ver detalle">👁️</button>
          ${(t.gpsRetiro || t.gpsDevolucion) ? `<button class="btn btn-ghost btn-sm" onclick="adminApp.openMap('${t.id}')" title="Ver mapa">🗺️</button>` : ''}
        </td>
      </tr>`).join('');
  },

  /* ── Detalle / timeline de viaje ──────────────────────────── */
  openTripDetail(id) {
    const t = adminState.trips.find(x => x.id === id);
    if (!t) return;
    adminState.currentTripDetail = t;
    const html = `
      <div class="timeline">
        <div class="timeline-item">
          <div class="timeline-dot">🟢</div>
          <div class="timeline-title">Retiro</div>
          <div class="timeline-meta">${t.fechaRetiro ? adminUtils.formatDateTime(t.fechaRetiro) : '—'} · ${t.empleado}</div>
          <div class="timeline-body">Km: ${t.kmRetiro} · Combustible: ${t.combustibleRetiro} · Estado: ${t.estadoGeneralRetiro}<br>Destino: ${t.destino || '—'} · Motivo: ${t.motivo || '—'}</div>
        </div>
        ${t.huboInconveniente ? `
        <div class="timeline-item event-incident">
          <div class="timeline-dot">⚠️</div>
          <div class="timeline-title">Inconveniente reportado</div>
          <div class="timeline-meta">${ADMIN_CONFIG.INCIDENT_LABELS[t.tipoInconveniente] || t.tipoInconveniente}</div>
          <div class="timeline-body">${t.descripcionInconveniente || '—'}</div>
        </div>` : ''}
        ${t.fechaDevolucion ? `
        <div class="timeline-item event-return">
          <div class="timeline-dot">🔴</div>
          <div class="timeline-title">Devolución${t.cerradoPorAdmin ? ' (cierre manual)' : ''}</div>
          <div class="timeline-meta">${adminUtils.formatDateTime(t.fechaDevolucion)}</div>
          <div class="timeline-body">Km: ${t.kmDevolucion} (${t.kmRecorridos} km recorridos) · Combustible: ${t.combustibleDevolucion} · Estado: ${t.estadoGeneralDevolucion}<br>Tiempo de uso: ${t.tiempoUso}</div>
        </div>` : `<div class="timeline-item"><div class="timeline-dot">⏳</div><div class="timeline-title">Aún no devuelta</div></div>`}
      </div>
      ${t.observaciones ? `<div class="mt-4"><div class="card-title">Observaciones</div><p style="font-size:var(--fs-sm);">${t.observaciones}</p></div>` : ''}
      ${(t.fotosRetiro.length || t.fotosDevolucion.length) ? `
      <div class="mt-4">
        <div class="card-title">Fotos</div>
        <div class="photo-thumb-row" style="flex-wrap:wrap;gap:6px;">
          ${[...t.fotosRetiro, ...t.fotosDevolucion].map(u => `<img src="${u}" style="width:52px;height:52px;border-radius:8px;" onclick="adminApp.openPhoto('${u}')" onerror="this.style.display='none'">`).join('')}
        </div>
      </div>` : ''}
    `;
    document.getElementById('tripDetailBody').innerHTML = html;
    document.getElementById('tripDetailModal').classList.add('open');
  },

  openPhoto(url) {
    document.getElementById('photoModalImg').src = url;
    document.getElementById('photoModal').classList.add('open');
  },

  openMap(id) {
    const t = adminState.trips.find(x => x.id === id);
    if (!t) return;
    const modal = document.getElementById('mapModal');
    modal.classList.add('open');
    setTimeout(() => {
      if (adminState._map) { adminState._map.remove(); adminState._map = null; }
      const center = t.gpsRetiro || t.gpsDevolucion;
      const map = L.map('adminMap').setView([center.lat, center.lng], 14);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution:'© OpenStreetMap © CARTO' }).addTo(map);
      if (t.gpsRetiro) L.marker([t.gpsRetiro.lat, t.gpsRetiro.lng]).addTo(map).bindPopup('🟢 Retiro').openPopup();
      if (t.gpsDevolucion) L.marker([t.gpsDevolucion.lat, t.gpsDevolucion.lng]).addTo(map).bindPopup('🔴 Devolución');
      adminState._map = map;
    }, 100);
  },

  /* ── Cierre manual ────────────────────────────────────────── */
  openManualClose() {
    if (!adminState._openTripId) { adminToast.warning('No hay ningún viaje abierto.'); return; }
    document.getElementById('mcKm').value = '';
    document.getElementById('mcMotivo').value = '';
    document.getElementById('manualCloseModal').classList.add('open');
  },

  async confirmManualClose() {
    const km = document.getElementById('mcKm').value.trim();
    const motivo = document.getElementById('mcMotivo').value.trim();
    if (!km || !motivo) { adminToast.error('Completá el kilometraje y el motivo.'); return; }
    try {
      const result = await adminApi.post('closeManual', { viajeId: adminState._openTripId, km, motivo });
      if (!result.success) throw new Error(result.message);
      adminToast.success('Viaje cerrado manualmente.');
      this.closeModal('manualCloseModal');
      await this.loadData();
    } catch(err) { adminToast.error(`Error: ${err.message}`); }
  },

  closeModal(id) { document.getElementById(id).classList.remove('open'); },

  /* ── Empleados ────────────────────────────────────────────── */
  renderEmployeesTab() {
    const grid = document.getElementById('employeesGrid');
    if (adminState.employees.length === 0) {
      grid.innerHTML = '<div style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:var(--space-8);">Sin empleados cargados aún.</div>';
      return;
    }
    grid.innerHTML = adminState.employees.map(e => {
      const s = dataProcessor.computeEmployeeStats(e.nombre, adminState.trips);
      return `
      <div class="employee-card">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-4);">
          <div class="employee-avatar">${adminUtils.getInitials(e.nombre)}</div>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:var(--fs-base);">${e.nombre}</div>
            <div style="font-size:var(--fs-xs);color:var(--text-muted);">${e.sector || '—'} ${!e.activo ? '· <span style="color:var(--accent-danger)">Inactivo</span>' : ''}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
          <div style="background:var(--bg-glass);border-radius:var(--radius-md);padding:var(--space-3);border:1px solid var(--border-subtle);">
            <div style="font-size:var(--fs-xs);color:var(--text-muted);">Viajes</div><div style="font-size:var(--fs-xl);font-weight:800;">${s.tripCount}</div>
          </div>
          <div style="background:var(--bg-glass);border-radius:var(--radius-md);padding:var(--space-3);border:1px solid var(--border-subtle);">
            <div style="font-size:var(--fs-xs);color:var(--text-muted);">Km recorridos</div><div style="font-size:var(--fs-xl);font-weight:800;">${Math.round(s.totalKm)}</div>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-3);flex-wrap:wrap;align-items:center;">
          ${s.incidents>0 ? `<span class="badge badge-red">⚠️ ${s.incidents} incidente${s.incidents!==1?'s':''}</span>` : '<span class="badge badge-green">Sin incidentes</span>'}
          <div style="flex:1;"></div>
          <button class="btn btn-ghost btn-sm" onclick="adminApp.openEmployeeModal('${e.id}')">✏️ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="adminApp.deleteEmployee('${e.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  },

  openEmployeeModal(id) {
    const e = id ? adminState.employees.find(x => x.id === id) : null;
    document.getElementById('employeeModalTitle').textContent = e ? 'Editar empleado' : 'Nuevo empleado';
    document.getElementById('empId').value = e ? e.id : '';
    document.getElementById('empNombre').value = e ? e.nombre : '';
    document.getElementById('empSector').value = e ? e.sector : '';
    document.getElementById('empPin').value = e ? e.pin : '';
    document.getElementById('empEmail').value = e ? e.email : '';
    document.getElementById('empActivo').value = e ? (e.activo ? 'SI' : 'NO') : 'SI';
    document.getElementById('employeeModal').classList.add('open');
  },

  async saveEmployee() {
    const id = document.getElementById('empId').value;
    const nombre = document.getElementById('empNombre').value.trim();
    if (!nombre) { adminToast.error('El nombre es obligatorio.'); return; }
    const payload = {
      id, nombre,
      sector: document.getElementById('empSector').value.trim(),
      pin: document.getElementById('empPin').value.trim(),
      email: document.getElementById('empEmail').value.trim(),
      activo: document.getElementById('empActivo').value,
    };
    try {
      const result = await adminApi.post(id ? 'updateEmployee' : 'addEmployee', payload);
      if (!result.success) throw new Error(result.message);
      adminToast.success('Empleado guardado.');
      this.closeModal('employeeModal');
      await this.loadData();
    } catch(err) { adminToast.error(`Error: ${err.message}`); }
  },

  async deleteEmployee(id) {
    if (!confirm('¿Dar de baja este empleado? No se eliminará su historial de viajes.')) return;
    try {
      const result = await adminApi.post('deleteEmployee', { id });
      if (!result.success) throw new Error(result.message);
      adminToast.success('Empleado dado de baja.');
      await this.loadData();
    } catch(err) { adminToast.error(`Error: ${err.message}`); }
  },

  /* ── Mantenimiento ────────────────────────────────────────── */
  renderMaintenanceTab() {
    const tbody = document.getElementById('maintenanceTable');
    if (adminState.maintenance.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--space-6);color:var(--text-muted);">Sin registros aún.</td></tr>'; return; }
    const sorted = [...adminState.maintenance].sort((a,b) => (b.fechaRealizado||0) - (a.fechaRealizado||0));
    tbody.innerHTML = sorted.map(m => `
      <tr>
        <td>${ADMIN_CONFIG.MAINTENANCE_LABELS[m.tipo] || m.tipo}</td>
        <td>${m.fechaRealizado ? adminUtils.formatDate(m.fechaRealizado) : '—'}</td>
        <td>${m.kmRealizado || '—'}</td>
        <td>${m.fechaVencimiento ? adminUtils.formatDate(m.fechaVencimiento) : (m.kmProxVenc ? `${m.kmProxVenc} km` : '—')}</td>
        <td>${m.proveedor || '—'}</td>
        <td>${m.costo ? '$' + Number(m.costo).toLocaleString('es-AR') : '—'}</td>
        <td class="truncate" title="${m.obs||''}">${m.obs || '—'}</td>
      </tr>`).join('');
  },

  openMaintenanceModal() {
    ['mntFecha','mntKm','mntVencimiento','mntKmVencimiento','mntProveedor','mntCosto','mntObs'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('maintenanceModal').classList.add('open');
  },

  async saveMaintenance() {
    const payload = {
      tipo: document.getElementById('mntTipo').value,
      fechaRealizado: document.getElementById('mntFecha').value,
      kmRealizado: document.getElementById('mntKm').value,
      fechaVencimiento: document.getElementById('mntVencimiento').value,
      kmProxVenc: document.getElementById('mntKmVencimiento').value,
      proveedor: document.getElementById('mntProveedor').value.trim(),
      costo: document.getElementById('mntCosto').value,
      obs: document.getElementById('mntObs').value.trim(),
    };
    try {
      const result = await adminApi.post('addMaintenance', payload);
      if (!result.success) throw new Error(result.message);
      adminToast.success('Mantenimiento registrado.');
      this.closeModal('maintenanceModal');
      await this.loadData();
    } catch(err) { adminToast.error(`Error: ${err.message}`); }
  },

  /* ── Daños ────────────────────────────────────────────────── */
  renderDamagesTab() {
    const container = document.getElementById('damagesList');
    // Combina incidentes de viajes + notas manuales
    const fromTrips = adminState.trips.filter(t => t.huboInconveniente).map(t => ({
      fecha: t.fechaDevolucion, tipo: t.tipoInconveniente, descripcion: t.descripcionInconveniente,
      empleado: t.empleado, origen: 'Viaje', estado: '—',
    }));
    const manual = adminState.damages.map(d => ({ fecha: d.fecha, tipo: d.tipo, descripcion: d.descripcion, empleado: '—', origen: 'Manual', estado: d.estado }));
    const all = [...fromTrips, ...manual].sort((a,b) => (b.fecha||0) - (a.fecha||0));

    if (all.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);">Sin daños registrados. 🎉</p>'; return; }

    // Reincidencias por tipo
    const byType = {};
    all.forEach(d => { byType[d.tipo] = (byType[d.tipo]||0)+1; });

    container.innerHTML = `
      <div class="filters-row">
        ${Object.entries(byType).map(([t,c]) => `<span class="badge ${c>1?'badge-red':'badge-gray'}">${ADMIN_CONFIG.INCIDENT_LABELS[t]||t}: ${c}${c>1?' (reincidencia)':''}</span>`).join('')}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Empleado</th><th>Descripción</th><th>Origen</th><th>Estado</th></tr></thead>
          <tbody>
            ${all.map(d => `<tr>
              <td>${d.fecha ? adminUtils.formatDate(d.fecha) : '—'}</td>
              <td>${ADMIN_CONFIG.INCIDENT_LABELS[d.tipo]||d.tipo}</td>
              <td>${d.empleado}</td>
              <td class="truncate" title="${d.descripcion||''}">${d.descripcion||'—'}</td>
              <td><span class="badge badge-gray">${d.origen}</span></td>
              <td>${d.estado}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  openDamageModal() {
    document.getElementById('dmgDesc').value = '';
    document.getElementById('dmgCosto').value = '';
    document.getElementById('damageModal').classList.add('open');
  },

  async saveDamage() {
    const payload = {
      tipo: document.getElementById('dmgTipo').value,
      descripcion: document.getElementById('dmgDesc').value.trim(),
      costo: document.getElementById('dmgCosto').value,
      estado: document.getElementById('dmgEstado').value,
    };
    if (!payload.descripcion) { adminToast.error('Describí el daño.'); return; }
    try {
      const result = await adminApi.post('addDamage', payload);
      if (!result.success) throw new Error(result.message);
      adminToast.success('Nota de daño registrada.');
      this.closeModal('damageModal');
      await this.loadData();
    } catch(err) { adminToast.error(`Error: ${err.message}`); }
  },

  /* ── Gráficos ─────────────────────────────────────────────── */
  renderCharts() {
    setTimeout(() => {
      chartsManager.buildDailyChart(adminState.trips);
      chartsManager.buildKmMonthChart(adminState.trips);
      chartsManager.buildEmployeeChart(adminState.trips);
      chartsManager.buildMonthlyChart(adminState.trips);
    }, 100);
  },

  /* ── Tabs ─────────────────────────────────────────────────── */
  switchTab(tab) {
    adminState.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const map = { records:'tabRecords', employees:'tabEmployees', maintenance:'tabMaintenance', damages:'tabDamages', charts:'tabCharts' };
    const panel = document.getElementById(map[tab]);
    if (panel) panel.classList.add('active');
    if (tab === 'charts') this.renderCharts();
  },

  /* ── Exportación ──────────────────────────────────────────── */
  exportCSV() { exporter.toCSV(adminState.filteredTrips); },
  exportPDF() { exporter.toPDF(adminState.filteredTrips, dataProcessor.computeStats(adminState.trips)); },
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('adminPinInput')?.focus();
});
