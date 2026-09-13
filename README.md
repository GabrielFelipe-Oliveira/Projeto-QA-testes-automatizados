# Loja de Confecção

Aplicação web simples para cadastro de produtos de uma loja de confecção.

## Tecnologias
- HTML + EJS
- CSS
- JavaScript
- Node.js + Express
- SQLite via better-sqlite3
- Multer para upload de imagens

## Recursos
- Cadastrar produto
- Editar produto
- Excluir produto
- Pesquisar produtos
- Preço e estoque
- Categoria, tamanho e cor
- Até 3 imagens por produto
- Imagens salvas em `/uploads`
- Dados salvos em `loja.db`

## Como executar
1. Tenha Node.js instalado.
2. Abra o terminal nesta pasta.
3. Rode `npm install`.
4. Rode `npm start`.
5. Acesse `http://localhost:3000`.

## Estrutura
- `server.js` -> servidor/API e banco
- `views/` -> páginas
- `public/css/` -> estilos
- `public/js/` -> JavaScript do front-end
- `uploads/` -> imagens enviadas
- `loja.db` -> criado automaticamente ao iniciar
