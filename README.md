# Academia do Tio Zé — protótipo das Eras 1 a 4

Tycoon casual de navegador: transforme a garagem herdada do Tio Zé em uma academia de sucesso.
Implementa a Era 1 (Garagem) descrita no documento de design e as passagens para a Era 2 (Ponto de bairro), a Era 3 (Academia completa) e a Era 4 (Rede).

## Como rodar

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # testes das fórmulas e mecânicas (node --test)
npm run build && npm start   # produção
```

## Controles

| Ação | Controle |
|---|---|
| Comprar | Loja → Comprar → clique na grade (verde = cabe, laranja = cabe mas sem corredor, vermelho = inválido) |
| Girar | `R` ou botão Girar |
| Mover (grátis) | arrastar o aparelho no mapa, botão Mover no painel do aparelho, ou setas do teclado |
| Modo edição (vender e ver a grade) | `E` ou botão Editar |
| Desfazer (só ações do dia) | `Ctrl+Z` |
| Visão de manutenção | `M` |
| Pausar / velocidades | `Espaço`, `1` `2` `3` |
| Limpar | clique numa sujeira e arraste por outras (combo) |
| Câmera | roda do mouse (zoom), arrastar (mover), botões de zoom/enquadrar |
| Dica do dia | clique no Whey (o gato) |
| Ampliar | botão Ampliar (planta com todos os terrenos) ou clique na placa do terreno cercado |
| Contratar equipe | aba Equipe → Contratar (faxineiro ou técnico); escolha os turnos de cada pessoa |

## Arquitetura

```
app/                 layout, página e estilos globais (Next.js App Router)
components/          React: HUD, loja, painéis, diálogos, canvas
config/gameConfig.json   TODOS os números de balanceamento
game/
  config.js          acesso ao JSON
  engine/            estado serializável, store (fonte única de verdade), persistência
  grid/              células, rotação, área de uso, validação de posicionamento
  pathfinding/       flood fill (BFS) a partir da porta
  simulation/        tempo por blocos, demanda × capacidade × fila, alunos, satisfação
  economy/           livro-caixa: toda mudança de saldo é uma transação identificável
  systems/           desgaste/limpeza, sugestões, personagens e marcos
  render/            estado visual compartilhado (director.js) e desenhos 2D (miniaturas, modo sem WebGL)
  render/three/      mundo 3D em Three.js: câmera isométrica, modelos low poly, seleção por raycast
  audio/             efeitos sintetizados (WebAudio)
