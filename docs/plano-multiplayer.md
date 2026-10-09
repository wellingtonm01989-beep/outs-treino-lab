# Plano: mesa com amigos (multiplayer)

Decidido em 09/10/2026. Este arquivo é o ponto de partida para quem continuar o trabalho (inclusive o Claude Code no computador de casa).

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

Alternativas descartadas: Firebase só com o celular do anfitrião como dealer (anfitrião poderia espiar e o jogo pausa se ele sair); Firebase + Cloud Functions (exige plano com cartão); app nativo (reescrever tudo e o convite por link fica pior).

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
- Tempo de ação: ~30 s; ao esgotar, check se possível, senão fold. Jogador desconectado: check/fold automático até voltar.

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
