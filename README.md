# OUTS · Treino Lab

Treinador de No-Limit Texas Hold'em em HTML, CSS e JavaScript puro, com um coach que ensina a matemática do jogo (outs, regra do 4 e do 2, pot odds, equity, EV, MDF, ICM) até ela ficar automática. Dinheiro fictício, só para treino.

## Como abrir

Dê duplo clique em `index.html`. Funciona offline, sem instalar nada e sem servidor.

Pela internet: https://wellingtonm01989-beep.github.io/outs-treino-lab/

## No celular

Abra o link no Chrome do celular e toque em ⋮ → **Instalar app** (ou "Adicionar à tela inicial"). O jogo abre em tela cheia, como um app, e funciona sem internet depois da primeira visita. No iPhone: Safari → Compartilhar → **Adicionar à Tela de Início**.

A mesa se ajusta ao celular em pé (mesa vertical, botões grandes embaixo) e deitado (ações numa coluna à direita).

## O que tem

- **Cash game, Sit & Go e torneio**, de 2 a 9 jogadores por mesa, do NL2 ao NL1000 e buy-ins de $1 a $1.050. No Sit & Go você escolhe quantos participam (uma mesa ou até 180 jogadores); no torneio, 45, 90 ou 180.
- **Várias mesas de verdade ao mesmo tempo**: todas jogam mão a mão, os jogadores mudam de mesa para equilibrar, as mesas vão se juntando até a final, e você pode assistir a qualquer mesa ao vivo e ver a classificação.
- **A partida não se perde**: se o app fechar (o celular encerra apps em segundo plano), ao abrir de novo você volta para a mesma partida.
- **Oponentes sorteados em cada partida**: profissionais (muito bons), regulares (medianos) e jogadores comuns (calling station, nit, TAG, LAG e maníaco), em proporções aleatórias. No heads-up o adversário pode ser de qualquer tipo. Os bots anotam o seu jogo (só o que é público) e se adaptam; todos percebem quem vai all-in com qualquer mão. O profissional ainda faz as contas de EV e ICM e para de blefar se você paga tudo.
- **Coach**: dicas sempre visíveis, só quando pedir, modo quiz ou desligado. No fim de cada partida, uma análise completa do desempenho.
- **Treino relâmpago, estatísticas, histórico com replay e auditoria do embaralhamento** (1.000.000 de baralhos testados).

## Testes

Abra `testes.html` no navegador para rodar todos os testes automáticos. `testes/celular.html` mostra o app em telas do tamanho de celulares.

## Mesa com amigos (em construção)

Sit & Go pela internet com um link para os amigos. O servidor fica em `servidor/` (Cloudflare Workers + Durable Objects) e precisa de Node para testar e publicar. O plano e o passo a passo estão em `docs/plano-multiplayer.md`.
