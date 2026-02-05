const { jsPDF } = window.jspdf || {};

const STORAGE_KEY = 'conferencia.routes.v1';
const { jsPDF } = window.jspdf;

const ConferenciaApp = {
  routes: new Map(),     // routeId -> routeObject
  currentRouteId: null,
  timestamps: new Map(),
  ids: new Set(),
  conferidos: new Set(),
  faltantes: new Set(),
  foraDeRota: new Set(),
  duplicados: new Map(), // <--- novos registros de duplicatas
  totalInicial: 0,
  routeId: '',
  cluster: '',
viaCsv: false,

  // =======================
  // Persistência
  // =======================
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      this.routes.clear();

      for (const [routeId, r] of Object.entries(parsed)) {
        const route = this.makeEmptyRoute(routeId);

        route.cluster = r.cluster || '';
        route.destinationFacilityId = r.destinationFacilityId || '';
        route.destinationFacilityName = r.destinationFacilityName || '';
        route.totalInicial = Number(r.totalInicial || 0);

        (r.ids || []).forEach(id => route.ids.add(id));
        (r.conferidos || []).forEach(id => route.conferidos.add(id));
        (r.foraDeRota || []).forEach(id => route.foraDeRota.add(id));
        route.faltantes = new Set(r.faltantes || []);

        route.timestamps = new Map(Object.entries(r.timestamps || {}).map(([k, v]) => [k, v]));
        route.duplicados = new Map(Object.entries(r.duplicados || {}).map(([k, v]) => [k, v]));

        if (!route.faltantes.size && route.ids.size) {
          route.faltantes = new Set(route.ids);
          for (const c of route.conferidos) route.faltantes.delete(c);
        }

        this.routes.set(String(routeId), route);
      }
    } catch (e) {
      console.warn('Falha ao carregar storage:', e);
    }
  },

  saveToStorage() {
    try {
      const obj = {};
      for (const [routeId, r] of this.routes.entries()) {
        obj[routeId] = {
          routeId: r.routeId,
          cluster: r.cluster,
          destinationFacilityId: r.destinationFacilityId,
          destinationFacilityName: r.destinationFacilityName,
          totalInicial: r.totalInicial,

          ids: Array.from(r.ids),
          faltantes: Array.from(r.faltantes),
          conferidos: Array.from(r.conferidos),
          foraDeRota: Array.from(r.foraDeRota),

          timestamps: Object.fromEntries(r.timestamps),
          duplicados: Object.fromEntries(r.duplicados),
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Falha ao salvar storage:', e);
    }
  },

  deleteRoute(routeId) {
    if (!routeId) return;
    this.routes.delete(String(routeId));
    if (this.currentRouteId === String(routeId)) this.currentRouteId = null;
    this.saveToStorage();
    this.renderRoutesSelects();
  },

  clearAllRoutes() {
    this.routes.clear();
    this.currentRouteId = null;
    localStorage.removeItem(STORAGE_KEY);
    this.renderRoutesSelects();
  },

  // =======================
  // Modelo de rota
  // =======================
  makeEmptyRoute(routeId) {
    return {
      routeId: String(routeId),
      cluster: '',
      destinationFacilityId: '',
      destinationFacilityName: '',

      timestamps: new Map(), // id -> epoch (ms)
      ids: new Set(),
      faltantes: new Set(),
      conferidos: new Set(),
      foraDeRota: new Set(),
      duplicados: new Map(), // id -> count

      totalInicial: 0
    };
  },

  get current() {
    if (!this.currentRouteId) return null;
    return this.routes.get(String(this.currentRouteId)) || null;
  },

  setCurrentRoute(routeId) {
    const id = String(routeId);
    if (!this.routes.has(id)) {
      alert('Rota não encontrada.');
      return;
    }
    this.currentRouteId = id;
    this.renderRoutesSelects();
    this.refreshUIFromCurrent();
    this.saveToStorage();
  },

  // =======================
  // UI
  // =======================
  renderRoutesSelects() {
    const $sel1 = $('#saved-routes');
    const $sel2 = $('#saved-routes-inapp');

    const routesSorted = Array.from(this.routes.values())
      .sort((a, b) => a.routeId.localeCompare(b.routeId));

    const makeLabel = (r) => {
      const parts = [];
      parts.push(`ROTA ${r.routeId}`);
      if (r.cluster) parts.push(`CLUSTER ${r.cluster}`);
      if (r.destinationFacilityId) parts.push(`XPT ${r.destinationFacilityId}`);
      return parts.join(' • ');
    };

    $sel1.html(
      ['<option value="">(Nenhuma selecionada)</option>']
        .concat(routesSorted.map(r => `<option value="${r.routeId}">${makeLabel(r)}</option>`))
        .join('')
    );

    $sel2.html(routesSorted.map(r => `<option value="${r.routeId}">${makeLabel(r)}</option>`).join(''));

    if (this.currentRouteId) {
      $sel1.val(this.currentRouteId);
      $sel2.val(this.currentRouteId);
    }
  },

  refreshUIFromCurrent() {
    const r = this.current;
    if (!r) return;

    $('#route-title').html(`ROTA: <strong>${r.routeId}</strong>`);
    $('#cluster-title').html(r.cluster ? `CLUSTER: <strong>${r.cluster}</strong>` : '');
    $('#destination-facility-title').html(r.destinationFacilityId ? `<strong>XPT:</strong> ${r.destinationFacilityId}` : '');
    $('#destination-facility-name').html(r.destinationFacilityName ? `<strong>DESTINO:</strong> ${r.destinationFacilityName}` : '');

    $('#extracted-total').text(r.totalInicial || r.ids.size);
    $('#verified-total').text(r.conferidos.size);

    this.atualizarListas();
  alertar(msg) {
    alert(msg);
},

atualizarProgresso() {
    const r = this.current;
    if (!r) return;

    const total = r.totalInicial || (r.ids.size || (r.conferidos.size + r.faltantes.size));
    const perc = total ? (r.conferidos.size / total) * 100 : 0;

    $('#progress-bar').css('width', perc + '%').text(Math.floor(perc) + '%');
    const total = this.totalInicial || (this.conferidos.size + this.ids.size + this.foraDeRota.size);
    const percentual = total ? (this.conferidos.size / total) * 100 : 0;
    $('#progress-bar').css('width', percentual + '%').text(Math.floor(percentual) + '%');
},

atualizarListas() {
    const r = this.current;
    if (!r) return;

$('#conferidos-list').html(
      `<h6>Conferidos (<span class='badge badge-success'>${r.conferidos.size}</span>)</h6>` +
      Array.from(r.conferidos).map(id => `<li class='list-group-item list-group-item-success'>${id}</li>`).join('')
      `<h6>Conferidos (<span class='badge badge-success'>${this.conferidos.size}</span>)</h6>` +
      Array.from(this.conferidos)
        .map(id => `<li class='list-group-item list-group-item-success'>${id}</li>`)
        .join('')
);

$('#faltantes-list').html(
      `<h6>Faltantes (<span class='badge badge-danger'>${r.faltantes.size}</span>)</h6>` +
      Array.from(r.faltantes).map(id => `<li class='list-group-item list-group-item-danger'>${id}</li>`).join('')
      `<h6>Faltantes (<span class='badge badge-danger'>${this.ids.size}</span>)</h6>` +
      Array.from(this.ids)
        .map(id => `<li class='list-group-item list-group-item-danger'>${id}</li>`)
        .join('')
);

$('#fora-rota-list').html(
      `<h6>Fora de Rota (<span class='badge badge-warning'>${r.foraDeRota.size}</span>)</h6>` +
      Array.from(r.foraDeRota).map(id => `<li class='list-group-item list-group-item-warning'>${id}</li>`).join('')
      `<h6>Fora de Rota (<span class='badge badge-warning'>${this.foraDeRota.size}</span>)</h6>` +
      Array.from(this.foraDeRota)
        .map(id => `<li class='list-group-item list-group-item-warning'>${id}</li>`)
        .join('')
);

    // nova lista de duplicatas
$('#duplicados-list').html(
      `<h6>Duplicados (<span class='badge badge-secondary'>${r.duplicados.size}</span>)</h6>` +
      Array.from(r.duplicados.entries())
      `<h6>Duplicados (<span class='badge badge-secondary'>${this.duplicados.size}</span>)</h6>` +
      Array.from(this.duplicados.entries())
.map(([id, count]) => `<li class='list-group-item list-group-item-secondary'>${id} <span class="badge badge-dark ml-2">${count}x</span></li>`)
.join('')
);

    $('#verified-total').text(r.conferidos.size);
    $('#verified-total').text(this.conferidos.size);
this.atualizarProgresso();
},
normalizarCodigo(raw) {
  if (!raw) return null;

  // =======================
  // Normalização / Som
  // =======================
  normalizarCodigo(raw) {
    if (!raw) return null;
    let s = String(raw).trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    let m = s.match(/(4\d{10})/);
    if (m) return m[1];

    m = s.replace(/\D/g, '').match(/(\d{11,})/);
    if (m) return m[1].slice(0, 11);

    return null;
  },

  playAlertSound() {
    try {
      const audio = new Audio('mixkit-alarm-tone-996-_1_.mp3');
      audio.play().catch(() => {});
    } catch {}
  },

  // =======================
  // Fora de rota inteligente (global)
  // =======================
  findCorrectRouteForId(id) {
    for (const [rid, r] of this.routes.entries()) {
      if (r.ids && r.ids.has(id)) return String(rid);
    }
    for (const [rid, r] of this.routes.entries()) {
      if (r.faltantes && r.faltantes.has(id)) return String(rid);
    }
    for (const [rid, r] of this.routes.entries()) {
      if (r.conferidos && r.conferidos.has(id)) return String(rid);
    }
    return null;
  },

  cleanupIdFromOtherRoutes(id, targetRouteId) {
    const target = String(targetRouteId);

    for (const [rid, r] of this.routes.entries()) {
      if (String(rid) === target) continue;

      let changed = false;
  // Remove espaços e caracteres invisíveis / de controle
  let s = String(raw)
    .trim()
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // controles ASCII

      if (r.foraDeRota && r.foraDeRota.has(id)) {
        r.foraDeRota.delete(id);
        changed = true;
      }

      if (r.duplicados && r.duplicados.has(id)) {
        r.duplicados.delete(id);
        changed = true;
      }

      if (changed) {
        const stillRelevant =
          (r.conferidos && r.conferidos.has(id)) ||
          (r.faltantes && r.faltantes.has(id)) ||
          (r.ids && r.ids.has(id)) ||
          (r.foraDeRota && r.foraDeRota.has(id)) ||
          (r.duplicados && r.duplicados.has(id));
  // Alguns leitores “escapam” controles como ^...^, então tentamos extrair o ID numérico
  // Seu padrão atual já procura (4\d{10}) em CSV; vamos reutilizar a mesma lógica aqui.
  let m = s.match(/(4\d{10})/);
  if (m) return m[1];

        if (!stillRelevant && r.timestamps) r.timestamps.delete(id);
      }
    }
  },
  // Fallback: pega qualquer sequência de 11+ dígitos e usa os 11 primeiros
  // (se você quiser mais rígido, remova este fallback)
  m = s.replace(/\D/g, '').match(/(\d{11,})/);
  if (m) return m[1].slice(0, 11);

  // =======================
  // Conferência
  // =======================
  conferirId(codigo) {
    const r = this.current;
    if (!r || !codigo) return;

    const now = Date.now();
  return null;
},

    const correctRouteId = this.findCorrectRouteForId(codigo);
    const isCorrectHere = correctRouteId && String(correctRouteId) === String(this.currentRouteId);
conferirId(codigo) {
  if (!codigo) return;

    if (isCorrectHere) {
      this.cleanupIdFromOtherRoutes(codigo, this.currentRouteId);
    }
  const dataHora = Date.now();

    if (r.conferidos.has(codigo)) {
      const count = r.duplicados.get(codigo) || 1;
      r.duplicados.set(codigo, count + 1);
      r.timestamps.set(codigo, now);
  // ✅ Tratativa de DUPLICATAS
  if (this.conferidos.has(codigo) || this.foraDeRota.has(codigo)) {
    const count = this.duplicados.get(codigo) || 1;
    this.duplicados.set(codigo, count + 1);
    this.timestamps.set(codigo, dataHora);

      if (!this.viaCsv) this.playAlertSound();
      $('#barcode-input').val('').focus();
      this.saveToStorage();
      this.atualizarListas();
      return;
    }

    if (r.faltantes.has(codigo)) {
      r.faltantes.delete(codigo);
      r.conferidos.add(codigo);
      r.timestamps.set(codigo, now);

      $('#barcode-input').val('').focus();
      this.saveToStorage();
      this.atualizarListas();
      return;
    }

    if (r.foraDeRota.has(codigo)) {
      const count = r.duplicados.get(codigo) || 1;
      r.duplicados.set(codigo, count + 1);
      r.timestamps.set(codigo, now);
      if (!this.viaCsv) this.playAlertSound();
    } else {
      r.foraDeRota.add(codigo);
      r.timestamps.set(codigo, now);
      if (!this.viaCsv) this.playAlertSound();
    // 🔊 toca som de duplicata, igual ao fora de rota
    if (!this.viaCsv) {
      try {
        const audio = new Audio('mixkit-alarm-tone-996-_1_.mp3');
        audio.play().catch(() => {});
      } catch {}
}

$('#barcode-input').val('').focus();
    this.saveToStorage();
this.atualizarListas();
  },

  // =======================
  // Importação HTML: várias rotas
  // =======================
  importRoutesFromHtml(rawHtml) {
    const html = String(rawHtml || '').replace(/<[^>]+>/g, ' ');

    const idxs = [];
    for (const m of html.matchAll(/"routeId":(\d+)/g)) idxs.push(m.index);

    if (!idxs.length) {
      alert('Não encontrei nenhum "routeId" no HTML.');
      return 0;
    }

    const blocks = [];
    for (let i = 0; i < idxs.length; i++) {
      const start = idxs[i];
      const end = i + 1 < idxs.length ? idxs[i + 1] : html.length;
      blocks.push(html.slice(start, end));
    }

    let imported = 0;

    for (const block of blocks) {
      const routeMatch = /"routeId":(\d+)/.exec(block);
      if (!routeMatch) continue;

      const routeId = String(routeMatch[1]);
      const route = this.routes.get(routeId) || this.makeEmptyRoute(routeId);

      const clusterMatch = /"cluster":"([^"]+)"/.exec(block);
      if (clusterMatch) route.cluster = clusterMatch[1];

      const facMatch = /"destinationFacilityId":"([^"]+)","name":"([^"]+)"/.exec(block);
      if (facMatch) {
        route.destinationFacilityId = facMatch[1];
        route.destinationFacilityName = facMatch[2];
      }

      const regexEnvio = /"id":(4\d{10})[\s\S]*?"receiver_id":"([^"]+)"/g;
      let match;
      const idsExtraidos = new Set();

      while ((match = regexEnvio.exec(block)) !== null) {
        const shipmentId = match[1];
        const receiverId = match[2];
        if (!receiverId.includes('_')) idsExtraidos.add(shipmentId);
      }

      if (!idsExtraidos.size) continue;

      for (const id of idsExtraidos) {
        route.ids.add(id);
        if (!route.conferidos.has(id)) route.faltantes.add(id);
      }

      route.totalInicial = route.ids.size;
      this.routes.set(routeId, route);
      imported++;
    }

    this.saveToStorage();
    this.renderRoutesSelects();
    return imported;
  },

// =======================
// EXPORT: rota atual CSV (PADRÃO ANTIGO)
// date,time,time_zone,format,text,notes,favorite,date_utc,time_utc,metadata,duplicates
// =======================
exportRotaAtualCsv() {
  const r = this.current;
  if (!r) {
    alert('Nenhuma rota selecionada.');
return;
}

  // Mantém a lógica antiga: exporta conferidos + fora de rota + duplicados (keys)
  const all = [
    ...Array.from(r.conferidos || []),
    ...Array.from(r.foraDeRota || []),
    ...Array.from((r.duplicados && r.duplicados.keys()) ? r.duplicados.keys() : [])
  ];

  // Remove duplicados da lista final (caso o mesmo ID esteja em mais de um set/map)
  const uniq = Array.from(new Set(all));

  if (uniq.length === 0) {
    alert('Nenhum ID para exportar.');
    return;
  // ✅ Pacote normal
  if (this.ids.has(codigo)) {
    this.ids.delete(codigo);
    this.conferidos.add(codigo);
    this.timestamps.set(codigo, dataHora);
  } else {
    // ✅ Fora de rota
    this.foraDeRota.add(codigo);
    this.timestamps.set(codigo, dataHora);

    if (!this.viaCsv) {
      try {
        const audio = new Audio('mixkit-alarm-tone-996-_1_.mp3');
        audio.play().catch(() => {});
       } catch {}
    }
}

  const parseDateSafe = (value) => {
    if (!value) return new Date();
    if (value instanceof Date) return value;
  $('#barcode-input').val('').focus();
  this.atualizarListas();
},

    if (typeof value === 'number') return new Date(value);
  gerarCsvText() {
    const all = [...this.conferidos, ...this.foraDeRota, ...this.duplicados.keys()];
    if (all.length === 0) {
      alert('Nenhum ID para exportar.');
      return;
    }

    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parseDateSafe = (value) => {
      if (!value) return new Date();
      if (value instanceof Date) return value;
      if (typeof value === 'number') return new Date(value);
      if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
          const d = new Date(value);
          if (!isNaN(d.getTime())) return d;
        }
        const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (m) {
          const [ , dd, mm, yyyy, HH, MM, SS = '00' ] = m;
          const iso = `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}`;
          const d = new Date(iso);
          if (!isNaN(d.getTime())) return d;
        }
        if (/^\d{13}$/.test(value)) return new Date(Number(value));
const d = new Date(value);
if (!isNaN(d.getTime())) return d;
}
      return new Date();
    };

      const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (m) {
        const [, dd, mm, yyyy, HH, MM, SS = '00'] = m;
        const iso = `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}`;
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return d;
      }

      if (/^\d{13}$/.test(value)) return new Date(Number(value));

      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }

    return new Date();
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const zona = 'Horário Padrão de Brasília';
  const header = 'date,time,time_zone,format,text,notes,favorite,date_utc,time_utc,metadata,duplicates';

  // Se tiver timestamps, ordena por ordem de leitura
  uniq.sort((a, b) => {
    const ta = r.timestamps?.get(a) ? Number(r.timestamps.get(a)) : 0;
    const tb = r.timestamps?.get(b) ? Number(r.timestamps.get(b)) : 0;
    return (ta - tb) || String(a).localeCompare(String(b));
  });

  const linhas = uniq.map((id) => {
    const lidaEm = parseDateSafe(r.timestamps?.get(id));
    const date = `${lidaEm.getFullYear()}-${pad2(lidaEm.getMonth() + 1)}-${pad2(lidaEm.getDate())}`;
    const time = `${pad2(lidaEm.getHours())}:${pad2(lidaEm.getMinutes())}:${pad2(lidaEm.getSeconds())}`;

    const iso = lidaEm.toISOString();
    const dateUtc = iso.slice(0, 10);
    const timeUtc = iso.split('T')[1].split('.')[0];

    // No seu app atual, duplicados guarda contagem total de leituras (2,3,4...)
    // No CSV antigo, "duplicates" era "extras" -> count - 1
    const totalReads = r.duplicados?.get(id) || 0;
    const dupCount = totalReads ? Math.max(0, totalReads - 1) : 0;

    // notes vazio, favorite 0, metadata vazio (igual antigo)
    return `${date},${time},${zona},Code 128,${id},,0,${dateUtc},${timeUtc},,${dupCount}`;
  });

  const conteudo = [header, ...linhas].join('\r\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);

  const cluster = (r.cluster || 'semCluster').trim() || 'semCluster';
  const rota = (r.routeId || 'semRota').trim() || 'semRota';
  link.download = `${cluster}_${rota}_padrao.csv`;

  link.click();
},

  // =======================
// EXPORT: todas as rotas (XLSX)
// 1 aba ("Bipagens"), 1 coluna por rota, só IDs bipados (conferidos)
// =======================
exportTodasRotasXlsx() {
  if (typeof XLSX === 'undefined') {
    alert('Biblioteca XLSX não carregou. Verifique o script do SheetJS no HTML.');
    return;
  }
  if (!this.routes || this.routes.size === 0) {
    alert('Não há rotas salvas para exportar.');
    return;
  }

  const routesSorted = Array.from(this.routes.values())
    .sort((a, b) => String(a.routeId).localeCompare(String(b.routeId)));

  // Monta colunas: header e lista de IDs (somente conferidos)
  const cols = routesSorted.map((r) => {
    const routeId = String(r.routeId || '');
    const cluster = String(r.cluster || '').trim();
    const zona = 'Horário Padrão de Brasília';
    const header = 'date,time,time_zone,format,text,notes,favorite,date_utc,time_utc,metadata,duplicates';

    // Cabeçalho no formato: "J2-Cluster" (se cluster vazio, fica só "J2")
    const header = cluster ? `${routeId}-${cluster}` : routeId;
    const linhas = all.map(id => {
      const lidaEm = parseDateSafe(this.timestamps.get(id));
      const pad2 = n => String(n).padStart(2,'0');
      const date = `${lidaEm.getFullYear()}-${pad2(lidaEm.getMonth()+1)}-${pad2(lidaEm.getDate())}`;
      const time = `${pad2(lidaEm.getHours())}:${pad2(lidaEm.getMinutes())}:${pad2(lidaEm.getSeconds())}`;

    // IDs bipados "certos" nessa rota
    const ids = Array.from(r.conferidos || []);
      const dateUtc = lidaEm.toISOString().slice(0, 10);
      const timeUtc = lidaEm.toISOString().split('T')[1].split('.')[0];
      const dupCount = this.duplicados.get(id) ? this.duplicados.get(id) - 1 : 0;

    // Ordena por timestamp (se existir) e depois por ID
    ids.sort((x, y) => {
      const tx = r.timestamps?.get(x) ? Number(r.timestamps.get(x)) : 0;
      const ty = r.timestamps?.get(y) ? Number(r.timestamps.get(y)) : 0;
      return (tx - ty) || String(x).localeCompare(String(y));
      return `${date},${time},${zona},Code 128,${id},,0,${dateUtc},${timeUtc},,${dupCount}`;
});

    return { header, ids };
  });

  const maxLen = cols.reduce((m, c) => Math.max(m, c.ids.length), 0);

  // AOA: primeira linha = cabeçalhos, demais linhas = ids por coluna
  const aoa = [];
  aoa.push(cols.map(c => c.header || 'ROTA'));

  for (let i = 0; i < maxLen; i++) {
    aoa.push(cols.map(c => c.ids[i] || ''));
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
    const conteudo = [header, ...linhas].join('\r\n');
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

  // Visual: congela cabeçalho e ajusta largura
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!cols'] = cols.map(() => ({ wch: 18 }));

  XLSX.utils.book_append_sheet(wb, ws, 'Bipagens');

  const pad2 = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}`;

  XLSX.writeFile(wb, `bipagens_todas_rotas_${stamp}.xlsx`);
    const cluster = this.cluster || 'semCluster';
    const rota = this.routeId || 'semRota';
    link.download = `${cluster}_${rota}_padrao.csv`;
    link.click();
},
};
// =======================
// Eventos
// =======================
$(document).ready(() => {
  ConferenciaApp.loadFromStorage();
  ConferenciaApp.renderRoutesSelects();
});

$('#extract-btn').click(() => {
  const raw = $('#html-input').val();
  if (!raw.trim()) return alert('Cole o HTML antes de importar.');

  const qtd = ConferenciaApp.importRoutesFromHtml(raw);
  if (!qtd) return alert('Nenhuma rota importada. Confira se o HTML está completo.');

  alert(`${qtd} rota(s) importada(s) e salva(s)! Agora selecione e clique em "Carregar rota".`);
});

$('#load-route').click(() => {
  const id = $('#saved-routes').val();
  if (!id) return alert('Selecione uma rota salva.');
  finalizar() {
    this.gerarCsvText();
    $('#reportModal').modal('show');
  },

  ConferenciaApp.setCurrentRoute(id);
  gerarRelatorioTxt() {
    let conteudo = '';
    if (this.conferidos.size) conteudo += 'CONFERIDOS:\n' + Array.from(this.conferidos).join('\n') + '\n\n';
    if (this.ids.size) conteudo += 'FALTANTES:\n' + Array.from(this.ids).join('\n') + '\n\n';
    if (this.foraDeRota.size) conteudo += 'FORA DE ROTA:\n' + Array.from(this.foraDeRota).join('\n') + '\n\n';
    if (this.duplicados.size)
      conteudo += 'DUPLICADOS:\n' + Array.from(this.duplicados.entries()).map(([id, c]) => `${id} (${c}x)`).join('\n');

    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'relatorio.txt';
    link.click();
  },

  $('#initial-interface').addClass('d-none');
  $('#manual-interface').addClass('d-none');
  $('#conference-interface').removeClass('d-none');
  $('#barcode-input').focus();
});
  gerarRelatorioPdf() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 10;
    const margemInferior = 280;
    doc.setFontSize(16);
    doc.text('Relatório de Conferência de Rota', 10, y);
    y += 10;
    doc.setFontSize(10);

    const addSec = (titulo, cor, dados) => {
      if (dados.size > 0) {
        doc.setTextColor(...cor);
        doc.text(titulo, 10, y);
        y += 6;
        dados.forEach((id) => {
          if (y > margemInferior) {
            doc.addPage();
            y = 10;
            doc.setFontSize(10);
            doc.setTextColor(...cor);
            doc.text(titulo + ' (continuação)', 10, y);
            y += 6;
          }
          doc.text(id.toString(), 10, y);
          y += 6;
        });
        y += 4;
      }
    };

$('#delete-route').click(() => {
  const id = $('#saved-routes').val();
  if (!id) return alert('Selecione uma rota para excluir.');
  ConferenciaApp.deleteRoute(id);
});
    addSec('Conferidos:', [0, 128, 0], this.conferidos);
    addSec('Faltantes:', [255, 0, 0], this.ids);
    addSec('Fora de Rota:', [255, 165, 0], this.foraDeRota);
    addSec('Duplicados:', [100, 100, 100], new Map(Array.from(this.duplicados.keys()).map(id => [id, null])));

$('#clear-all-routes').click(() => {
  ConferenciaApp.clearAllRoutes();
  alert('Todas as rotas foram removidas.');
});
    doc.save('relatorio.pdf');
  }
};

$('#switch-route').click(() => {
  const id = $('#saved-routes-inapp').val();
  if (!id) return;
  ConferenciaApp.setCurrentRoute(id);
  $('#barcode-input').focus();
});
// ================== EVENTOS ==================

$('#manual-btn').click(() => {
$('#initial-interface').addClass('d-none');
@@ -621,38 +247,78 @@ $('#manual-btn').click(() => {

$('#submit-manual').click(() => {
try {
    const routeId = ($('#manual-routeid').val() || '').trim();
    if (!routeId) return alert('Informe o RouteId.');

    const cluster = ($('#manual-cluster').val() || '').trim();
    const manualIds = $('#manual-input').val().split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    let manualIds = $('#manual-input').val().split(/[\s,]+/).map(id => id.trim());
    manualIds.forEach(id => {
      if (id) ConferenciaApp.ids.add(id);
    });

    if (!manualIds.length) return alert('Nenhum ID válido inserido.');
    if (ConferenciaApp.ids.size === 0) {
      alert('Nenhum ID válido inserido.');
      return;
    }

    const route = ConferenciaApp.routes.get(String(routeId)) || ConferenciaApp.makeEmptyRoute(routeId);
    route.cluster = cluster || route.cluster;
    ConferenciaApp.totalInicial = ConferenciaApp.ids.size;
    $('#total-extracted').text(ConferenciaApp.ids.size);
    $('#manual-interface').addClass('d-none');
    $('#conference-interface').removeClass('d-none');
    ConferenciaApp.atualizarListas();
  } catch (error) {
    alert('Erro ao processar IDs manuais.');
    console.error(error);
  }
});

    for (const id of manualIds) {
      route.ids.add(id);
      if (!route.conferidos.has(id)) route.faltantes.add(id);
$('#extract-btn').click(() => {
  let html = $('#html-input').val().replace(/<[^>]+>/g, ' ');
  ConferenciaApp.ids.clear();

  // 🔎 Pega o shipment "id" e o "receiver_id" no mesmo bloco
  const regexEnvio = /"id":(4\d{10})[\s\S]*?"receiver_id":"([^"]+)"/g;
  let match;
  while ((match = regexEnvio.exec(html)) !== null) {
    const shipmentId = match[1];
    const receiverId = match[2];

    // ✅ Só adiciona se NÃO for place (receiverId sem "_")
    if (!receiverId.includes('_')) {
      ConferenciaApp.ids.add(shipmentId);
}
  }

    route.totalInicial = route.ids.size;
    ConferenciaApp.routes.set(String(routeId), route);
  // === resto do seu código permanece igual ===

    ConferenciaApp.saveToStorage();
    ConferenciaApp.renderRoutesSelects();
  const routeMatch = /"routeId":(\d+)/.exec(html);
  if (routeMatch) {
    ConferenciaApp.routeId = routeMatch[1];
    $('#route-title').text(`Conferência da rota: ${ConferenciaApp.routeId}`);
  }

    alert(`Rota ${routeId} salva com ${route.totalInicial} ID(s).`);
  const regexFacility = /"destinationFacilityId":"([^"]+)","name":"([^"]+)"/;
  const facMatch = regexFacility.exec(html);
  if (facMatch) {
    ConferenciaApp.destinationFacilityId = facMatch[1];
    ConferenciaApp.destinationFacilityName = facMatch[2];
    $('#destination-facility-title').html(`<strong>XPT:</strong> ${facMatch[1]}`);
    $('#destination-facility-name').html(`<strong>DESTINO:</strong> ${facMatch[2]}`);
  }

    $('#manual-interface').addClass('d-none');
    $('#initial-interface').removeClass('d-none');
  } catch (e) {
    console.error(e);
    alert('Erro ao processar IDs manuais.');
  ConferenciaApp.totalInicial = ConferenciaApp.ids.size;

  $('#route-title').html(`ROTA: <strong>${ConferenciaApp.routeId}</strong>`);
  $('#extracted-total').text(ConferenciaApp.ids.size);
  $('#initial-interface').addClass('d-none');
  $('#conference-interface').removeClass('d-none');
  ConferenciaApp.atualizarListas();

  const regexCluster = /"cluster":"([^"]+)"/g;
  const clusters = [...html.matchAll(regexCluster)].map(m => m[1]);
  if (clusters.length) {
    ConferenciaApp.cluster = clusters[0];
    $('#cluster-title').html(`CLUSTER: <strong>${clusters[0]}</strong>`);
}
});


$('#barcode-input').keypress(e => {
if (e.which === 13) {
ConferenciaApp.viaCsv = false;
@@ -662,59 +328,58 @@ $('#barcode-input').keypress(e => {

if (!id) {
$('#barcode-input').val('').focus();
      // opcional: um bip/alerta de "inválido"
      // ConferenciaApp.alertar('QR/Barcode lido, mas não encontrei um ID válido.');
return;
}

ConferenciaApp.conferirId(id);
}
});

$('#check-csv').click(() => {
  const r = ConferenciaApp.current;
  if (!r) return alert('Selecione uma rota antes.');

$('#check-csv').click(() => {
const fileInput = document.getElementById('csv-input');
  if (fileInput.files.length === 0) return alert('Selecione um arquivo CSV.');
  if (fileInput.files.length === 0) {
    ConferenciaApp.alertar('Selecione um arquivo CSV.');
    return;
  }

ConferenciaApp.viaCsv = true;

const file = fileInput.files[0];
const reader = new FileReader();

reader.onload = e => {
const csvText = e.target.result;
const linhas = csvText.split(/\r?\n/);
    if (!linhas.length) return alert('Arquivo CSV vazio.');
    if (!linhas.length) {
      ConferenciaApp.alertar('Arquivo CSV vazio.');
      return;
    }

const header = linhas[0].split(',');
const textCol = header.findIndex(h => /(text|texto|id)/i.test(h));
    if (textCol === -1) return alert('Coluna apropriada não encontrada (text/texto/id).');
    if (textCol === -1) {
      ConferenciaApp.alertar('Coluna apropriada não encontrada (text/texto/id).');
      return;
    }

for (let i = 1; i < linhas.length; i++) {
if (!linhas[i].trim()) continue;
      const cols = linhas[i].split(',');
      if (cols.length <= textCol) continue;

      let campo = cols[textCol].trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      const colunas = linhas[i].split(',');
      if (colunas.length <= textCol) continue;
      let campo = colunas[textCol].trim().replace(/^"|"$/g, '').replace(/""/g, '"');
const id = ConferenciaApp.normalizarCodigo(campo);
if (id) ConferenciaApp.conferirId(id);
}

ConferenciaApp.viaCsv = false;
$('#barcode-input').focus();
};

reader.readAsText(file, 'UTF-8');
});

// ✅ Binds NOVOS (delegação, não falha)
$(document).on('click', '#export-csv-rota-atual', () => {
  ConferenciaApp.exportRotaAtualCsv();
});

$(document).on('click', '#export-xlsx-todas-rotas', () => {
  ConferenciaApp.exportTodasRotasXlsx();
});

// ✅ Sem bind no finalizar (fica sem ação)
$('#finish-btn').click(() => ConferenciaApp.finalizar());
$('#back-btn').click(() => location.reload());
$('#export-txt').click(() => ConferenciaApp.gerarRelatorioTxt());
$('#export-pdf').click(() => ConferenciaApp.gerarRelatorioPdf());
