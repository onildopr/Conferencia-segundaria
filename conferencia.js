const { jsPDF } = window.jspdf;

// ================== ACESSO ==================
// SHA-256 da senha master. Não é pedida de novo só se a página não recarregar:
// nada é guardado em storage, então todo carregamento/F5 volta para a tela de senha.
const SENHA_HASH = '1f8e6f11b81913d2e76ce93aedee3bc9d53dab0ff80a29556ab027834b9aad84';

async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

$('#gate-form').on('submit', async e => {
  e.preventDefault();
  const senha = $('#gate-input').val();
  let ok = false;
  try {
    ok = (await sha256Hex(senha)) === SENHA_HASH;
  } catch (err) {
    console.error(err);
    alert('Este navegador não permite validar a senha. Abra a página por https.');
    return;
  }

  if (!ok) {
    $('#gate-erro').removeClass('d-none');
    $('#gate-input').val('').focus();
    return;
  }

  $('#gate').remove();
  $('#html').removeClass('d-none');
  $('#html-input').focus();
});

// Escapa texto antes de inserir via .html()
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// Divide uma linha CSV respeitando campos entre aspas
function parseCsvLinha(linha) {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') {
      aspas = true;
    } else if (c === ',') {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

const ConferenciaApp = {
  timestamps: new Map(),
  ids: new Set(),
  conferidos: new Set(),
  faltantes: new Set(),
  foraDeRota: new Set(),
  duplicados: new Map(), // id -> total de leituras
  totalInicial: 0,
  routeId: '',
  cluster: '',
  viaCsv: false,
  saindo: false,

  alertar(msg) {
    alert(msg);
  },

  temDados() {
    return this.conferidos.size > 0 || this.foraDeRota.size > 0;
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
        .map(id => `<li class='list-group-item list-group-item-success'>${esc(id)}</li>`)
        .join('')
    );

    $('#faltantes-list').html(
      `<h6>Faltantes (<span class='badge badge-danger'>${this.ids.size}</span>)</h6>` +
      Array.from(this.ids)
        .map(id => `<li class='list-group-item list-group-item-danger'>${esc(id)}</li>`)
        .join('')
    );

    $('#fora-rota-list').html(
      `<h6>Fora de Rota (<span class='badge badge-warning'>${this.foraDeRota.size}</span>)</h6>` +
      Array.from(this.foraDeRota)
        .map(id => `<li class='list-group-item list-group-item-warning'>${esc(id)}</li>`)
        .join('')
    );

    $('#duplicados-list').html(
      `<h6>Duplicados (<span class='badge badge-secondary'>${this.duplicados.size}</span>)</h6>` +
      Array.from(this.duplicados.entries())
        .map(([id, count]) => `<li class='list-group-item list-group-item-secondary'>${esc(id)} <span class="badge badge-dark ml-2">${count}x</span></li>`)
        .join('')
    );

    $('#verified-total').text(this.conferidos.size);
    this.atualizarProgresso();
  },

  normalizarCodigo(raw) {
    if (!raw) return null;

    // Remove espaços e caracteres invisíveis / de controle
    const s = String(raw)
      .trim()
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    // Preferência: ID isolado (não colado em outros dígitos)
    let m = s.match(/(?<!\d)(4\d{10})(?!\d)/);
    if (m) return m[1];

    // Leitores que "escapam" controles ou colam prefixos: aceita o 4XXXXXXXXXX mesmo dentro de outros dígitos
    m = s.match(/(4\d{10})/);
    if (m) return m[1];

    return null;
  },

  sinalizarInvalido() {
    const $in = $('#barcode-input');
    $in.addClass('bg-danger-flash');
    setTimeout(() => $in.removeClass('bg-danger-flash'), 600);
  },

  conferirId(codigo) {
    if (!codigo) return;

    const dataHora = Date.now();

    // Duplicata: mantém o horário da primeira leitura
    if (this.conferidos.has(codigo) || this.foraDeRota.has(codigo)) {
      const count = this.duplicados.get(codigo) || 1;
      this.duplicados.set(codigo, count + 1);

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

  nomeBase() {
    return `${this.cluster || 'semCluster'}_${this.routeId || 'semRota'}`;
  },

  baixar(conteudo, tipo, nome) {
    const blob = new Blob([conteudo], { type: tipo });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nome;
    link.click();
  },

  gerarCsvText() {
    // Duplicados já estão em conferidos/fora de rota; a contagem vai na coluna "duplicates"
    const all = [...this.conferidos, ...this.foraDeRota];
    if (all.length === 0) {
      alert('Nenhum ID para exportar.');
      return;
    }

    const zona = 'Horário Padrão de Brasília';
    const header = 'date,time,time_zone,format,text,notes,favorite,date_utc,time_utc,metadata,duplicates';
    const pad2 = n => String(n).padStart(2, '0');

    const linhas = all.map(id => {
      const lidaEm = new Date(this.timestamps.get(id) || Date.now());
      const date = `${lidaEm.getFullYear()}-${pad2(lidaEm.getMonth() + 1)}-${pad2(lidaEm.getDate())}`;
      const time = `${pad2(lidaEm.getHours())}:${pad2(lidaEm.getMinutes())}:${pad2(lidaEm.getSeconds())}`;

      const iso = lidaEm.toISOString();
      const dateUtc = iso.slice(0, 10);
      const timeUtc = iso.slice(11, 19);
      const dupCount = this.duplicados.has(id) ? this.duplicados.get(id) - 1 : 0;

      return `${date},${time},${zona},Code 128,${id},,0,${dateUtc},${timeUtc},,${dupCount}`;
    });

    this.baixar([header, ...linhas].join('\r\n'), 'text/csv;charset=utf-8;', `${this.nomeBase()}_padrao.csv`);
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

    this.baixar(conteudo, 'text/plain;charset=utf-8;', `${this.nomeBase()}_relatorio.txt`);
  },

  gerarRelatorioPdf() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 10;
    const margemInferior = 280;
    doc.setFontSize(16);
    doc.text('Relatório de Conferência de Rota', 10, y);
    y += 8;
    doc.setFontSize(10);
    const cabecalho = [
      this.routeId && `Rota: ${this.routeId}`,
      this.cluster && `Cluster: ${this.cluster}`,
      this.destinationFacilityName && `Destino: ${this.destinationFacilityName}`
    ].filter(Boolean).join('   ');
    if (cabecalho) {
      doc.text(cabecalho, 10, y);
      y += 8;
    }

    // dados: qualquer iterável de textos (Set ou Array)
    const addSec = (titulo, cor, dados) => {
      const lista = Array.from(dados);
      if (!lista.length) return;

      doc.setTextColor(...cor);
      doc.text(`${titulo} (${lista.length})`, 10, y);
      y += 6;
      lista.forEach(item => {
        if (y > margemInferior) {
          doc.addPage();
          y = 10;
          doc.setFontSize(10);
          doc.setTextColor(...cor);
          doc.text(titulo + ' (continuação)', 10, y);
          y += 6;
        }
        doc.text(String(item), 10, y);
        y += 6;
      });
      y += 4;
    };

    addSec('Conferidos', [0, 128, 0], this.conferidos);
    addSec('Faltantes', [255, 0, 0], this.ids);
    addSec('Fora de Rota', [255, 165, 0], this.foraDeRota);
    addSec('Duplicados', [100, 100, 100],
      Array.from(this.duplicados.entries()).map(([id, c]) => `${id} (${c}x)`));

    doc.save(`${this.nomeBase()}_relatorio.pdf`);
  }
};

// ================== EVENTOS ==================

function abrirConferencia() {
  $('#extracted-total').text(ConferenciaApp.ids.size);
  $('#initial-interface').addClass('d-none');
  $('#manual-interface').addClass('d-none');
  $('#conference-interface').removeClass('d-none');
  ConferenciaApp.atualizarListas();
  $('#barcode-input').focus();
}

$('#manual-btn').click(() => {
  $('#initial-interface').addClass('d-none');
  $('#manual-interface').removeClass('d-none');
});

$('#submit-manual').click(() => {
  try {
    const brutos = $('#manual-input').val().split(/[\s,;]+/).filter(Boolean);
    const invalidos = [];

    ConferenciaApp.ids.clear();
    brutos.forEach(bruto => {
      const id = ConferenciaApp.normalizarCodigo(bruto);
      if (id) ConferenciaApp.ids.add(id);
      else invalidos.push(bruto);
    });

    if (ConferenciaApp.ids.size === 0) {
      alert('Nenhum ID válido inserido (esperado: 11 dígitos começando com 4).');
      return;
    }
    if (invalidos.length) {
      alert(`${invalidos.length} valor(es) ignorado(s) por não serem IDs válidos:\n${invalidos.slice(0, 20).join('\n')}`);
    }

    ConferenciaApp.totalInicial = ConferenciaApp.ids.size;
    $('#route-title').html('ROTA: <strong>manual</strong>');
    abrirConferencia();
  } catch (error) {
    alert('Erro ao processar IDs manuais.');
    console.error(error);
  }
});

$('#extract-btn').click(() => {
  const html = $('#html-input').val().replace(/<[^>]+>/g, ' ');
  ConferenciaApp.ids.clear();

  // Cada envio vai do seu "id" até o próximo "id" de envio; o receiver_id só é
  // procurado dentro desse trecho, para não "emprestar" o do envio seguinte.
  const envios = [...html.matchAll(/"id":(4\d{10})(?!\d)/g)];
  envios.forEach((m, i) => {
    const fim = i + 1 < envios.length ? envios[i + 1].index : html.length;
    const trecho = html.slice(m.index, fim);
    const receiver = /"receiver_id":"([^"]+)"/.exec(trecho);

    // Place tem receiver_id com "_"; sem receiver_id, mantém o envio
    if (receiver && receiver[1].includes('_')) return;
    ConferenciaApp.ids.add(m[1]);
  });

  if (ConferenciaApp.ids.size === 0) {
    alert('Nenhum ID de pacote encontrado no HTML colado. Confira se copiou a página inteira.');
    return;
  }

  const routeMatch = /"routeId":(\d+)/.exec(html);
  ConferenciaApp.routeId = routeMatch ? routeMatch[1] : '';
  $('#route-title').html(`ROTA: <strong>${esc(ConferenciaApp.routeId || 'não identificada')}</strong>`);

  const facMatch = /"destinationFacilityId":"([^"]+)","name":"([^"]+)"/.exec(html);
  if (facMatch) {
    ConferenciaApp.destinationFacilityId = facMatch[1];
    ConferenciaApp.destinationFacilityName = facMatch[2];
    $('#destination-facility-title').html(`<strong>XPT:</strong> ${esc(facMatch[1])}`);
    $('#destination-facility-name').html(`<strong>DESTINO:</strong> ${esc(facMatch[2])}`);
  }

  const clusterMatch = /"cluster":"([^"]+)"/.exec(html);
  if (clusterMatch) {
    ConferenciaApp.cluster = clusterMatch[1];
    $('#cluster-title').html(`CLUSTER: <strong>${esc(clusterMatch[1])}</strong>`);
  }

  ConferenciaApp.totalInicial = ConferenciaApp.ids.size;
  abrirConferencia();
});


