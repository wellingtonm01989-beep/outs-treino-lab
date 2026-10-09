# Plano: mesa com amigos (multiplayer)

Decidido em 09/10/2026. Este arquivo é o ponto de partida para quem continuar o trabalho (inclusive o Claude Code no computador de casa).

## Onde paramos (09/10/2026)

- Nada do multiplayer foi construído ainda. O jogo de hoje (cash, Sit & Go com várias mesas, torneio, coach) é todo local, no navegador, e está no GitHub Pages.
- Já decidido: arquitetura (Cloudflare), protocolo, premiação fora do app, e as regras para caber no plano grátis (seções abaixo).
- **Próximo passo em casa:** seguir "Para preparar em casa" e começar a etapa 1 (servidor mínimo). Logo na primeira partida de teste, **conferir no painel da Cloudflare** a dúvida em aberto sobre a contagem das mensagens (ver "Cotas do plano grátis").

## O que o usuário quer

- Uma aba **"Mesa com amigos"** onde o anfitrião monta a mesa e recebe um **link único**.
- Quem abre o link digita **só o nome** e já ocupa um lugar livre. Sem cadastro, sem e-mail.
- Formato **Sit & Go**: todos começam com as mesmas fichas, blinds sobem, **quem perde tudo sai da mesa**, o último que sobra vence.
- Quando a partida termina, **a mesa é apagada** e o link deixa de funcionar. Nova partida = novo link.
- **Dinheiro real fica FORA do app.** Cada um paga a inscrição por Pix ao organizador; o app mostra a premiação combinada e o resumo final; o organizador paga os prêmios por Pix. O app nunca processa pagamento. Sem rake/taxa para a casa.

## Arquitetura escolhida

**Servidor autoritativo na Cloudflare: Workers + Durable Objects (plano gratuito, sem cartão).**

- Cada mesa é um Durable Object (classe `Mesa`). Ele nasce ao criar o link e é limpo no fim da partida.
- Conexão em tempo real por **WebSocket** (usar a API de *hibernation* do Durable Object para economizar cota).
- O **servidor embaralha** (crypto.getRandomValues, Fisher-Yates com rejeição — reaproveitar `js/rng.js` e `js/baralho.js`), guarda o baralho e envia a cada jogador **só a própria vista** (`mao.vista(assento)` do `js/motor.js` já faz esse filtro). O baralho nunca sai do servidor durante a mão.
- **Lacre do baralho:** no início de cada mão o servidor publica SHA-256(ordem do baralho + sal); no fim revela ordem e sal. Qualquer jogador confere que o baralho não mudou no meio da mão.
- Bots podem completar lugares vazios (opcional, `js/bots.js` roda no servidor).
- Coach **desligado durante as mãos** contra humanos (seria vantagem); relatório do coach no fim, no navegador de cada um.

Alternativas descartadas: Firebase só com o celular do anfitrião como dealer (anfitrião poderia espiar e o jogo pausa se ele sair); Firebase + Cloud Functions (exige plano com cartão); app nativo (reescrever tudo e o convite por link fica pior); servidor Node rodando no PC de casa (ver abaixo).

## Como os jogadores se conectam

- **O servidor NÃO roda no PC de casa.** O Node em casa serve só para escrever, testar (`npx wrangler dev`) e publicar (`npx wrangler deploy`) o servidor. Depois de publicado ele roda na Cloudflare 24 h por dia e o PC pode ficar desligado.
- Três peças: **GitHub Pages** = as telas (o app de hoje); **Cloudflare** = o "dealer" (embaralha, guarda as cartas, confere as jogadas); **PC de casa** = oficina onde se faz e publica o servidor.
- Fluxo: anfitrião abre o app → aba "Mesa com amigos" → cria a mesa → recebe o link `https://wellingtonm01989-beep.github.io/outs-treino-lab/#mesa=CODIGO` → manda no WhatsApp → o colega abre, digita o nome → o navegador dele abre sozinho o WebSocket com `outs-mesas.<conta>.workers.dev`. Ninguém instala nada nem precisa saber esse endereço.
- Por que não hospedar no PC de casa: PC teria que ficar ligado; muitas operadoras no Brasil usam CGNAT (sem IP público, ninguém de fora chega); IP muda; o site é https e o navegador bloqueia WebSocket sem certificado (`ws://`); abriria uma porta da rede de casa. Cloudflare Tunnel contornaria parte disso, mas o PC continuaria precisando ficar ligado.
- Atenção: colegas jogando **pela rede da empresa** podem ter o WebSocket ou o `workers.dev` bloqueados pelo firewall. Pelos dados móveis ou Wi-Fi de casa funciona.

## Cotas do plano grátis e como caber nelas

Pesquisado em 09/10/2026 (conferir de novo na documentação: developers.cloudflare.com/durable-objects/platform/pricing e /limits, e /workers/platform/limits).

Cotas por dia (zeram às 00:00 UTC = **21h de Brasília**; estourou, as operações daquele tipo falham com erro até zerar):

