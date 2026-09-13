const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3107;
const BASE = `http://127.0.0.1:${PORT}`;
const RUNTIME = path.join(os.tmpdir(), 'loja-confeccao-qa');
const DB_PATH = path.join(RUNTIME, 'loja-qa.db');
const UPLOADS_DIR = path.join(RUNTIME, 'uploads');
const REPORT_JSON = path.join(ROOT, 'qa-report.json');
const REPORT_HTML = path.join(ROOT, 'qa-report.html');

fs.rmSync(RUNTIME, { recursive: true, force: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const results = [];
let serverProcess;

function pass(name, detail='') { results.push({name, status:'PASS', detail}); }
function fail(name, detail='') { results.push({name, status:'FAIL', detail}); }
function assert(cond, name, detail='') { cond ? pass(name, detail) : fail(name, detail); }

async function request(pathname, options={}) {
  return fetch(BASE + pathname, { redirect: 'manual', ...options });
}

async function waitForServer(timeoutMs=15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await request('/produtos');
      if (r.status === 200) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Servidor não iniciou dentro do tempo esperado.');
}

function startServer() {
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_PATH, UPLOADS_DIR },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', d => process.stdout.write(`[APP] ${d}`));
  serverProcess.stderr.on('data', d => process.stderr.write(`[APP-ERR] ${d}`));
}

function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill();
  serverProcess = null;
}

function makeImage(name, mime, size=128) {
  const fd = new FormData();
  const blob = new Blob([Buffer.alloc(size, 1)], { type: mime });
  fd.append('imagens', blob, name);
  return fd;
}

async function postProduct(data, files=[]) {
  const fd = new FormData();
  for (const [k,v] of Object.entries(data)) fd.append(k, String(v));
  for (const f of files) fd.append('imagens', new Blob([f.data], {type:f.mime}), f.name);
  return request('/produtos', { method:'POST', body:fd });
}

async function postEdit(id, data, files=[]) {
  const fd = new FormData();
  for (const [k,v] of Object.entries(data)) fd.append(k, String(v));
  for (const f of files) fd.append('imagens', new Blob([f.data], {type:f.mime}), f.name);
  return request(`/produtos/${id}`, { method:'POST', body:fd });
}

async function readBody(res) { return await res.text(); }

async function testSearchScript() {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  const listeners = {};
  const cards = [
    { dataset:{text:'camiseta básica masculina'}, hidden:false },
    { dataset:{text:'calça jeans azul'}, hidden:false },
    { dataset:{text:'vestido floral'}, hidden:false },
  ];
  const input = { value:'', addEventListener:(event, cb)=>listeners[event]=cb };
  const contador = { textContent:'' };
  const fileInput = { addEventListener:()=>{}, files:{length:0} };
  const preview = { innerHTML:'', appendChild:()=>{} };
  const fileInfo = { textContent:'' };
  const document = {
    getElementById(id) {
      return { busca:input, contador, imagens:fileInput, preview, fileInfo }[id] || null;
    },
    querySelectorAll(sel) { return sel === '.produto' ? cards : []; }
  };
  vm.runInNewContext(src, { document, URL:{createObjectURL:()=>''} });
  input.value = 'jeans';
  listeners.input();
  assert(cards[0].hidden === true && cards[1].hidden === false && cards[2].hidden === true && contador.textContent === '1 produto(s)', 'UI01 - Busca filtra produtos');
}

