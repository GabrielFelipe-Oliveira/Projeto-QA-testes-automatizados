# Automação de Qualidade - Loja de Confecção

## Objetivo
Executar automaticamente o plano de testes do sistema com o mínimo de intervenção humana.

## Execução
Na raiz do projeto:

```cmd
npm install
npm run test:qa
```

Depois da execução, serão gerados:

- `qa-report.html` — relatório visual;
- `qa-report.json` — relatório estruturado para integração com CI/CD.

O comando retorna:

- `0` = todos os testes passaram;
- `1` = pelo menos um teste falhou.

## O que é automatizado

- inicialização do servidor Node.js em porta exclusiva de teste;
- criação de banco SQLite temporário;
- cadastro de produto válido;
- validação de nome, preço e estoque;
- envio de 1, 2 e 3 imagens;
- tentativa de 4 imagens;
- formato de arquivo inválido;
- imagem maior que 5 MB;
- edição do produto;
- substituição e remoção de imagem antiga;
- consulta do produto;
- produto inexistente;
- exclusão;
- persistência após reinício do servidor;
- teste da lógica JavaScript da busca;
- geração automática do relatório.

Os testes usam um banco e uma pasta de uploads temporários. Os dados reais do `loja.db` não são utilizados durante a suíte.
