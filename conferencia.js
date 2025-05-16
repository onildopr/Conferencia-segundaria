const { jsPDF } = window.jspdf;

const ConferenciaApp = {
  ids: new Set(),
  conferidos: new Set(),
  faltantes: new Set(),
  foraDeRota: new Set(),
  totalConferidos: 0,
  routeId: '',
  startTime: null,

  alertar(mensagem) {
    alert(mensagem);
  },

  atualizarProgresso() {
    const total = this.ids.size + this.conferidos.size;
    const percentual = total ? (this.conferidos.size / total) * 100 : 0;
    $('#progress-bar').css('width', percentual + '%').text(Math.floor(percentual) + '%');
  },

  atualizarListas() {
    $('#conferidos-list').html(`<h6>Conferidos (<span class='badge badge-success'>${this.conferidos.size}</span>)</h6>` + Array.from(this.conferidos).map(id => `<li class='list-group-item list-group-item-success'>${id}</li>`).join(''));
    $('#faltantes-list').html(`<h6>Faltantes (<span class='badge badge-danger'>${this.ids.size}</span>)</h6>` + Array.from(this.ids).map(id => `<li class='list-group-item list-group-item-danger'>${id}</li>`).join(''));
    $('#fora-rota-list').html(`<h6>Fora de Rota (<span class='badge badge-warning'>${this.foraDeRota.size}</span>)</h6>` + Array.from(this.foraDeRota).map(id => `<li class='list-group-item list-group-item-warning'>${id}</li>`).join(''));
    $('#verified-total').text(this.conferidos.size);
    this.atualizarProgresso();
  },

  conferirId(codigo) {
    if (this.conferidos.has(codigo) || this.foraDeRota.has(codigo)) {
      return;
    }
    if (this.ids.has(codigo)) {
      this.ids.delete(codigo);
      this.conferidos.add(codigo);
    } else {
      this.foraDeRota.add(codigo);
    }
    $('#barcode-input').val('').focus();
    this.atualizarListas();
  },

  finalizar() {
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
    this.conferidos.forEach(id => conteudo += `Conferido,${id}\n`);
    this.ids.forEach(id => conteudo += `Faltante,${id}\n`);
    this.foraDeRota.forEach(id => conteudo += `Fora de Rota,${id}\n`);
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

// Botão de adicionar IDs manualmente
$('#manual-btn').click(() => {
  $('#initial-interface').addClass('d-none');
  $('#manual-interface').removeClass('d-none');
});

    // Submissão de IDs manuais
    $('#submit-ids').click(function () {
        try {
          let manualIds = $('#manual-ids').val().split(/[\s,]+/).map(id => id.trim());
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
  

// Eventos dos botões
$('#extract-btn').click(() => {
  let html = $('#html-input').val();
  html = html.replace(/<[^>]+>/g, ' ');
  if (!html.includes('4')) {
    ConferenciaApp.alertar('Nenhum ID começando com 4 encontrado.');
    return;
  }
  ConferenciaApp.ids.clear();
  const idsEncontrados = [...html.matchAll(/44\d{9}/g)].map(m => m[0]);
  if (idsEncontrados.length === 0) {
    ConferenciaApp.alertar('Nenhum ID válido encontrado.');
    return;
  }
  idsEncontrados.forEach(id => ConferenciaApp.ids.add(id));
  $('#route-title').text(`Conferência de IDs`);
  $('#extracted-total').text(ConferenciaApp.ids.size);
  $('#initial-interface').addClass('d-none');
  $('#conference-interface').removeClass('d-none');
  ConferenciaApp.atualizarListas();
});

$('#submit-manual').click(() => {
  const idsManuais = $('#manual-input').val().split(/\s|,+/).filter(id => /^4\d{10}$/.test(id.trim()));
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

$('#barcode-input').keypress(e => {
  if (e.which === 13) ConferenciaApp.conferirId($('#barcode-input').val().trim());
});

$('#check-csv').click(() => {
  const fileInput = document.getElementById('csv-input');
  if (fileInput.files.length === 0) {
    ConferenciaApp.alertar('Selecione um arquivo CSV.');
    return;
  }
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
      let campo = colunas[textCol].trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      const match = campo.match(/(4\d{10})/);
      if (match) {
        const csvId = match[1];
        ConferenciaApp.conferirId(csvId);
      }
    }
    ConferenciaApp.atualizarListas();
  };
  reader.readAsText(file, 'UTF-8');
});

$('#finish-btn').click(() => ConferenciaApp.finalizar());
$('#back-btn').click(() => location.reload());
$('#export-txt').click(() => ConferenciaApp.gerarRelatorioTxt());
$('#export-csv').click(() => ConferenciaApp.gerarRelatorioCsv());
$('#export-pdf').click(() => ConferenciaApp.gerarRelatorioPdf());

