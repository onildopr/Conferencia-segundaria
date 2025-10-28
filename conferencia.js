const { jsPDF } = window.jspdf;

window.addEventListener('error', (e) => {
  console.error('JS ERROR:', e.message, e.filename, e.lineno, e.colno);
});


const ConferenciaApp = {
  timestamps: new Map(), // ID => data/hora conferido
  ids: new Set(),
  conferidos: new Set(),
  faltantes: new Set(),
  foraDeRota: new Set(),
  totalConferidos: 0,
  routeId: '',
  startTime: null,
  viaCsv: false, // flag para controlar conferência via CSV
  /**
   * Contagem de IDs que foram lidos mais de uma vez.
   * Essas informações s o  teis para detectar se o scanner
   * leu um c digo mais de uma vez devido a um erro.
   * @type {Map<string,number>}
   */
  duplicados: new Map(), // ID => contagem de repeti es além da 1ª leitura

  /**
   * Registra um c digo como duplicado.
   * @param {string} codigo
   */
  registrarDuplicado(codigo) {
    const atual = this.duplicados.get(codigo) || 0;
    this.duplicados.set(codigo, atual + 1);
  },
  /**
   * Toca um alerta de som.
   * @param {boolean} viaCsv - Flag para indicar se a confer ncia est  sendo feita via CSV.
   */
  tocarAlerta(viaCsv = false) {
    if (!viaCsv) {
      try {
        // Cria um objeto de  udio com o som de alerta
        const audio = new Audio('mixkit-alarm-tone-996-_1_.mp3');
        // Toca o som de alerta
        audio.play();
      } catch (e) {
        // Silencia erro de autoplay em alguns navegadores
      }
    }
  },


  alertar(mensagem) {
    alert(mensagem);
  },

  atualizarProgresso() {
    const total = this.ids.size + this.conferidos.size;
    const percentual = total ? (this.conferidos.size / total) * 100 : 0;
    $('#progress-bar').css('width', percentual + '%').text(Math.floor(percentual) + '%');
  },

atualizarListas() {
  // Conferidos
  $('#conferidos-list').html(
    `<h6>Conferidos (<span class='badge badge-success'>${this.conferidos.size}</span>)</h6>` +
    Array.from(this.conferidos)
      .map(id => `<li class='list-group-item list-group-item-success'>${id}</li>`)
      .join('')
  );

  // Faltantes (restantes a conferir)
  $('#faltantes-list').html(
    `<h6>Faltantes (<span class='badge badge-danger'>${this.ids.size}</span>)</h6>` +
    Array.from(this.ids)
      .map(id => `<li class='list-group-item list-group-item-danger'>${id}</li>`)
      .join('')
  );

  // Fora de rota
  $('#fora-rota-list').html(
    `<h6>Fora de Rota (<span class='badge badge-warning'>${this.foraDeRota.size}</span>)</h6>` +
    Array.from(this.foraDeRota)
      .map(id => `<li class='list-group-item list-group-item-warning'>${id}</li>`)
      .join('')
  );

  // 🔶 Duplicados (laranja)
  const totalDuplicadosUnicos = this.duplicados.size;
  const duplicadosHTML = Array.from(this.duplicados.entries())
    .map(([id, rep]) => {
      // rep = número de repetições ALÉM da 1ª leitura
      // se rep === 1 → mostra só o ID
      // se rep > 1 → mostra ID X"rep"
      const sufixo = rep > 1 ? ` X"${rep}"` : '';
      return `<li class='list-group-item list-group-item-warning'>${id}${sufixo}</li>`;
    })
    .join('');
  $('#duplicados-list').html(
    `<h6>Duplicados (<span class='badge badge-warning'>${totalDuplicadosUnicos}</span>)</h6>` + duplicadosHTML
  );

  $('#verified-total').text(this.conferidos.size);
  this.atualizarProgresso();
},


conferirId(codigo) {
  // ANTES: const agora = new Date().toLocaleString();
  const agora = new Date().toISOString(); // ✅ ISO seguro para parse

  // Já foi conferido antes? Conta como duplicado.
  if (this.conferidos.has(codigo)) {
    this.registrarDuplicado(codigo);
    this.timestamps.set(codigo, agora);
    this.tocarAlerta(); // 🔊 alerta para duplicado
    $('#barcode-input').val('').focus();
    this.atualizarListas();
    return;
  }

  // Já foi classificado como fora de rota antes? Também conta como duplicado.
  if (this.foraDeRota.has(codigo)) {
    this.registrarDuplicado(codigo);
    this.timestamps.set(codigo, agora);
    this.tocarAlerta(); // 🔊 alerta para duplicado
    $('#barcode-input').val('').focus();
    this.atualizarListas();
    return;
  }

  // Primeira vez que vemos este código:
  if (this.ids.has(codigo)) {
    // Está na lista esperada → marcar como conferido
    this.ids.delete(codigo);
    this.conferidos.add(codigo);
    this.timestamps.set(codigo, agora);
  } else {
    // Não está na lista → fora de rota
    this.foraDeRota.add(codigo);
    this.timestamps.set(codigo, agora);

    // 🔊 Toca som apenas se a leitura não veio do CSV
    if (!this.viaCsv) {
      const audio = new Audio('mixkit-alarm-tone-996-_1_.mp3');
      audio.play();
    }
  }

  $('#barcode-input').val('').focus();
  this.atualizarListas();
},



  // Nova função: gera CSV com coluna TEXT para conferidos e fora de rota
// Gera CSV só com IDs numéricos, sem header extra, e CRLF
gerarCsvText() {
  const all = [...this.conferidos, ...this.foraDeRota];
  if (all.length === 0) {
    alert('Nenhum ID para exportar.');
    return;
  }

  // helper para parsear qualquer coisa que já esteja salva nos timestamps
  const parseDateSafe = (value) => {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
      // ISO?
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d;
      }
      // tenta converter "dd/mm/aaaa hh:mm:ss" → ISO
      const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (m) {
        const [ , dd, mm, yyyy, HH, MM, SS = '00' ] = m;
        const iso = `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}`;
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return d;
      }
      // último recurso
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const zona = 'Horário Padrão de Brasília';
  const header = 'date,time,time_zone,format,text,notes,favorite,date_utc,time_utc,metadata';

  const linhas = all.map(id => {
    const lidaEm = parseDateSafe(this.timestamps.get(id));
    const date = lidaEm.toISOString().slice(0, 10);              // 2025-10-27
    const time = lidaEm.toTimeString().split(' ')[0];            // 16:22:33
    const dateUtc = lidaEm.toISOString().slice(0, 10);           // 2025-10-27
    const timeUtc = lidaEm.toISOString().split('T')[1].split('.')[0]; // 20:22:33

    // estrutura EXATA do seu modelo:
    return `${date},${time},${zona},Code 128,${id},,0,${dateUtc},${timeUtc},`;
  });

  const conteudo = [header, ...linhas].join('\r\n'); // CRLF

  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);

  const cluster = this.cluster || 'semCluster';
  const rota = this.routeId || 'semRota';
  link.download = `${cluster}_${rota}_padrao.csv`;

  link.click();
},

  finalizar() {
    // gera o CSV ao finalizar a conferência
    this.gerarCsvText();
    $('#reportModal').modal('show');
  },

  gerarRelatorioTxt() {
    let conteudo = '';
    if (this.conferidos.size) {
      conteudo += 'CONFERIDOS:\n' + Array.from(this.conferidos).join('\n') + '\n\n';
    }
    if (this.ids.size) {
      conteudo += 'FALTANTES:\n' + Array.from(this.ids).join('\n') + '\n\n';
    }
    if (this.foraDeRota.size) {
      conteudo += 'FORA DE ROTA:\n' + Array.from(this.foraDeRota).join('\n') + '\n';
    }
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
  },
};

