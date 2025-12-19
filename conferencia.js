const { jsPDF } = window.jspdf;

const ConferenciaApp = {
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

  alertar(msg) {
    alert(msg);
  },

  atualizarProgresso() {
    const total = this.totalInicial || (this.conferidos.size + this.ids.size + this.foraDeRota.size);
    const percentual = total ? (this.conferidos.size / total) * 100 : 0;
    $('#progress-bar').css('width', percentual + '%').text(Math.floor(percentual) + '%');
  },

  atualizarListas() {
    $('#conferidos-list').html(
      `<h6>Conferidos (<span class='badge badge-success'>${this.conferidos.size}</span>)</h6>` +
      Array.from(this.conferidos)
        .map(id => `<li class='list-group-item list-group-item-success'>${id}</li>`)
        .join('')
    );

    $('#faltantes-list').html(
      `<h6>Faltantes (<span class='badge badge-danger'>${this.ids.size}</span>)</h6>` +
      Array.from(this.ids)
        .map(id => `<li class='list-group-item list-group-item-danger'>${id}</li>`)
        .join('')
    );

    $('#fora-rota-list').html(
      `<h6>Fora de Rota (<span class='badge badge-warning'>${this.foraDeRota.size}</span>)</h6>` +
      Array.from(this.foraDeRota)
        .map(id => `<li class='list-group-item list-group-item-warning'>${id}</li>`)
        .join('')
    );

    // nova lista de duplicatas
    $('#duplicados-list').html(
      `<h6>Duplicados (<span class='badge badge-secondary'>${this.duplicados.size}</span>)</h6>` +
      Array.from(this.duplicados.entries())
        .map(([id, count]) => `<li class='list-group-item list-group-item-secondary'>${id} <span class="badge badge-dark ml-2">${count}x</span></li>`)
        .join('')
    );

    $('#verified-total').text(this.conferidos.size);
    this.atualizarProgresso();
  },
normalizarCodigo(raw) {
  if (!raw) return null;

  // Remove espaços e caracteres invisíveis / de controle
  let s = String(raw)
    .trim()
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // controles ASCII

  // Alguns leitores “escapam” controles como ^...^, então tentamos extrair o ID numérico
  // Seu padrão atual já procura (4\d{10}) em CSV; vamos reutilizar a mesma lógica aqui.
  let m = s.match(/(4\d{10})/);
  if (m) return m[1];

  // Fallback: pega qualquer sequência de 11+ dígitos e usa os 11 primeiros
  // (se você quiser mais rígido, remova este fallback)
  m = s.replace(/\D/g, '').match(/(\d{11,})/);
  if (m) return m[1].slice(0, 11);

  return null;
},

conferirId(codigo) {
  if (!codigo) return;

  const dataHora = Date.now();

  // ✅ Tratativa de DUPLICATAS
  if (this.conferidos.has(codigo) || this.foraDeRota.has(codigo)) {
    const count = this.duplicados.get(codigo) || 1;
    this.duplicados.set(codigo, count + 1);
    this.timestamps.set(codigo, dataHora);

    // 🔊 toca som de duplicata, igual ao fora de rota
    if (!this.viaCsv) {
      try {
        const audio = new Audio('mixkit-alarm-tone-996-_1_.mp3');
        audio.play().catch(() => {});
      } catch {}
    }

    $('#barcode-input').val('').focus();
    this.atualizarListas();
    return;
  }

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

  $('#barcode-input').val('').focus();
  this.atualizarListas();
},

  gerarCsvText() {
    const all = [...this.conferidos, ...this.foraDeRota, ...this.duplicados.keys()];
    if (all.length === 0) {
      alert('Nenhum ID para exportar.');
      return;
    }

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

    const zona = 'Horário Padrão de Brasília';
    const header = 'date,time,time_zone,format,text,notes,favorite,date_utc,time_utc,metadata,duplicates';

    const linhas = all.map(id => {
      const lidaEm = parseDateSafe(this.timestamps.get(id));
      const pad2 = n => String(n).padStart(2,'0');
      const date = `${lidaEm.getFullYear()}-${pad2(lidaEm.getMonth()+1)}-${pad2(lidaEm.getDate())}`;
      const time = `${pad2(lidaEm.getHours())}:${pad2(lidaEm.getMinutes())}:${pad2(lidaEm.getSeconds())}`;

      const dateUtc = lidaEm.toISOString().slice(0, 10);
      const timeUtc = lidaEm.toISOString().split('T')[1].split('.')[0];
      const dupCount = this.duplicados.get(id) ? this.duplicados.get(id) - 1 : 0;

      return `${date},${time},${zona},Code 128,${id},,0,${dateUtc},${timeUtc},,${dupCount}`;
    });

    const conteudo = [header, ...linhas].join('\r\n');
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

    const cluster = this.cluster || 'semCluster';
    const rota = this.routeId || 'semRota';
    link.download = `${cluster}_${rota}_padrao.csv`;
    link.click();
  },

  finalizar() {
    this.gerarCsvText();
    $('#reportModal').modal('show');
  },

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

    addSec('Conferidos:', [0, 128, 0], this.conferidos);
    addSec('Faltantes:', [255, 0, 0], this.ids);
    addSec('Fora de Rota:', [255, 165, 0], this.foraDeRota);
    addSec('Duplicados:', [100, 100, 100], new Map(Array.from(this.duplicados.keys()).map(id => [id, null])));

    doc.save('relatorio.pdf');
  }
};

