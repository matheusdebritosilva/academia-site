# Corpo Ativo

Site da academia Corpo Ativo com frontend estático, backend Node e banco SQLite.

## Rodar localmente

```bash
npm start
```

Abra `http://localhost:3000`.

## Login inicial do proprietário

- E-mail: `admin@corpoativo.com`
- Senha: `corpo123`

## Publicar com GitHub + Render

### 1. Subir para o GitHub

No terminal, dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

### 2. Criar o deploy no Render

1. Entre em `https://render.com/`
2. Clique em `New +`
3. Escolha `Blueprint`
4. Conecte seu GitHub
5. Selecione o repositório deste projeto
6. Confirme a criação

O Render vai ler o arquivo `render.yaml` automaticamente.

## O que o Render vai usar

- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: `Node`
- Disco persistente para o SQLite em `/opt/render/project/src/data`

## Observações

- O banco SQLite não foi versionado no GitHub. Ele será criado automaticamente no primeiro deploy.
- O proprietário padrão também é criado automaticamente no primeiro start.
- Se quiser trocar a senha inicial do dono, faça isso no arquivo `server.js` antes do deploy.
