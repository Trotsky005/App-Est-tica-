/**
 * Agenda Estética — banco de dados no Google Drive
 *
 * Este script liga o site (GitHub Pages) à planilha "Agenda Estética - Banco de dados".
 * Cada aba da planilha guarda um tipo de registro: id | dados (JSON) | atualizadoEm | chave.
 * As senhas de acesso ficam na aba "Senhas" (Nome | Senha | Perfil).
 *
 * Como publicar (uma vez só):
 *   Implantar > Nova implantação > tipo "App da Web"
 *   Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 *   Copie o endereço que termina em /exec e cole no site, na tela de configuração.
 *
 * Backup diário: rode a função "instalarBackupDiario" uma vez (menu Executar).
 */

const PLANILHA_ID = '1gV_aWRrRDSnYnHVNgp3LeMk_wjqVxG1UffEp-_8Vup0';
const PASTA_BACKUPS_ID = '1-MQouHkRyl66VF7p_f1MzIYLXaNZuCbk';
const COLECOES = ['config', 'profissionais', 'servicos', 'clientes', 'modelosPacote', 'pacotes',
  'atendimentos', 'bloqueios', 'mensagens', 'saidas', 'diasMaquina'];
const VERSAO = 1;

/* ---------------- entrada ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.acao === 'evento') return json_(eventoPublico_(p.t));
    if (p.acao === 'ics') return ics_(p.t);
    if (p.acao === 'ping') return json_({ ok: true, versao: VERSAO });
    return json_({ ok: false, erro: 'Ação desconhecida.' });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  }
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (_) { return json_({ ok: false, erro: 'Pedido inválido.' }); }
  try {
    const quem = autenticar_(req.senha);
    if (!quem) return json_({ ok: false, erro: 'senha', mensagem: 'Senha incorreta.' });
    if (req.acao === 'login') return json_({ ok: true, nome: quem.nome, perfil: quem.perfil, versao: VERSAO });
    if (req.acao === 'tudo') return json_({ ok: true, dados: lerTudo_(), agora: new Date().toISOString(), nome: quem.nome, perfil: quem.perfil });
    if (req.acao === 'gravar') return json_(gravar_(req.ops || [], quem));
    return json_({ ok: false, erro: 'Ação desconhecida.' });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- senhas ---------------- */

function autenticar_(senha) {
  senha = String(senha || '').trim();
  if (!senha) return null;
  const sh = planilha_().getSheetByName('Senhas');
  if (!sh) return null;
  const linhas = sh.getDataRange().getValues();
  for (let i = 1; i < linhas.length; i++) {
    const [nome, s, perfil] = linhas[i];
    if (String(s).trim() && String(s).trim() === senha) {
      const pf = String(perfil || '').toLowerCase().indexOf('admin') >= 0 ? 'admin' : 'profissional';
      return { nome: String(nome || '').trim() || 'Equipe', perfil: pf };
    }
  }
  return null;
}

/* ---------------- leitura ---------------- */

let _ss = null;
function planilha_() { return _ss || (_ss = SpreadsheetApp.openById(PLANILHA_ID)); }

function aba_(col) {
  if (COLECOES.indexOf(col) < 0) throw new Error('Coleção inválida: ' + col);
  const ss = planilha_();
  let sh = ss.getSheetByName(col);
  if (!sh) { sh = ss.insertSheet(col); sh.appendRow(['id', 'dados', 'atualizadoEm', 'chave']); sh.setFrozenRows(1); }
  return sh;
}

function lerTudo_() {
  const out = {};
  COLECOES.forEach(col => {
    const sh = aba_(col);
    const n = sh.getLastRow();
    out[col] = {};
    if (n < 2) return;
    const linhas = sh.getRange(2, 1, n - 1, 2).getValues();
    linhas.forEach(([id, dados]) => {
      if (!id) return;
      try { out[col][String(id)] = JSON.parse(dados); } catch (_) { }
    });
  });
  return out;
}

/* ---------------- gravação ---------------- */

