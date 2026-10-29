# Academia do Tio Zé online (Railway): contas, progresso na nuvem, perfis e ranking

## Contexto
Hoje o jogo roda e salva só no navegador (`localStorage`, em `game/engine/persistence.js`). O usuário quer publicar na web pelo Railway e ter:
- conta por **apelido + senha**;
- o **progresso do jogador salvo na nuvem** — cada conta tem um único progresso contínuo, que ele continua jogando de qualquer computador (não existe "partida" separada);
- **perfis públicos**: ver o desempenho dos outros e **comparar com o seu** (sem criar competições — nada é criado pelos jogadores além da própria conta);
- **ranking** de dinheiro e de alunos;
- **checagem básica** contra números falsos.

O jogo continua 100% no navegador; o servidor só guarda o progresso, valida e monta o ranking.

## Branch
Antes de qualquer mudança: `git checkout -b online` a partir da `main` atualizada (920a073). Todo o trabalho fica nessa branch; commits e push (`git push -u origin online`) só quando você pedir. A `main` continua com o jogo offline até você decidir juntar.

## Arquitetura
- Mesmo app Next.js 16 (`next build` + `next start`, que já lê `PORT` do Railway). Rotas de servidor em `app/api/**/route.js` (Route Handlers, conforme `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`); `cookies()` é assíncrono nesta versão.
- Banco: **Postgres do Railway** (variável `DATABASE_URL`). Única dependência nova: **`pg`**.
- Senha com `node:crypto` `scrypt` + sal (sem dependência). Sessão = token aleatório em cookie `httpOnly`, `secure`, `sameSite=lax`; no banco só o hash do token, validade 60 dias.
- JavaScript puro, sem TypeScript.

## Banco (`db/schema.sql`, aplicado por `npm run migrate` = `scripts/migrate.js`)
- `users` — id, username (único, minúsculo, 3–20 letras/números/_), password_hash, created_at.
- `sessions` — token_hash, user_id, expires_at.
- `saves` — user_id (PK), data `jsonb` (o save inteiro), game_day, saved_at, updated_at.
- `profiles` — user_id (PK), money, students (Matriz + membros das filiais), matriz_students, reputation, era, game_day, branches, equipment, flagged (bool), updated_at. Índices em money e students para o ranking.
- `history` — user_id, game_month, money, students, reputation (um ponto por mês de jogo, para o gráfico do perfil).

## Servidor (`server/` — só importado pelas rotas)
- `server/db.js` — pool `pg` único (reaproveitado entre requisições).
- `server/auth.js` — hash/checagem de senha, criar/ler/apagar sessão, `currentUser()`; limite simples de tentativas de login por IP (em memória).
- `server/progress.js` — recebe o save, roda **`parseSave`** de `game/engine/persistence.js` (já valida e normaliza tudo e não depende de `window`), extrai os números do perfil e aplica a checagem.
- `server/plausibility.js` (função pura, testável) — compara com o save anterior da conta:
  - dia de jogo não volta (exceto recomeço explícito) e não avança mais rápido que a velocidade máxima do jogo × tempo real passado + o limite de recuperação offline (`CONFIG.time`);
  - dinheiro não cresce mais que um teto por dia de jogo, calculado do `gameConfig.json` (mensalidade máxima da era × capacidade máxima + filiais) com folga;
  - alunos ≤ capacidade possível da academia; era sobe no máximo 1 por save.
  - Se falhar: o save **é guardado mesmo assim** (o jogador não perde progresso), mas o perfil fica `flagged` e sai do ranking até eu/você liberar no banco. Assim um erro na checagem não trava ninguém.

## Rotas
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `GET /api/save` (baixa o progresso da conta), `PUT /api/save` (envia; limite de tamanho, ~1 por 20 s por conta).
- `GET /api/ranking?by=money|students&page=` — top 50 + a posição de quem pede.
- `GET /api/players?q=` — buscar por apelido.
- `GET /api/players/[username]` — perfil público: números atuais + histórico mensal. Nunca expõe o save inteiro nem senha.

## Cliente
- `game/engine/cloud.js` — `fetch` para as rotas; fila de envio que não trava o jogo; offline continua salvando só local e reenvia depois.
- `game/engine/store.js`: o autosave (`tick`, `saveNow`, `backToTitle`) passa a chamar também o envio para a nuvem quando há conta; ao entrar, baixa o progresso da nuvem. Se o navegador tiver um progresso mais novo que o da nuvem (ex.: jogou como convidado), pergunta qual manter com o `askConfirm` já existente.
- Sem conta continua possível ("Jogar como convidado"): salva só no navegador e fica fora do ranking. Ao criar conta, o progresso do navegador sobe para a nuvem.
- Telas (no estilo atual de `components/` e `app/globals.css`):
  - `components/screens/TitleScreen.js` — Entrar / Criar conta / Jogar como convidado.
  - `components/online/AccountDialog.js` — formulário de login/cadastro.
  - `components/online/RankingPanel.js` — abas **Dinheiro** e **Alunos**, sua posição destacada, busca por apelido; botão na HUD.
  - `components/online/ProfileCard.js` — perfil de outro jogador **lado a lado com o seu** (dinheiro, alunos, reputação, era, filiais, aparelhos, dias jogados) e um gráfico simples (canvas) de dinheiro e alunos por mês, com as duas linhas.

## Railway (passo a passo vai no README)
1. Criar projeto no Railway a partir do repositório GitHub `enzoITs/AcademiaTioZe`.
2. Adicionar o serviço **PostgreSQL** e ligar `DATABASE_URL` ao app.
3. Build: `npm run build` · Start: `npm run start` · Pre-deploy: `npm run migrate`.
4. Gerar domínio público. (Criar a conta/projeto no Railway é com você; eu deixo tudo pronto no código.)

## Testes / verificação
- `node --test`: hash de senha, `plausibility.js` (saltos de dinheiro/dia/era aceitos e recusados), extração dos números do perfil a partir de saves reais (`createNewGame` + Era 4 com filiais), validação de apelido.
- Os 54 testes atuais continuam passando; `npm run build` compila.
- Ponta a ponta: rodar local com o `DATABASE_URL` do Postgres do Railway (ou um Postgres local), e no Chrome via puppeteer: criar 2 contas, jogar um pouco, conferir save na nuvem (entrar em outra aba anônima e continuar), ranking ordenado, abrir perfil do outro e comparar, e um save adulterado (dinheiro inflado) ficar fora do ranking.

## Notas da implementação (o que mudou em relação ao plano)
- Sem tabela `history`: o gráfico usa os relatórios mensais que o próprio save já guarda (`state.reports`, últimos 12 meses), copiados para `profiles.history`.
- Sem `npm run migrate`: as tabelas são criadas sozinhas na primeira conexão (`CREATE TABLE IF NOT EXISTS` em `server/db.js`), então o Railway não precisa de comando de pre-deploy.
- Em desenvolvimento, sem `DATABASE_URL`, o servidor usa o PGlite (Postgres embutido, só `devDependency`) em `.data/`.
- A checagem pura ficou em `game/online/progress.js` (testável e usada pelo servidor).
