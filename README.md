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

## Truco paulista e paranaense

Na aba **Truco**: 1 contra 1 ou em dupla (você e um parceiro bot contra dois), com vira e manilhas, carta coberta, mão de 11, mão de ferro e os sinais do parceiro. Partida até 12 pontos, sem dinheiro.

- **Paulista**: truco, seis, nove e doze.
- **Paranaense** (regulamento da Federação Paranaense de Truco): truco e retruco (retruco só até 8 pontos), troca de cartas entre os parceiros na mão de 11, três empates na mão de 11 dão os pontos a quem não está com 11 e, depois de um truco, o empate fica com quem pediu no escuro.
- **Torneio** mata-mata contra bots: você escolhe as regras, 1 contra 1 ou duplas, quantos participantes (de 2 a 64) e se cada confronto é uma partida ou melhor de 3. Os outros jogos da chave são partidas de verdade entre os bots, jogadas na hora.
- **Esconder a manilha** (treino): a mesa não diz qual é a manilha; você descobre pela vira e confere no resumo do fim da mão.

- **Coach para quem está aprendendo**: na sua vez, a chance de ganhar a mão com cada carta (simulando as cartas que você não vê), qual jogar e se vale pedir truco — com a conta do blefe. Quando pedem truco para você, a chance mínima para aceitar (correr custa 1, aceitar arrisca 3 → 33%; no seis 25%), corrigida pelo placar perto do fim. Nota em cada decisão e resumo no fim da partida.
- **Bots** Cauteloso, Esperto e Trucador, sorteados a cada partida. Eles só enxergam as próprias cartas e o que está na mesa; o Esperto repara se você corre muito e blefa mais.
- **Como jogar** com as cartas na tela e **treino de cartas** (qual é a manilha, qual carta ganha).
- A partida fica salva no começo de cada mão: se o app fechar, ela volta.

## Testes

Abra `testes.html` no navegador para rodar todos os testes automáticos. `testes/celular.html` mostra o app em telas do tamanho de celulares.

## Mesa com amigos (em construção)

Sit & Go pela internet com um link para os amigos. O servidor fica em `servidor/` (Cloudflare Workers + Durable Objects) e precisa de Node para testar e publicar. O plano e o passo a passo estão em `docs/plano-multiplayer.md`.
