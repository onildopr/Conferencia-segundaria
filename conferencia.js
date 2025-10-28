const { jsPDF } = window.jspdf;

const ConferenciaApp = {
  timestamps: new Map(),
  ids: new Set(),
  conferidos: new Set(),
  faltantes: new Set(),
  foraDeRota: new Set(),
  totalConferidos: 0,
  routeId: '',
  startTime: null,
  viaCsv: false,
  cluster: '',

  alertar(mensagem) {
    alert(mensagem);
  },

  atualizarProgresso() {
    const total = this.ids.size + this.conferidos.size + this.foraDeRota.size;
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
    $('#verified-total').text(this.conferidos.size);
    this.atualizarProgresso();
  },

  conferirId(codigo) {
    if (this.conferidos.has(codigo) || this.foraDeRota.has(codigo)) return;

    const dataHora = new Date().toLocaleString();

    if (this.ids.has(codigo)) {
      this.ids.delete(codigo);
      this.conferidos.add(codigo);
      this.timestamps.set(codigo, dataHora);
    } else {
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
    const all = [...this.conferidos, ...this.foraDeRota];
    const valid = all.filter(id => /^\d+$/.test(id.trim()));

    if (valid.length === 0) {
      alert('Não há IDs numéricos para exportar.');
      return;
    }

    const lines = [
      'DATA/HORA,ID',
      ...valid.map(id => {
        const dataHora = this.timestamps.get(id) || '';
        return `"${dataHora}","${id}"`;
      })
    ];

    const conteudo = lines.join('\r\n');

    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

    const cluster = this.cluster || 'semCluster';
    const rota = this.routeId || 'semRota';
    link.download = `${cluster}_${rota}.csv`;
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
    if (this.foraDeRota.size) conteudo += 'FORA DE ROTA:\n' + Array.from(this.foraDeRota).join('\n');

    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'relatorio.txt';
    link.click();
  },

  gerarRelatorioCsv() {
    let conteudo = 'Categoria,ID\n';
    this.conferidos.forEach(id => (conteudo += `Conferido,${id}\n`));
    this.ids.forEach(id => (conteudo += `Faltante,${id}\n`));
    this.foraDeRota.forEach(id => (conteudo += `Fora de Rota,${id}\n`));
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'relatorio.csv';
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

    const adicionarTexto = (titulo, cor, dados) => {
      if (dados.size > 0) {
        doc.setTextColor(...cor);
        doc.text(titulo, 10, y);
        y += 6;
        dados.forEach(id => {
          if (y > margemInferior) {
            doc.addPage('a4', 'portrait');
            y = 10;
            doc.setFontSize(10);
            doc.setTextColor(...cor);
            doc.text(titulo + ' (continuação)', 10, y);
            y += 6;
          }
          doc.text(id, 10, y);
          y += 6;
        });
        y += 4;
      }
    };

    adicionarTexto('Conferidos:', [0, 128, 0], this.conferidos);
    adicionarTexto('Faltantes:', [255, 0, 0], this.ids);
    adicionarTexto('Fora de Rota:', [255, 165, 0], this.foraDeRota);

    doc.save('relatorio.pdf');
  }
};

$('#manual-btn').click(() => {
  $('#initial-interface').addClass('d-none');
  $('#manual-interface').removeClass('d-none');
});

$('#submit-manual').click(() => {
  try {
    let manualIds = $('#manual-input')
      .val()
      .split(/[\s,]+/)
      .map(id => id.trim());
    manualIds.forEach(id => {
      if (id) ConferenciaApp.ids.add(id);
    });

    if (ConferenciaApp.ids.size === 0) {
      alert('Nenhum ID válido inserido.');
      return;
    }

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
  let html = $('#html-input').val();
  html = html.replace(/<[^>]+>/g, ' ');

  ConferenciaApp.ids.clear();
  const idsEncontrados = [...html.matchAll(/"id":(4\d{10})/g)].map(m => m[1]);
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

  idsEncontrados.forEach(id => ConferenciaApp.ids.add(id));
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
    ConferenciaApp.conferirId($('#barcode-input').val().trim());
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

  reader.onload = function(e) {
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
      const colunas = linhas[i].split(',');
      if (colunas.length <= textCol) continue;
      let campo = colunas[textCol].trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      const match = campo.match(/(4\d{10})/);
      if (match) {
        ConferenciaApp.conferirId(match[1]);
      }
    }
    ConferenciaApp.atualizarListas();
    ConferenciaApp.viaCsv = false;
  };
  reader.readAsText(file, 'UTF-8');
});

$('#finish-btn').click(() => ConferenciaApp.finalizar());
$('#back-btn').click(() => location.reload());
$('#export-txt').click(() => ConferenciaApp.gerarRelatorioTxt());
$('#export-csv').click(() => ConferenciaApp.gerarRelatorioCsv());
$('#export-pdf').click(() => ConferenciaApp.gerarRelatorioPdf());