// ================== EVENTOS ==================

$('#manual-btn').click(() => {
  $('#initial-interface').addClass('d-none');
  $('#manual-interface').removeClass('d-none');
});

$('#submit-manual').click(() => {
  try {
    let manualIds = $('#manual-input').val().split(/[\s,]+/).map(id => id.trim());
    manualIds.forEach(id => {
      if (id) ConferenciaApp.ids.add(id);
    });

    if (ConferenciaApp.ids.size === 0) {
      alert('Nenhum ID válido inserido.');
      return;
    }

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

  // === resto do seu código permanece igual ===

  const routeMatch = /"routeId":(\d+)/.exec(html);
  if (routeMatch) {
    ConferenciaApp.routeId = routeMatch[1];
    $('#route-title').text(`Conferência da rota: ${ConferenciaApp.routeId}`);
  }

  const regexFacility = /"destinationFacilityId":"([^"]+)","name":"([^"]+)"/;
  const facMatch = regexFacility.exec(html);
  if (facMatch) {
    ConferenciaApp.destinationFacilityId = facMatch[1];
    ConferenciaApp.destinationFacilityName = facMatch[2];
    $('#destination-facility-title').html(`<strong>XPT:</strong> ${facMatch[1]}`);
    $('#destination-facility-name').html(`<strong>DESTINO:</strong> ${facMatch[2]}`);
  }

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

    const raw = $('#barcode-input').val();
    const id = ConferenciaApp.normalizarCodigo(raw);

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
  const fileInput = document.getElementById('csv-input');
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
    if (!linhas.length) {
      ConferenciaApp.alertar('Arquivo CSV vazio.');
      return;
    }

    const header = linhas[0].split(',');
    const textCol = header.findIndex(h => /(text|texto|id)/i.test(h));
    if (textCol === -1) {
      ConferenciaApp.alertar('Coluna apropriada não encontrada (text/texto/id).');
      return;
    }

    for (let i = 1; i < linhas.length; i++) {
      if (!linhas[i].trim()) continue;
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

$('#finish-btn').click(() => ConferenciaApp.finalizar());
$('#back-btn').click(() => location.reload());
$('#export-txt').click(() => ConferenciaApp.gerarRelatorioTxt());
$('#export-pdf').click(() => ConferenciaApp.gerarRelatorioPdf());