// Botão de adicionar IDs manualmente
$('#manual-btn').click(() => {
  $('#initial-interface').addClass('d-none');
  $('#manual-interface').removeClass('d-none');
});

// Submissão de IDs manuais
$('#submit-ids').click(function () {
  try {
    let manualIds = $('#manual-ids')
      .val()
      .split(/[\s,]+/)
      .map(id => id.trim());
    manualIds.forEach(id => {
      if (id) idsSet.add(id);
    });

    const idsArray = Array.from(idsSet);
    if (idsArray.length === 0) {
      alert('Nenhum ID válido inserido.');
      return;
    }

    let resultadoHTML = "";
    idsArray.forEach(id => {
      resultadoHTML += `<li id="id-${id}" class="list-group-item">${id} <span class="badge badge-secondary">Pendente</span></li>`;
    });

    $('#results').html(resultadoHTML);
    $('#total-extracted').text(idsArray.length);
    $('#manual-interface').addClass('d-none');
    $('#new-interface').removeClass('d-none');
  } catch (error) {
    alert('Ocorreu um erro ao processar os dados. Tente novamente.');
    console.error(error);
  }
});

// Extração de IDs via HTML
$('#extract-btn').click(() => {
  let html = $('#html-input').val();
  html = html.replace(/<[^>]+>/g, ' ');
  if (!html.includes('4')) {
    ConferenciaApp.alertar('Nenhum ID começando com 4 encontrado.');
    return;
  }
  ConferenciaApp.ids.clear();
  const idsEncontrados = [...html.matchAll(/"id":"(4\d{10})"/g)].map(m => m[1]);
  const regexRoute = /"routeId":(\d+)/;
  const routeMatch = regexRoute.exec(html);
  if (routeMatch) {
    ConferenciaApp.routeId = routeMatch[1];
    $('#route-title').text(`Conferência da rota: ${ConferenciaApp.routeId}`);
  }
  if (idsEncontrados.length === 0) {
    ConferenciaApp.alertar('Nenhum ID válido encontrado.');
    return;
  }
  const regexFacility = /"destinationFacilityId":"([^"]+)","name":"([^"]+)"/;
  const facMatch = regexFacility.exec(html);

  if (!facMatch) {
  ConferenciaApp.alertar('Nenhuma facility encontrada.');
  } 
  else {
  const destId   = facMatch[1];    // ex: “ETO2”
  const facName  = facMatch[2];    // ex: “Araguaína”
  ConferenciaApp.destinationFacilityId   = destId;
  ConferenciaApp.destinationFacilityName = facName;

  // exiba onde quiser (certifique-se de criar estes elementos no HTML):
  $('#destination-facility-title').html(`<strong>XPT:</strong> ${destId}`);
  $('#destination-facility-name').html(`<strong>DESTINO:</strong> ${facName}`);
}
  idsEncontrados.forEach(id => ConferenciaApp.ids.add(id));
  $('#route-title').html(`ROTA: <strong>${ConferenciaApp.routeId}</strong><br> CONFERENCIA DE ID's`);
  $('#extracted-total').text(ConferenciaApp.ids.size);
  $('#initial-interface').addClass('d-none');
  $('#conference-interface').removeClass('d-none');
  ConferenciaApp.atualizarListas();
  // depois de fazer html = html.replace(/<[^>]+>/g, ' ')
  const regexCluster = /"cluster":"([^"]+)"/g;
  const clusters = [...html.matchAll(regexCluster)].map(m => m[1]);

  if (clusters.length === 0) {
    ConferenciaApp.alertar('Nenhum cluster encontrado.');
  } else {
  // Se você só espera um cluster:
  const cluster = clusters[0];
  console.log('Cluster extraído:', cluster);
  // Ou guarde em alguma propriedade:
  ConferenciaApp.cluster = cluster;
  $('#cluster-title').html(`
  <span style="font-size:1.0em;">
    CLUSTER:
  </span style="font-size:1.0em">
  <strong style="font-size:1.0em;">
    ${cluster}
  </strong>
`);
  }

});

