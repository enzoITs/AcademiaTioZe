# Academia do Tio Zé — protótipo da Era 1

Tycoon casual de navegador: transforme a garagem herdada do Tio Zé em uma academia de sucesso.
Implementa a Era 1 (Garagem) descrita no documento de design.

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
| Contratar faxineiros | aba Equipe → Contratar; escolha os turnos de cada pessoa |

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
  render/            renderizador Canvas 2D, biblioteca vetorial de aparelhos e pessoas
  audio/             efeitos sintetizados (WebAudio)
tests/               testes de núcleo (fórmulas do documento)
```

- **Simulação independente de FPS:** o laço recebe tempo real, converte em frações de dia
  (8 s = 1 dia em ×1) e processa blocos inteiros (manhã 25%, tarde 20%, noite 55%).
- **Os sprites são renderizações dos números:** a quantidade de bonecos usando ou esperando em
  cada aparelho vem da estatística do bloco; caminhos vêm dos pais do BFS (sem pathfinding por aluno).
- **Cliente apenas:** o jogo é carregado com `dynamic(..., { ssr: false })`; localStorage e áudio
  só são acessados no navegador.
- **Arte substituível:** cada aparelho é uma função `draw(ctx, w, h, t, opts)` em
  `game/render/draw/equipment.js`, que pode ser trocada por sprites sem mexer na lógica.

## O que está implementado (Era 1)

Garagem 8×8 e cinco ampliações desenhadas (Quintal 4×8 R$ 800 → Puxadinho 4×4 R$ 1.500 →
Varanda 4×4 R$ 2.700; Quintal → Galpão 4×6 R$ 4.900 → Terraço 4×6 R$ 8.800). Depois disso as
**áreas são infinitas**: cada compra gera um terreno novo encostado no que foi comprado
(`game/systems/expansion.js`), escolhendo o encaixe que deixa a academia compacta (~1,5:1) e perto
da porta, sem nunca ocupar a faixa da porta até a rua. Preço = R$ 380 por tile × 1,12 a cada terreno
gerado (`grid.procedural` no JSON). A grade cresce junto (`syncLayout` em `game/grid/grid.js`). O
documento previa só as duas primeiras ampliações na Era 1; o resto foi pedido depois. Faxineiros contratáveis (até 3): cada um limpa até 6 sujeiras por turno
coberto, ao longo do bloco, com salário de R$ 600/mês por turno (+70% por turno extra), regra do Zelador
do documento antecipada da Era 2. 15 itens (13 do documento +
2 decorações propostas), com 3 níveis de qualidade para esteira, bicicleta e supino; colisão,
limites, porta, parede para itens de parede, área de uso e acesso por flood fill; modo edição
com desfazer e reembolso total no mesmo dia; 3 perfis com necessidades, manias e aparência
variada; demanda por bloco, "segunda é dia de peito" e efeito Janeiro nas matrículas;
satisfação com os 5 fatores e pesos do documento; cancelamentos, matrículas, reputação,
avaliações e bônus de novidade; mensalidade com faixa justa; relatório mensal; Vovó Dalva
abaixo de −R$ 500; desgaste por uso, quebra, conserto/revisão e sujeira clicável; postais do
Tio Zé, Whey, Valéria Leão e Seu Armando; salvamento automático, exportação/importação validada
e progresso offline de até 3 dias sem quebrar aparelhos.

## Limitações conhecidas / adiado de propósito

- **Eras 2–4, funcionários além do faxineiro (instrutores, recepção, técnico), pool de candidatos,
  planos, aulas, suplementos e filiais** não estão implementados. O painel
  "Rumo à Era 2" mostra metas de referência, sem mudança de era.
- **Efeito Janeiro:** só o multiplicador de matrículas (×2,5). A "Motivação que decai" ainda não existe.
- **Verão, apagão e outros eventos sazonais:** ainda não implementados.
- **Afinidade de estilo** (Acolhedora/Hardcore/Família/Premium) e **energia** (opcional no documento)
  ainda não existem; a Vibe usa decoração, ventilação, bebedouro e adjacência.
- **Capacidades** de máquina de peito, puxador, leg press e vestiário são propostas do documento
  (marcadas "em teste"). Os preços dos níveis novo/profissional de esteira e bike seguem a proporção do supino.
- Toque funciona para clicar e arrastar; não há gesto de pinça (use os botões de zoom).
- O pacote `three` está instalado (pedido anterior), mas o jogo não o usa: a vista é 2D.