| Item | Cota grátis |
|---|---|
| Requisições Durable Objects (inclui conexões, mensagens WebSocket recebidas, alarmes, chamadas RPC) | 100.000/dia |
| Duração (cobrada sobre 128 MB fixos) | 13.000 GB-s/dia ≈ 28 h de um objeto acordado |
| Linhas gravadas no SQLite (**cada `setAlarm()` conta 1**) | 100.000/dia |
| Linhas lidas | 5 milhões/dia |
| Armazenamento | 5 GB no total |
| Requisições do Worker (criar mesa, upgrade para WebSocket) | 100.000/dia, 10 ms de CPU cada |

Outros limites: número de objetos ilimitado (cada mesa é um objeto, então **não há limite de mesas ao mesmo tempo**); ~1.000 requisições/s por objeto (uma mesa de poker fica muito abaixo). Mensagens que o servidor envia e pings respondidos por `setWebSocketAutoResponse()` não contam.

**Dúvida em aberto:** a documentação diz que 20 mensagens WebSocket recebidas contam como 1 requisição, mas descreve isso como "billing-only" e não deixa claro se vale para a cota grátis. **Conferir no painel da Cloudflare depois de uma partida de teste.**

Estimativa por **mesa-hora** (uma mesa de 9 jogando 1 hora, ~65 mãos):

| Origem | Por hora | Consome |
|---|---|---|
| Jogadas dos humanos | ~700 mensagens | requisições |
| Alarme do tempo de ação (um a cada ~30 s) | ~120 | requisições + linhas gravadas |
| Conexões e reconexões | ~15 | requisições |
| Salvar a mesa uma vez por mão | ~65 | linhas gravadas |

| Cenário | Limite que pega primeiro | Mesa-horas/dia | Sit & Gos de 9 (~1h30)/dia |
|---|---|---|---|
| Pessimista (cada mensagem = 1 requisição) | requisições | ~120 | ~80 |
| Otimista (20 mensagens = 1 requisição) | linhas gravadas | ~500 | ~350 |
| Servidor que nunca hiberna (setTimeout, `accept()` sem hibernation) | duração | ~29 | ~19 |

Na prática: no pessimista, 5 mesas jogando 24 h ou ~30 mesas numa noite de 4 h; no otimista, ~20 mesas 24 h ou ~125 mesas numa noite de 4 h. O grupo de amigos/colegas (2–3 mesas) cabe com muita folga. Se um dia crescer: plano pago a partir de US$ 5/mês.

**Regras de construção para caber no grátis (obrigatórias):**

1. **Hibernar sempre.** WebSocket pela Hibernation API (`ctx.acceptWebSocket`, `webSocketMessage`, `webSocketClose`), nunca `ws.accept()`. Nada de `setTimeout`/`setInterval` no servidor: tudo que espera tempo usa **alarm**. Pings via `setWebSocketAutoResponse()`.
2. **Um único alarme por mesa, sem remarcar a cada jogada.** Guardar o prazo da vez no estado; quando o alarme tocar, conferir de quem é a vez: se o prazo passou, check/fold automático; senão, reagendar para o prazo atual. Assim o alarme toca no máximo ~1 vez a cada 30 s (e não ~700 `setAlarm()` por hora).
3. **Salvar o estado uma vez por mão** (uma linha com o estado serializado), não a cada jogada. Na volta da hibernação, recarregar dessa linha (e o estado da mão em andamento fica em memória enquanto o objeto está acordado; se perder, a mão é anulada, como no "retomar" do app local).
4. **Bots e pausas no cliente.** O servidor decide a jogada do bot na hora e manda os eventos; a "pausa para pensar" e as animações acontecem na tela de cada um (como hoje em `ui-mesa.js`). O prazo do humano já inclui o tempo da animação. Bots não geram mensagens nem alarmes.
5. **Blinds calculados pelo relógio**, no início de cada mão (nível = tempo desde o começo / duração do nível). Sem alarme para subir blind.
6. **Contador de consumo.** O servidor soma as requisições e gravações do dia (um objeto "Contador" ou contagem aproximada por mesa-hora) e, perto de ~80% da cota, **para de criar mesas novas** com um aviso claro. Assim nenhuma partida em andamento é cortada quando a cota zera.

## Restrições que continuam valendo