$('#barcode-input').keypress(e => {
  if (e.which === 13) {
    ConferenciaApp.viaCsv = false;

    const raw = $('#barcode-input').val();
    const id = ConferenciaApp.normalizarCodigo(raw);

    if (!id) {
      $('#barcode-input').val('').focus();
      if (raw.trim()) ConferenciaApp.sinalizarInvalido();
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

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = e => {
    const linhas = e.target.result.replace(/^﻿/, '').split(/\r?\n/);
    if (!linhas[0] || !linhas[0].trim()) {
      ConferenciaApp.alertar('Arquivo CSV vazio.');
      return;
    }

    const header = parseCsvLinha(linhas[0]).map(h => h.trim().toLowerCase());
    // Coluna exata primeiro; depois qualquer uma que contenha o nome
    let textCol = header.findIndex(h => ['text', 'texto', 'id'].includes(h));
    if (textCol === -1) textCol = header.findIndex(h => /(text|texto|\bid\b)/i.test(h));
    if (textCol === -1) {
      ConferenciaApp.alertar('Coluna apropriada não encontrada (text/texto/id).');
      return;
    }

    ConferenciaApp.viaCsv = true;
    let lidos = 0;
    let ignorados = 0;
    for (let i = 1; i < linhas.length; i++) {
      if (!linhas[i].trim()) continue;
      const colunas = parseCsvLinha(linhas[i]);
      const id = colunas.length > textCol ? ConferenciaApp.normalizarCodigo(colunas[textCol]) : null;
      if (id) {
        ConferenciaApp.conferirId(id);
        lidos++;
      } else {
        ignorados++;
      }
    }
    ConferenciaApp.viaCsv = false;

    if (ignorados) ConferenciaApp.alertar(`CSV processado: ${lidos} leitura(s), ${ignorados} linha(s) sem ID válido.`);
    $('#barcode-input').focus();
  };
  reader.readAsText(file, 'UTF-8');
});

$('#finish-btn').click(() => ConferenciaApp.finalizar());
$('#back-btn').click(() => {
  if (ConferenciaApp.temDados() &&
      !confirm('Voltar apaga a conferência atual. Deseja continuar?')) return;
  ConferenciaApp.saindo = true;
  location.reload();
});
$('#export-txt').click(() => ConferenciaApp.gerarRelatorioTxt());
$('#export-pdf').click(() => ConferenciaApp.gerarRelatorioPdf());

// Avisa antes de fechar/atualizar a aba com conferência em andamento
window.addEventListener('beforeunload', e => {
  if (ConferenciaApp.saindo || !ConferenciaApp.temDados()) return;
  e.preventDefault();
  e.returnValue = '';
});
