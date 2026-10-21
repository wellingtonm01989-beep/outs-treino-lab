# OUTS · Treino Lab

Treinador de No-Limit Texas Hold'em em HTML, CSS e JavaScript puro, com um coach que ensina a matemática do jogo (outs, regra do 4 e do 2, pot odds, equity, EV, MDF, ICM) até ela ficar automática. Dinheiro fictício, só para treino.

## Como abrir

Dê duplo clique em `index.html`. Funciona offline, sem instalar nada e sem servidor.

Pela internet: https://wellingtonm01989-beep.github.io/outs-treino-lab/

## No celular

Abra o link no Chrome do celular e toque em ⋮ → **Instalar app** (ou "Adicionar à tela inicial"). O jogo abre em tela cheia, como um app, e funciona sem internet depois da primeira visita. No iPhone: Safari → Compartilhar → **Adicionar à Tela de Início**.

A mesa se ajusta ao celular em pé (mesa vertical, botões grandes embaixo) e deitado (ações numa coluna à direita).

No celular, as abas ficam embaixo; xadrez, damas e trilha estão juntos na aba **Tabuleiro**, e estatísticas, histórico e auditoria em **Mais**.

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
- **Bots** Cauteloso, Esperto e Trucador, sorteados a cada partida. Eles só enxergam as próprias cartas e o que está na mesa, mas aprendem o seu jeito de jogar (quanto você blefa, quanto corre) e **lembram de uma partida para outra** — dá para apagar essa memória no lobby. Blefam na medida (pedido de truco não quer dizer zap) e às vezes seguram mão forte.
- **Mesa** no mesmo visual da mesa do poker, com o painel do coach ao lado no PC.
- **Como jogar** com as cartas na tela e **treino de cartas** (qual é a manilha, qual carta ganha).
- A partida fica salva no começo de cada mão: se o app fechar, ela volta.

## Cacheta

Na aba **Cacheta**: dois baralhos, 9 cartas para cada um, de 2 a 6 jogadores contra bots. A vira define o curinga (a carta logo acima dela: mesmo naipe, mesma cor ou sem curinga). Junte a mão em trincas (mesmo valor, naipes diferentes) e sequências (mesmo naipe, o Ás antes do 2 ou depois do K). Compre do monte ou pegue a do lixo e descarte uma; bata com 9 (cada um perde 1 vida) ou com 10 (perde 2). Quem fica sem vidas sai; ganha o último na mesa. Vidas: 3, 5, 7 ou 10.

- **Furar a fila** (opção): quem bate com a carta que alguém acabou de descartar pode pegá-la fora da vez.
- **A sua mão arrumada** em jogos (os jogos juntos e as soltas no fim), por naipe ou por valor; cada jogador mostra o que pegou do lixo e, se quiser, o que descartou.
- **Bots** Calculista, Arrojado e Cauteloso, em três níveis. No Mestre eles contam as cartas (as duas cópias de cada uma), pesam quantas das que ainda podem vir ajudam cada descarte — numa chance de ganhar a mão ajustada em milhares de jogadas simuladas — e sabem a hora de esperar a batida de 10.
- **Coach**: se vale pegar a carta do lixo, qual descartar (os seus jogos, quantas cartas faltam, quais ajudam e quantas cópias ainda podem vir), o perigo de a carta fechar a batida do próximo, quando bater e quando esperar a de 10 — e a nota de cada jogada.

## Última! (cartas coloridas)

Na aba **Última!**: o jogo das cartas coloridas (no estilo do Uno), de 2 a 6 jogadores contra bots. Combine a cor, o número ou o símbolo da carta da mesa; Pular, Inverter, +2, coringa e coringa +4 (só sem a cor da mesa). Ao ficar com uma carta, aperte **Última!** — se um bot esquecer, aperte **Pegou!**. Partida de uma mão, até 200 ou até 500 pontos.

- **A mesa não entrega o jogo**: as cartas que servem não ficam destacadas, cada carta comprada é um toque em Comprar (até nos +2 e +4) e, depois de comprar, você decide se joga ou passa.
- **+2 e +4 passam adiante**: quem recebe pode jogar outro +2 ou +4 em cima (vale +2 sobre +4) e o próximo compra tudo.
- **Regras da casa** opcionais: comprar até poder jogar e jogar cartas iguais juntas (vários números iguais de uma vez).
- **Bots** Estrategista, Atacante e Paciente, em três níveis. No Mestre eles leem o que cada um tem pelo que compra e pelas cores que escolhe, e simulam cada jogada até o fim da mão.
- **Coach**: a chance de ganhar a mão com cada jogada, a melhor e por quê (quem está perto de sair, que cor o próximo não tem, quando guardar o coringa, quando jogar as iguais juntas), e a nota de cada jogada.

## Xadrez

Na aba **Xadrez**: contra bots de 5 níveis (do Iniciante, que olha um lance à frente, ao Mestre, que calcula vários lances por alguns segundos). Todas as regras: roque, en passant, promoção, xeque-mate, afogamento, repetição, 50 lances e material insuficiente; notação em português (R, D, T, B, C).

- **Coach**: seta com o melhor lance, barra de avaliação, o que está ameaçado, peças soltas, ideias de abertura e a nota de cada lance seu (de "melhor lance" a "erro grave", com o que o adversário faz depois).
- **Treino**: desfazer lances, jogar sem relógio ou com relógio (10 min, 5+3, 3+2), virar o tabuleiro. Mova tocando na peça e na casa, ou arrastando.
- O bot pensa em segundo plano (a tela não trava) e varia as aberturas.

## Damas

Na aba **Damas**: damas brasileiras (regras da Confederação Brasileira) contra bots de 5 níveis, do Iniciante ao Mestre. A pedra anda para frente e come para frente e para trás; a captura é obrigatória e vale a **lei da maioria** (o lance que come mais peças); a dama corre a diagonal inteira; coroação só parando na última fila; empates por 20 lances só de damas, pelos finais de 5 lances e pela repetição.

- **Coach**: seta com o melhor lance (e o caminho das capturas), barra de avaliação, o golpe (entregar pedra para comer mais), o que o adversário ameaça comer e a nota de cada lance seu.
- **Mover**: toque na peça e na casa; nas capturas de várias peças, toque nas casas onde ela cai — ou direto na última, se só houver um caminho. As peças que têm de comer piscam.
- **Treino**: desfazer lances e virar o tabuleiro. A partida fica salva a cada lance.

## Trilha

Na aba **Trilha**: o jogo do moinho, com 9 peças para cada um, contra bots de 5 níveis. Coloque as peças, depois mova para a casa vizinha; três em linha (uma **trilha**) tiram uma peça do adversário — não a que está numa trilha, a não ser que todas estejam. Com 3 peças, **voar** para qualquer casa (opção, ligada por padrão). Perde quem fica com 2 peças ou sem lance.

- **Coach**: o melhor lance com seta (e qual peça tirar), as trilhas que o adversário ameaça fechar, como tapar, a trilha dupla (duas ameaças de uma vez) e o moinho (abrir e fechar a mesma trilha), a avaliação e a nota de cada lance seu.
- **Treino**: desfazer lances. A partida fica salva a cada lance.

## Testes

Abra `testes.html` no navegador para rodar todos os testes automáticos. `testes/celular.html` mostra o app em telas do tamanho de celulares.

## Mesa com amigos (em construção)

Sit & Go pela internet com um link para os amigos. O servidor fica em `servidor/` (Cloudflare Workers + Durable Objects) e precisa de Node para testar e publicar. O plano e o passo a passo estão em `docs/plano-multiplayer.md`.
