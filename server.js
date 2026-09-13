const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOADS = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'loja.db');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    categoria TEXT DEFAULT '',
    tamanho TEXT DEFAULT '',
    cor TEXT DEFAULT '',
    preco REAL NOT NULL DEFAULT 0,
    estoque INTEGER NOT NULL DEFAULT 0,
    imagem1 TEXT,
    imagem2 TEXT,
    imagem3 TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { files: 3, fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOADS));

const allProducts = db.prepare('SELECT * FROM produtos ORDER BY id DESC');
const getProduct = db.prepare('SELECT * FROM produtos WHERE id = ?');

app.get('/', (_req, res) => res.redirect('/produtos'));
app.get('/qa-dashboard.html', (_req, res) =>
  res.sendFile(path.join(ROOT, 'qa-dashboard.html'))
);

app.get('/qa-report.html', (_req, res) =>
  res.sendFile(path.join(ROOT, 'qa-report.html'))
);

app.get('/produtos', (req, res) => {
  const produtos = allProducts.all();
  res.render('produtos', { produtos, mensagem: req.query.mensagem || '' });
});

app.get('/produtos/novo', (_req, res) => res.render('form', { produto: null, acao: '/produtos', titulo: 'Novo produto' }));

app.get('/produtos/:id/editar', (req, res) => {
  const produto = getProduct.get(req.params.id);
  if (!produto) return res.status(404).send('Produto não encontrado');
  res.render('form', { produto, acao: `/produtos/${produto.id}?_method=PUT`, titulo: 'Editar produto' });
});

// Aceita POST de atualização para manter o projeto sem dependência extra de method-override.
app.post('/produtos', upload.array('imagens', 3), (req, res) => {
  try {
    const { nome, descricao, categoria, tamanho, cor, preco, estoque } = req.body;
    if (!nome || !nome.trim()) return res.status(400).send('Nome é obrigatório.');
    const valorPreco = Number(preco);
    const valorEstoque = Number(estoque);
    if (!Number.isFinite(valorPreco) || valorPreco < 0) return res.status(400).send('Preço inválido.');
    if (!Number.isInteger(valorEstoque) || valorEstoque < 0) return res.status(400).send('Estoque inválido.');
    if (req.files.length > 3) return res.status(400).send('Máximo de 3 imagens.');
    const imgs = req.files.map(f => f.filename);
    db.prepare(`INSERT INTO produtos (nome, descricao, categoria, tamanho, cor, preco, estoque, imagem1, imagem2, imagem3) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(nome.trim(), descricao || '', categoria || '', tamanho || '', cor || '', valorPreco, valorEstoque, imgs[0] || null, imgs[1] || null, imgs[2] || null);
    res.redirect('/produtos?mensagem=' + encodeURIComponent('Produto cadastrado com sucesso!'));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao cadastrar produto.');
  }
});

app.post('/produtos/:id', upload.array('imagens', 3), (req, res) => {
  try {
    const produto = getProduct.get(req.params.id);
    if (!produto) return res.status(404).send('Produto não encontrado');
    const { nome, descricao, categoria, tamanho, cor, preco, estoque } = req.body;
    const novos = req.files.map(f => f.filename);
    const valorPreco = Number(preco);
    const valorEstoque = Number(estoque);
    if (!nome || !nome.trim()) return res.status(400).send('Nome é obrigatório.');
    if (!Number.isFinite(valorPreco) || valorPreco < 0) return res.status(400).send('Preço inválido.');
    if (!Number.isInteger(valorEstoque) || valorEstoque < 0) return res.status(400).send('Estoque inválido.');
    const imagens = [produto.imagem1, produto.imagem2, produto.imagem3];
    for (let i = 0; i < novos.length && i < 3; i++) imagens[i] = novos[i];

    db.prepare(`UPDATE produtos SET nome=?, descricao=?, categoria=?, tamanho=?, cor=?, preco=?, estoque=?, imagem1=?, imagem2=?, imagem3=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`)
      .run(nome.trim(), descricao || '', categoria || '', tamanho || '', cor || '', valorPreco, valorEstoque, imagens[0], imagens[1], imagens[2], req.params.id);

    // remove imagens substituídas
    novos.forEach((nomeArquivo, i) => {
      const antigo = [produto.imagem1, produto.imagem2, produto.imagem3][i];
      if (antigo && antigo !== nomeArquivo) fs.rmSync(path.join(UPLOADS, antigo), { force: true });
    });
    res.redirect('/produtos?mensagem=' + encodeURIComponent('Produto atualizado com sucesso!'));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao atualizar produto.');
  }
});

app.post('/produtos/:id/excluir', (req, res) => {
  const produto = getProduct.get(req.params.id);
  if (!produto) return res.status(404).send('Produto não encontrado');
  [produto.imagem1, produto.imagem2, produto.imagem3].filter(Boolean).forEach(img => fs.rmSync(path.join(UPLOADS, img), { force: true }));
  db.prepare('DELETE FROM produtos WHERE id = ?').run(req.params.id);
  res.redirect('/produtos?mensagem=' + encodeURIComponent('Produto excluído!'));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).send('Erro no upload: ' + err.message);
  if (err) return res.status(400).send('Arquivo inválido. Use JPG, PNG ou WEBP (até 5 MB por imagem).');
  res.status(500).send('Erro interno.');
});

app.listen(PORT, () => console.log(`Loja rodando em http://localhost:${PORT}`));
