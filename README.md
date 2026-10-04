# Quem eu sou?

Jogo multiplayer em português, para celular e PC. De 2 a 12 amigos entram pela lista de salas ativas e usam uma call externa para conversar.

## Publicar no Vercel

1. No Vercel, escolha **Add New → Project**.
2. Importe **toastbyday/Quem-eu-sou**.
3. Mantenha a pasta raiz do repositório, o preset **Other**, o comando **npm run build** e a saída **dist** (o `vercel.json` já define tudo).
4. Clique em **Deploy** e compartilhe o endereço com seus amigos.

**Não é necessário configurar variáveis de ambiente no Vercel.** O banco e a função do jogo já foram instalados no projeto Supabase **Quem-eu-sou?** (`fezriztbwnxcvkwrbybc`). A API no Vercel usa somente a chave pública; a credencial privilegiada fica no ambiente da função do Supabase.

## Como jogar

- O formulário de nick abre no início e não fecha até ser preenchido.
- Crie uma sala ou escolha uma na lista de salas ativas e toque em Entrar. A lista se atualiza a cada 5 segundos. Salas em rodada ou lotadas aparecem com entrada indisponível.
- O anfitrião pode expulsar jogadores. A sala aceita até 12 pessoas.
- Ao começar, o servidor sorteia um ciclo: cada jogador escolhe a identidade de outro e ninguém recebe a si mesmo. Funciona com 2, 3 e mais pessoas.
- Todos enviam um nome secreto. O jogo começa automaticamente quando as identidades estiverem prontas.
- Você vê os nomes dos outros, nunca a sua identidade. Na sua vez, pergunte na call e toque em **Pronto** para passar a vez.
- Depois que a galera confirmar o acerto na call, toque em **Acertei**. Sua carta fica verde e você sai dos turnos.
- **Desistir** retira você dos turnos até a próxima rodada.
- Quando todos terminarem, aparece o resultado por 10 segundos e uma nova rodada começa. O anfitrião pode antecipar.
- Se o anfitrião sair, a função passa para o próximo jogador. Uma saída durante as escolhas devolve a sala ao lobby para refazer o sorteio.
- Quem entrar após o término de uma rodada aguarda a próxima. Durante uma rodada ativa, novos jogadores precisam esperar o término.
- A sessão se recupera após recarregar a página no mesmo navegador/dispositivo. Salas sem atividade expiram após 24 horas.

**As chamadas de voz não fazem parte do site.** Usem Discord, WhatsApp ou a call que preferirem. Acertos são declarados pelo próprio jogador após confirmação na call.

## Desenvolvimento

Requer Node.js 22 ou mais recente. Não há dependências npm externas.

```sh
npm run dev
npm test
npm run build
```

O servidor local abre em `http://localhost:3000`. A prévia local usa a função do Supabase diretamente; no Vercel, as chamadas passam por `/api/game` na mesma origem. Para jogar com duas pessoas no mesmo computador, use perfis ou navegadores diferentes; abas do mesmo perfil compartilham a mesma sessão.

`tests/game.sql` verifica o fluxo real no banco em uma transação e remove os dados temporários gerados pelo teste. `tests/api.test.mjs` verifica o encaminhamento da API e seu tratamento de erros.

## Backend e segurança

- Estado privado no schema `game_private`, com RLS e sem acesso para `anon` ou `authenticated`.
- Função SQL `public.qes_game` com **security invoker**, acessível somente a `service_role`.
- Função Supabase `quem-eu-sou` com sessões convidadas por token aleatório de 256 bits. Só o hash do token é armazenado.
- Toda ação verifica a associação à sala. Início e expulsão verificam o anfitrião; passagem e acerto verificam o turno. Transações com bloqueio de linha evitam turnos simultâneos.
- Respostas omitem tokens e a identidade do próprio jogador. As identidades também ficam ocultas de todos durante as escolhas.
- Sincronização por consultas a cada 1,8s, pausadas em abas ocultas. Alterações são confirmadas pelo servidor.
- Limites por sessão para ações, consultas e criação de salas. Expulsão bloqueia aquela sessão; como o jogo não exige conta, não é um banimento permanente de uma pessoa.
- Não compartilhe o token de sessão nem coloque chaves privilegiadas no frontend.

## Arquivos

- `index.html`, `style.css`, `app.js`: interface e jogo.
- `api/game.js`: função serverless do Vercel.
- `supabase/schema.sql`: banco e regras.
- `supabase/functions/quem-eu-sou/index.ts`: servidor do jogo.
- `vercel.json`: publicação automática ao importar o repositório.

Para migrar o jogo para outro projeto, instale o SQL e a função nesse projeto e atualize a URL/chave pública em `api/game.js` e a URL de prévia em `app.js`. Nunca use uma chave service-role no navegador.

### Aparência e perfil
O site e o aplicativo usam um único tema de festa inspirado no Gartic Phone, com fundo roxo, cartões claros e botões com relevo. Clique no avatar ao lado do nick para escolher, remover e salvar uma foto. Fotos são recortadas ao centro e comprimidas para JPEG de 96×96; ficam neste navegador e são compartilhadas com os participantes da sala.