- `index.html` continua abrindo por **duplo clique (file://) e offline**. O multiplayer só funciona pelo link online (GitHub Pages); pelo file:// a aba explica isso.
- Cliente: **sem ES modules, sem build**, namespace único `window.Poker`, comentários em português.
- **Math.random proibido** em qualquer coisa ligada às cartas (no servidor também).
- O computador do trabalho **não tem Node/npm/npx/Python**: tudo que precisa de Node (servidor, wrangler, testes do servidor) é feito no **computador de casa**. O cliente continua testável no trabalho (Edge headless, `testes.html`, `testes/celular.html`).

## Estrutura proposta

```
servidor/                 ← só em casa (Node + wrangler)
  wrangler.toml
  package.json
  src/
    janela.js             ← define globalThis.window = globalThis (importar ANTES dos arquivos do núcleo)
    nucleo.js             ← importa ../../js/rng.js, baralho.js, avaliador.js, motor.js (e bots.js etc. se usar bots)
    index.js              ← Worker: rotas HTTP + upgrade para WebSocket
    mesa.js               ← Durable Object "Mesa": estado da partida, relógio dos blinds, tempo de ação
  teste/                  ← simulação com vários clientes WebSocket
js/rede.js                ← cliente: conexão WebSocket, reconexão, mensagens
js/ui-amigos.js           ← aba "Mesa com amigos": criar mesa, sala de espera, entrar pelo link
```

Os arquivos do núcleo são IIFEs que usam `window.Poker`. Como os `import` são içados, o `globalThis.window = globalThis` precisa estar num módulo separado importado primeiro (`janela.js`).

`wrangler.toml` (conferir na documentação atual da Cloudflare):

```toml
name = "outs-mesas"
main = "src/index.js"
compatibility_date = "2026-10-01"

[[durable_objects.bindings]]
name = "MESAS"
class_name = "Mesa"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Mesa"]   # Durable Objects com SQLite: os que o plano gratuito permite
```

Segurança do servidor: aceitar só a origem `https://wellingtonm01989-beep.github.io` (e localhost em testes); limitar tamanho e frequência das mensagens; validar toda ação com `mao.acoesValidas()`; nome com até 18 caracteres.

## Protocolo (rascunho)

- `POST /mesas` → cria a mesa `{ lugares, fichas, velocidade, bots }` e devolve `{ codigo, tokenAnfitriao }`. Link: `.../outs-treino-lab/#mesa=CODIGO`.
- `GET /mesas/CODIGO/ws` → WebSocket.
- Cliente → servidor: `entrar {nome, token?}`, `comecar` (só anfitrião), `acao {tipo, ate}`, `sair`.
- Servidor → cliente: `sala {jogadores, status}`, `vista {...}` (só a do próprio jogador), `eventos [...]` (sem cartas fechadas dos outros), `lacre {hash}`, `revelacao {ordem, sal}`, `eliminado {lugar}`, `fim {classificacao}`.
- Identidade: token aleatório guardado no navegador (sessionStorage) para reconectar depois de recarregar a página.
- Tempo de ação: ~30 s; ao esgotar, check se possível, senão fold. Jogador desconectado: check/fold automático até voltar. (Prazo controlado pelo alarme único da regra 2 em "Cotas do plano grátis".)
- O cliente só envia mensagem quando age (`acao`) ou entra/sai: nada de "pronto", batimentos ou confirmações, porque cada mensagem recebida consome cota.

No cliente, a ideia é uma "partida remota" que chama os **mesmos callbacks de interface** que `P.Partida` usa hoje (`aoNovaMao`, `aoEventos`, `aoVezDoBot`, `pedirAcao`, `aoFimDaMao`, `aoFimDaPartida`...), para reaproveitar `js/ui-mesa.js` inteiro.

## Premiação e acerto (fora do app)

- Na criação: valor da inscrição (só informativo, em R$) e divisão (ex.: 50/30/20; reaproveitar `P.Estruturas` do Sit & Go).
- Na sala de espera e na mesa: total arrecadado e prêmio de cada posição.
- No fim: classificação final + "quanto cada um recebe", para o organizador pagar por Pix. Histórico de cada mão com a ordem do baralho e o lacre para tirar dúvidas.

## Etapas

1. **Servidor mínimo** (casa): criar mesa, entrar pelo link com nome, sala de espera em tempo real. Teste com várias abas.
2. **Jogo em rede**: motor no Durable Object, vistas por jogador, ações validadas, animações no cliente via `ui-mesa.js`.
3. **Torneio completo**: blinds pelo relógio, eliminação, tempo de ação, reconexão, bots opcionais, fim da partida e limpeza da mesa.
4. **Lacre do baralho + premiação/acerto + relatório do coach no fim.**
5. **Testes**: simulação automática com N clientes (casa) + roteiro de interface no navegador (trabalho) + partida real com amigos.

## Para preparar em casa

1. Instalar o Node.js LTS (nodejs.org) e o Git.
2. `git clone https://github.com/wellingtonm01989-beep/outs-treino-lab.git`
3. Criar conta gratuita na Cloudflare (dash.cloudflare.com) — não pede cartão.
4. Abrir a pasta no Claude Code e pedir para ler este arquivo.
5. Quando o servidor existir: `npx wrangler login` e `npx wrangler deploy` (dentro de `servidor/`).
6. Depois da primeira partida de teste publicada: abrir o painel da Cloudflare (Workers & Pages → o Worker → Métricas / Durable Objects) e anotar aqui quantas requisições e linhas gravadas uma partida gastou. Isso resolve a dúvida dos 20:1 e ajusta a tabela de estimativa.