function gravar_(ops, quem) {
  if (!Array.isArray(ops) || !ops.length) return { ok: true, n: 0 };
  if (ops.length > 200) throw new Error('Muitas alterações de uma vez.');
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const porAba = {};
    let n = 0;
    ops.forEach(op => {
      const col = String(op.col || ''), id = String(op.id || '');
      if (!id || !/^[A-Za-z0-9_\-.:~@+]{1,200}$/.test(id)) throw new Error('Identificador inválido.');
      if (quem.perfil !== 'admin' && ['config', 'saidas', 'modelosPacote', 'servicos'].indexOf(col) >= 0)
        throw new Error('Só a administração pode alterar ' + col + '.');
      const sh = aba_(col);
      const idx = porAba[col] || (porAba[col] = indice_(sh));
      const linha = idx[id];
      if (op.op === 'delete') {
        if (linha) { sh.deleteRow(linha); porAba[col] = indice_(sh); }
        n++; return;
      }
      let dados = op.data || {};
      if (op.op === 'update') {
        if (!linha) throw new Error('Registro não encontrado para atualizar.');
        const atual = JSON.parse(sh.getRange(linha, 2).getValue() || '{}');
        dados = mesclar_(atual, dados);
      }
      const texto = JSON.stringify(dados);
      if (texto.length > 45000) throw new Error('Registro grande demais.');
      const valores = [[id, texto, new Date(), String(dados.token || '')]];
      if (linha) sh.getRange(linha, 1, 1, 4).setValues(valores);
      else { sh.appendRow(valores[0]); idx[id] = sh.getLastRow(); }
      n++;
    });
    return { ok: true, n: n, agora: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function indice_(sh) {
  const idx = {};
  const n = sh.getLastRow();
  if (n < 2) return idx;
  sh.getRange(2, 1, n - 1, 1).getValues().forEach((r, i) => { if (r[0]) idx[String(r[0])] = i + 2; });
  return idx;
}

function mesclar_(a, b) {
  const out = Object.assign({}, a);
  Object.keys(b).forEach(k => {
    const v = b[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = mesclar_(out[k], v);
    else out[k] = v;
  });
  return out;
}

/* ---------------- link público da cliente ---------------- */

function acharPorToken_(token) {
  token = String(token || '');
  if (!/^[a-z0-9]{12,40}$/i.test(token)) return null;
  const sh = aba_('atendimentos');
  const n = sh.getLastRow();
  if (n < 2) return null;
  const achado = sh.getRange(2, 4, n - 1, 1).createTextFinder(token).matchEntireCell(true).findNext();
  if (!achado) return null;
  const linha = achado.getRow();
  return JSON.parse(sh.getRange(linha, 2).getValue() || '{}');
}

function nomesPorId_(col) {
  const sh = aba_(col), n = sh.getLastRow(), out = {};
  if (n < 2) return out;
  sh.getRange(2, 1, n - 1, 2).getValues().forEach(([id, d]) => { try { out[id] = JSON.parse(d); } catch (_) { } });
  return out;
}

function eventoPublico_(token) {
  const a = acharPorToken_(token);
  if (!a) return { ok: false, erro: 'Horário não encontrado.' };
  const servs = nomesPorId_('servicos'), profs = nomesPorId_('profissionais');
  const cfgSh = aba_('config'); let cfg = {};
  const idx = indice_(cfgSh); if (idx.geral) { try { cfg = JSON.parse(cfgSh.getRange(idx.geral, 2).getValue()); } catch (_) { } }
  const nomes = (a.itens || []).map(i => (servs[i.servicoId] || {}).nome || 'Atendimento').join(' + ');
  return {
    ok: true,
    titulo: nomes,
    local: cfg.nomeEspaco || 'Agenda Estética',
    endereco: cfg.endereco || '',
    profissional: (profs[a.profId] || {}).nome || '',
    data: a.data, hora: a.hora, duracao: a.duracao || 30,
    status: a.status || 'agendado'
  };
}

function ics_(token) {
  const ev = eventoPublico_(token);
  if (!ev.ok || ev.status === 'cancelado') {
    return ContentService.createTextOutput('Horário não encontrado ou cancelado.');
  }
  const [y, m, d] = ev.data.split('-').map(Number);
  const [hh, mm] = ev.hora.split(':').map(Number);
  // Horário de Brasília (UTC-3, sem horário de verão)
  const ini = new Date(Date.UTC(y, m - 1, d, hh + 3, mm));
  const fim = new Date(ini.getTime() + ev.duracao * 60000);
  const f = dt => Utilities.formatDate(dt, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const txt = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda Estetica//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + token + '@agenda-estetica',
    'DTSTAMP:' + f(new Date()),
    'DTSTART:' + f(ini), 'DTEND:' + f(fim),
    'SUMMARY:' + esc(ev.titulo + ' · ' + ev.local),
    'DESCRIPTION:' + esc('Atendimento' + (ev.profissional ? ' com ' + ev.profissional : '') + '.'),
    ev.endereco ? 'LOCATION:' + esc(ev.endereco) : '',
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete do seu horário', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.ICAL).downloadAsFile('horario.ics');
}

/* ---------------- backup ---------------- */

function backupDiario() {
  const pasta = DriveApp.getFolderById(PASTA_BACKUPS_ID);
  const nome = 'Backup ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  DriveApp.getFileById(PLANILHA_ID).makeCopy(nome, pasta);
  // mantém só os 30 backups mais recentes
  const arquivos = [];
  const it = pasta.getFiles();
  while (it.hasNext()) arquivos.push(it.next());
  arquivos.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  arquivos.slice(30).forEach(f => f.setTrashed(true));
}

function instalarBackupDiario() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backupDiario').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(23).create();
  backupDiario();
}

/* Rode esta função uma vez para testar se a planilha está acessível. */
function testar() {
  const d = lerTudo_();
  Logger.log('Coleções: ' + Object.keys(d).join(', '));
}