async function run() {
  const start = Date.now();
  try {
    startServer();
    await waitForServer();
    pass('APP01 - Servidor inicia automaticamente');

    const page0 = await request('/produtos');
    assert(page0.status === 200, 'APP02 - Página principal responde HTTP 200');
    const initialHtml = await readBody(page0);
    assert(initialHtml.includes('Novo produto') && initialHtml.includes('Buscar por nome'), 'UI02 - Elementos principais presentes');

    let r = await postProduct({nome:'Camiseta QA', descricao:'Produto de teste', categoria:'Camisetas', tamanho:'M', cor:'Preta', preco:'59.90', estoque:'10'}, [
      {name:'frente.jpg', mime:'image/jpeg', data:Buffer.alloc(128,1)},
      {name:'costas.png', mime:'image/png', data:Buffer.alloc(128,2)},
      {name:'detalhe.webp', mime:'image/webp', data:Buffer.alloc(128,3)},
    ]);
    assert(r.status === 302, 'CT01 - Cadastro válido', `HTTP ${r.status}`);

    const db = new Database(DB_PATH);
    let product = db.prepare('SELECT * FROM produtos WHERE nome = ?').get('Camiseta QA');
    assert(!!product, 'BD01 - Produto gravado no SQLite');
    assert(!!product && product.imagem1 && product.imagem2 && product.imagem3, 'CT09 - Três imagens gravadas no produto');
    assert(!!product && [product.imagem1,product.imagem2,product.imagem3].every(x => fs.existsSync(path.join(UPLOADS_DIR,x))), 'CT09B - Três arquivos de imagem existem no disco');

    r = await postProduct({nome:'Sem preço', descricao:'', categoria:'', tamanho:'', cor:'', preco:'', estoque:'10'});
    assert(r.status === 400, 'CT03 - Preço obrigatório/ inválido rejeitado', `HTTP ${r.status}`);
    r = await postProduct({nome:'Sem estoque', preco:'10', estoque:''});
    assert(r.status === 400, 'CT04 - Estoque obrigatório/ inválido rejeitado', `HTTP ${r.status}`);
    r = await postProduct({nome:'Preço negativo', preco:'-10', estoque:'1'});
    assert(r.status === 400, 'CT05 - Preço negativo rejeitado', `HTTP ${r.status}`);
    r = await postProduct({nome:'Estoque negativo', preco:'10', estoque:'-1'});
    assert(r.status === 400, 'CT06 - Estoque negativo rejeitado', `HTTP ${r.status}`);
    r = await postProduct({nome:'Sem nome', preco:'10', estoque:'1'});
    assert(r.status === 400, 'CT02 - Nome vazio rejeitado', `HTTP ${r.status}`);

    r = await postProduct({nome:'Quatro imagens', preco:'10', estoque:'1'}, [
      {name:'1.jpg',mime:'image/jpeg',data:Buffer.alloc(10)},
      {name:'2.jpg',mime:'image/jpeg',data:Buffer.alloc(10)},
      {name:'3.jpg',mime:'image/jpeg',data:Buffer.alloc(10)},
      {name:'4.jpg',mime:'image/jpeg',data:Buffer.alloc(10)},
    ]);
    assert(r.status === 400, 'CT10 - Quarta imagem rejeitada', `HTTP ${r.status}`);

    r = await postProduct({nome:'Formato inválido', preco:'10', estoque:'1'}, [
      {name:'arquivo.pdf',mime:'application/pdf',data:Buffer.alloc(10)},
    ]);
    assert(r.status === 400, 'CT11 - Formato de arquivo inválido rejeitado', `HTTP ${r.status}`);

    r = await postProduct({nome:'Imagem grande', preco:'10', estoque:'1'}, [
      {name:'grande.jpg',mime:'image/jpeg',data:Buffer.alloc(5*1024*1024+1)},
    ]);
    assert(r.status === 400, 'CT12 - Imagem maior que 5 MB rejeitada', `HTTP ${r.status}`);

    const oldImg = product.imagem1;
    r = await postEdit(product.id, {nome:'Camiseta QA Editada', descricao:'Atualizado', categoria:'Camisetas', tamanho:'G', cor:'Azul', preco:'69.90', estoque:'12'}, [
      {name:'nova.jpg',mime:'image/jpeg',data:Buffer.alloc(128,9)},
    ]);
    assert(r.status === 302, 'CT15 - Edição do produto');
    product = db.prepare('SELECT * FROM produtos WHERE id = ?').get(product.id);
    assert(product.nome === 'Camiseta QA Editada' && Number(product.preco) === 69.90 && product.estoque === 12, 'BD03 - Dados atualizados no SQLite');
    assert(product.imagem1 !== oldImg && !fs.existsSync(path.join(UPLOADS_DIR,oldImg)), 'CT16 - Imagem antiga substituída e removida');
    assert(fs.existsSync(path.join(UPLOADS_DIR,product.imagem1)), 'CT16B - Nova imagem existe no disco');

    r = await request(`/produtos/999999/editar`);
    assert(r.status === 404, 'CT20 - Produto inexistente retorna 404');
    r = await request(`/produtos/999999/excluir`, {method:'POST'});
    assert(r.status === 404, 'CT20B - Exclusão de produto inexistente retorna 404');

    await testSearchScript();

    const finalPage = await request('/produtos');
    const finalHtml = await readBody(finalPage);
    assert(finalHtml.includes('Camiseta QA Editada'), 'CT13 - Produto consultável após edição');

    const finalId = product.id;
    r = await request(`/produtos/${finalId}/excluir`, {method:'POST'});
    assert(r.status === 302, 'CT17 - Exclusão do produto');
    assert(!db.prepare('SELECT 1 FROM produtos WHERE id=?').get(finalId), 'BD04 - Registro removido do SQLite');

    // Persistência: cria, reinicia e verifica, depois remove.
    r = await postProduct({nome:'Persistência QA', preco:'22.50', estoque:'2'});
    assert(r.status === 302, 'CT19A - Cadastro para teste de persistência');
    const persisted = db.prepare('SELECT * FROM produtos WHERE nome=?').get('Persistência QA');
    assert(!!persisted, 'CT19B - Registro criado para persistência');
    db.close();
    stopServer();
    startServer();
    await waitForServer();
    const restarted = await request('/produtos');
    const restartedHtml = await readBody(restarted);
    assert(restartedHtml.includes('Persistência QA'), 'CT19 - Dados permanecem após reinício do servidor');
    const db2 = new Database(DB_PATH);
    const persisted2 = db2.prepare('SELECT * FROM produtos WHERE nome=?').get('Persistência QA');
    if (persisted2) await request(`/produtos/${persisted2.id}/excluir`, {method:'POST'});
    db2.close();
  } catch (err) {
    fail('EXEC - Execução da suíte', err.stack || err.message);
  } finally {
    stopServer();
  }

  const duration = Date.now() - start;
  const passed = results.filter(r=>r.status==='PASS').length;
  const failed = results.filter(r=>r.status==='FAIL').length;
  const report = {generatedAt:new Date().toISOString(), durationMs:duration, total:results.length, passed, failed, results};
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  const rows = results.map(r => `<tr><td>${r.status}</td><td>${r.name}</td><td>${escapeHtml(r.detail)}</td></tr>`).join('');
  fs.writeFileSync(REPORT_HTML, `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Relatório QA - Loja de Confecção</title><style>body{font-family:Arial,sans-serif;margin:32px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f2f2f2}.ok{color:green}.fail{color:#b00020}</style><h1>Relatório QA - Loja de Confecção</h1><p><b>${passed}</b> aprovados · <b>${failed}</b> falhos · ${duration} ms</p><table><thead><tr><th>Status</th><th>Teste</th><th>Detalhes</th></tr></thead><tbody>${rows}</tbody></table></html>`);
  console.log(`\nQA concluído: ${passed} PASS / ${failed} FAIL`);
  console.log(`Relatório: ${REPORT_HTML}`);
  process.exitCode = failed ? 1 : 0;
}
function escapeHtml(s='') { return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
run();
