# Corpo Ativo

Site da academia Corpo Ativo com frontend estatico, backend Node e banco PostgreSQL.

## Rodar localmente

Voce precisa de uma variavel `DATABASE_URL` apontando para um PostgreSQL valido.

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## Login inicial do proprietario

- E-mail: `admin@corpoativo.com`
- Senha: `corpo123`

## Publicar com GitHub + Render

### 1. Subir para o GitHub

```bash
git add .
git commit -m "Migrate to PostgreSQL"
git push origin main
```

### 2. Criar o deploy no Render

1. Entre em `https://render.com/`
2. Clique em `New +`
3. Escolha `Blueprint`
4. Conecte seu GitHub
5. Selecione o repositório deste projeto
6. Confirme a criação

O Render vai ler o arquivo `render.yaml` automaticamente e criar:

- 1 servico web Node
- 1 banco PostgreSQL free

## O que o Render vai usar

- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: `Node`
- Banco PostgreSQL vinculado pela variavel `DATABASE_URL`

## Observacoes

- O banco PostgreSQL e criado automaticamente no primeiro deploy.
- O proprietario padrao tambem e criado automaticamente no primeiro start.
- Se quiser trocar a senha inicial do dono, faca isso no arquivo `server.js` antes do deploy.