tests/               testes de núcleo (fórmulas do documento)
```

- **Simulação independente de FPS:** o laço recebe tempo real, converte em frações de dia
  (8 s = 1 dia em ×1) e processa blocos inteiros (manhã 25%, tarde 20%, noite 55%).
- **Os sprites são renderizações dos números:** a quantidade de bonecos usando ou esperando em
  cada aparelho vem da estatística do bloco; caminhos vêm dos pais do BFS (sem pathfinding por aluno).
- **Cliente apenas:** o jogo é carregado com `dynamic(..., { ssr: false })`; localStorage e áudio
  só são acessados no navegador.
- **Mundo em 3D:** o mapa é renderizado com Three.js (`game/render/three/`), numa câmera ortográfica
  elevada em ângulo, com as mesmas cores do desenho 2D. A cena só lê o estado do jogo: terreno e paredes
  são refeitos quando os terrenos mudam, aparelhos quando mudam de tipo/nível, e os bonecos só se movem.
  Paredes da frente e da direita são baixas (corte de maquete) para mostrar o interior. Cliques usam
  raycast (aparelho atingido ou célula do chão). Textos (balões, valores) ficam numa camada 2D por cima.
  Sem WebGL2, o jogo volta sozinho para o mapa 2D.
- **Arte substituível:** cada aparelho 3D é uma receita em `game/render/three/models.js` e
  `moreEquipment.js` (peças simples juntadas numa malha só, com partes animadas separadas). `USE_SPOT`
  diz onde o aluno fica em cada aparelho e qual pose usa; aparelho e boneco seguem o mesmo ritmo
  (`RATE`), então o banco do remo desliza junto com o aluno e a barra do Smith desce com o agachamento. As miniaturas da interface continuam usando
  `draw(ctx, w, h, t, opts)` em `game/render/draw/equipment.js`.

## O que está implementado (Era 1)

Garagem 8×8 e cinco ampliações desenhadas (Quintal 4×8 R$ 800 → Puxadinho 4×4 R$ 1.500 →
Varanda 4×4 R$ 2.700; Quintal → Galpão 4×6 R$ 4.900 → Terraço 4×6 R$ 8.800). Depois disso as
**áreas são infinitas**: cada compra gera um terreno novo encostado no que foi comprado
(`game/systems/expansion.js`), escolhendo o encaixe que deixa a academia compacta (~1,5:1) e perto
da porta, sem nunca ocupar a faixa da porta até a rua. Preço = R$ 380 por tile × 1,12 a cada terreno
gerado (`grid.procedural` no JSON). A grade cresce junto (`syncLayout` em `game/grid/grid.js`). O
documento previa só as duas primeiras ampliações na Era 1; o resto foi pedido depois. Faxineiros contratáveis (até 3): cada um limpa até 6 sujeiras por turno
coberto, ao longo do bloco, com salário de R$ 600/mês por turno (+70% por turno extra), regra do Zelador
do documento antecipada da Era 2. Técnico(a) de manutenção (proposto, fora do documento): conserta ou
revisa até 2 aparelhos por turno sem cobrar peça (quebrados primeiro, depois os abaixo de 60%), mas
custa R$ 1.800/mês por turno (+80% por turno extra), R$ 1.500 na contratação e exige 2,5★.
31 itens (13 do documento + 2 decorações propostas + 16 aparelhos propostos depois: elíptico, remo,
simulador de escada, kettlebells, plataforma olímpica, saco de pancada, barra fixa, corda naval,
cadeira extensora, Smith, crossover, geladeira de isotônicos, caixa de som e estante de troféus), com
níveis de qualidade para os principais aparelhos; colisão,
limites, porta, parede para itens de parede, área de uso e acesso por flood fill; modo edição
com desfazer e reembolso total no mesmo dia; 3 perfis com necessidades, manias e aparência
variada; demanda por bloco, "segunda é dia de peito" e efeito Janeiro nas matrículas;
satisfação com os 5 fatores e pesos do documento; cancelamentos, matrículas, reputação,
avaliações e bônus de novidade; mensalidade com faixa justa; relatório mensal; Vovó Dalva
abaixo de −R$ 500; desgaste por uso, quebra, conserto/revisão e sujeira clicável; postais do
Tio Zé, Whey, Valéria Leão e Seu Armando; salvamento automático, exportação/importação validada
e progresso offline de até 3 dias sem quebrar aparelhos.

## Era 2: Ponto de bairro

Na aba Academia, "Rumo à Era 2" mostra as metas (60 alunos, 3,5★, 7 tipos de aparelho, 2 ampliações).
Batidas as metas, a mudança segue os cinco passos do documento (`game/systems/eras.js`):

1. **Planta antes de pagar:** o novo ponto 14×12 com Sala dos fundos 6×6 (R$ 4.000) e Sobreloja 8×6
   (R$ 9.000) à venda, já mostrando onde cada aparelho vai ficar.
2. **Mudança inteligente:** os aparelhos vão junto (nível e condição mantidos) e são reencaixados um a um,
   sempre com corredor até a frente de todos. O que não couber é vendido pelo preço pago.
3. **Cerimônia:** caminhão de mudança, corte de fita, postal do Tio Zé, o Whey inspecionando e o Seu Armando.
   No mapa, o caminhão fica na rua e a fita na porta durante o dia da inauguração.
4. **Um dia fechado:** sem mensalidade no dia da mudança.
5. **Bônus de novidade:** todos os alunos ganham +8 de satisfação por 7 dias.

O que muda na Era 2: caução de R$ 1.500, aluguel de R$ 1.500/mês, mensalidade base de R$ 55, matrículas
×1,4, equipe até 6 pessoas, perfil **Idoso** (treina de manhã, quer colchonete e bicicleta, toalhinha no
ombro e garrafa térmica), paredes cor de pêssego, porta com toldo listrado e letreiro pintado à mão.
A planta de cada era fica em `eras` no JSON; a grade (`syncLayout`) troca porta, tamanho e terrenos.
A garagem vira o Museu do Tio Zé só na história (não aparece no mapa).

## Era 3: Academia completa (início)

A mesma mudança em cinco passos leva do ponto de bairro para um prédio comprado e reformado. Metas: 150
alunos, 4★, 14 tipos de aparelho, as 2 ampliações do ponto, 3 pessoas na equipe e 10 idosos na turma da manhã.

- **Prédio 20×16** com Ala de aulas 8×8 (R$ 20.000) e Terraço do prédio 10×8 (R$ 45.000) à venda.
- **Economia:** compra do prédio e reforma por R$ 25.000; sem aluguel, mas R$ 800/mês de IPTU e manutenção;
  mensalidade base R$ 80; matrículas ×1,9; equipe até 10.
- **Perfil Influencer:** quer espelho, ring light e colchonete; sente pouco o preço (×0,5), tem pouca paciência
  com fila e repara mais na sujeira (×1,5; o Idoso ×1,3, como no documento). Anda com o celular, monta um
  tripé ao lado do aparelho e faz pose de selfie na fila.
- **Ring light de estúdio:** item novo que só aparece na loja a partir da Era 3 (`minEra` no JSON).
- **Visual:** prédio de vidro com montantes brancos, porta de vidro de correr e letreiro neon.

Os textos da cerimônia e do mural de cada era ficam em `ERA_CEREMONY` e `ERA_MESSAGES` (`game/content/lines.js`);
as metas, em `eras[n].goals` no JSON.

## Era 4: Rede

Sem mudança de lugar (seção 15 do documento): o prédio vira a **Matriz** e a visão se abre para o **mapa da
cidade** (botão "Mapa da cidade" e aba Rede). Metas: 200 alunos, 4,2★, 18 tipos de aparelho, 3 ampliações,
6 pessoas na equipe e 12 influencers. Custa R$ 30.000; mensalidade base R$ 110; equipe até 14; sem dia fechado.

- **Filiais semiautomáticas** (`game/systems/network.js`): o jogador só mexe nos aparelhos da Matriz. Cada filial
  rende membros × mensalidade − custos, todo dia, inclusive offline. Os membros caminham (8%/dia) até a meta:
  capacidade do estilo × nota do gerente × reputação da Matriz × preço (mensalidade da Matriz contra a base de
  R$ 110) × procura do bairro (+20% se o bairro gosta do estilo) × Matriz Histórica.
- **Estilos** (pacotes do documento): Acolhedora, Hardcore, Família e Premium, com capacidade, multiplicador de
  mensalidade e custo de operação próprios. Trocar de estilo custa R$ 2.500 e assusta 25% dos membros.
- **Gerentes:** pool de 3 candidatos por mês, nota de 1 a 5★, salário pela nota e um defeito engraçado.
- **Lotes infinitos:** sempre 2 lotes à venda no mapa; cada filial aberta faz surgir outro (R$ 20.000 × 1,45 por
  filial aberta, ajustado pelo bairro). Reforma da filial em 3 níveis (capacidade ×1,5 e ×2). Vender devolve 50%.
- **Matriz Histórica:** a garagem volta no mapa e dá +5% de membros em todas as filiais.
- **Oito estilos:** Acolhedora, Hardcore, Família, Premium, Funcional, Luta, Zen e Express 24h. Cada um tem
  capacidade, mensalidade, custo, ritmo de crescimento (`growth`), aparelhos (`kit`), perfis de aluno e cara
  própria (parede, porta, piso). 16 bairros, cada um com o estilo que prefere e um tipo de cidade; 4 lotes à venda.
- **Ver a filial** (botão "Ver" na aba Rede ou "Ver a filial" na ficha): a filial aparece em 3D como a Matriz,
  com prédio do tamanho do nível, aparelhos do estilo, a gerente atrás da recepção e os membros treinando
  conforme o horário. É só para olhar: lá quem manda é o gerente (`game/systems/branchScene.js` monta a cena;
  o desenho troca a grade por um instante com `withLayout`). Esc volta; ← e → passam de filial.
- **Personagens:** o Tio Zé volta de surpresa na cerimônia; a Valéria manda uma cesta a cada filial aberta.
- **Visual:** bandeirinhas na fachada da Matriz, letreiro "matriz da rede" e mapa com bandeirinhas nas filiais.

## Pedidos depois do documento

- **Cidade em volta** (`game/render/cityLayout.js` + `game/render/three/cityscape.js`): ruas em grade, quarteirões
  com casas, sobrados, lojas com toldo e letreiro, prédios, torres, galpões, praças, rio com ponte, postes que
  acendem à noite, carros passando e pedestres. O bairro muda com a era (casas na garagem, comércio no ponto,
  centro no prédio, com a MegaFit do outro lado da rua e o Museu/Matriz Histórica ao lado) e, nas filiais, com o bairro.

- **Níveis 1 a 3 em todos os aparelhos** (`levels` no JSON): melhorar custa 50% e depois 100% do preço do
  aparelho; dá +25%/+50% de capacidade (ou de Vibe na decoração) e desgaste 10%/20% menor. Em troca, conserto e
  revisão custam 1,6× e 2,4×. Estrelinhas douradas no aparelho mostram o nível. Separado de usado/novo/profissional.
- **Vender** sempre visível no painel do aparelho (e tecla Delete), com desfazer no mesmo dia; as melhorias entram no valor.
- **Teto da mensalidade por era** (`feeSlider.maxByEra`): R$ 90, R$ 140, R$ 200 e R$ 280.
- **Expansão para os dois lados:** sempre há um terreno à venda à esquerda e outro à direita do prédio principal.
  Quando nasce um terreno à esquerda da coluna 0, a planta inteira anda para a direita (`state.shift`), junto com
  aparelhos, sujeira, porta e câmera.

## Limitações conhecidas / adiado de propósito

- **Aulas coletivas na Ala de aulas, afinidade de estilo na Matriz, andar de cima de verdade, instrutores e
  recepção, planos e suplementos** não estão implementados. Na Era 2, "instrutor no turno"
  ainda não é necessidade do Iniciante (não há instrutores). Eventos entre unidades da rede (o documento diz que ainda
  precisam ser especificados) também não existem.
- **Progresso offline** continua limitado a 3 dias, também para as filiais.
- **Efeito Janeiro:** só o multiplicador de matrículas (×2,5). A "Motivação que decai" ainda não existe.
- **Verão, apagão e outros eventos sazonais:** ainda não implementados.
- **Afinidade de estilo** (Acolhedora/Hardcore/Família/Premium) e **energia** (opcional no documento)
  ainda não existem; a Vibe usa decoração, ventilação, bebedouro e adjacência.
- **Capacidades** de máquina de peito, puxador, leg press e vestiário são propostas do documento
  (marcadas "em teste"). Os preços dos níveis novo/profissional de esteira e bike seguem a proporção do supino.
- Toque funciona para clicar e arrastar; não há gesto de pinça (use os botões de zoom).
- Sem WebGL 2 o jogo cai para a vista 2D de reserva (`game/render/renderer.js`).