// Submissão de IDs manuais na nova interface
$('#submit-manual').click(() => {
  const idsManuais = $('#manual-input')
    .val()
    .split(/\s|,+/)
    .filter(id => /^4\d{10}$/.test(id.trim()));
  idsManuais.forEach(id => ConferenciaApp.ids.add(id));
  if (!ConferenciaApp.ids.size) {
    ConferenciaApp.alertar('Nenhum ID válido inserido.');
    return;
  }
  $('#manual-interface').addClass('d-none');
  $('#conference-interface').removeClass('d-none');
  $('#route-title').text('IDs Manuais');
  $('#extracted-total').text(ConferenciaApp.ids.size);
  ConferenciaApp.atualizarListas();
});

// Entrada de código de barras manual
$('#barcode-input').keypress(e => {
  if (e.which === 13) {
    ConferenciaApp.viaCsv = false; // garantir que não é CSV
    ConferenciaApp.conferirId($('#barcode-input').val().trim());
  }
});

// Processamento de CSV
$('#check-csv').click(() => {
  const fileInput = document.getElementById('csv-input');
  if (fileInput.files.length === 0) {
    ConferenciaApp.alertar('Selecione um arquivo CSV.');
    return;
  }

  ConferenciaApp.viaCsv = true; // sinalizar conferência via CSV

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
    const textCol = header.findIndex(h => h.toLowerCase().includes('text'));
    if (textCol === -1) {
      ConferenciaApp.alertar('Coluna "text" não encontrada no CSV.');
      return;
    }
    for (let i = 1; i < linhas.length; i++) {
      const colunas = linhas[i].split(',');
      if (colunas.length <= textCol) continue;
      let campo = colunas[textCol]
        .trim()
        .replace(/^"|"$/g, '')
        .replace(/""/g, '"');
      const match = campo.match(/(4\d{10})/);
      if (match) {
        ConferenciaApp.conferirId(match[1]);
      }
    }
    ConferenciaApp.atualizarListas();
    ConferenciaApp.viaCsv = false; // resetar flag CSV
  };
  reader.readAsText(file, 'UTF-8');
});

// Botões finais de relatório e navegação
$('#finish-btn').click(() => ConferenciaApp.finalizar());
$('#back-btn').click(() => location.reload());
$('#export-txt').click(() => ConferenciaApp.gerarRelatorioTxt());
$('#export-csv').click(() => ConferenciaApp.gerarRelatorioCsv());
$('#export-pdf').click(() => ConferenciaApp.gerarRelatorioPdf());
