// Textos do jogo: falas, nomes, avaliações e postais. O humor ri do universo
// da academia, nunca de grupos de pessoas.

export const FIRST_NAMES = [
  'Rafael', 'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara',
  'João', 'Kátia', 'Lucas', 'Marina', 'Nilton', 'Olívia', 'Paulo', 'Quésia', 'Renata', 'Sérgio',
  'Tainá', 'Ubiratan', 'Vânia', 'Wesley', 'Yasmin', 'Zeca', 'Aline', 'Benedito', 'Cida', 'Davi',
  'Edu', 'Fernanda', 'Gilson', 'Helô', 'Ivo', 'Jussara', 'Kauã', 'Lúcia', 'Moacir', 'Nanda',
  'Otávio', 'Priscila', 'Rosa', 'Samuel', 'Tereza', 'Valter', 'Wagner', 'Ximena', 'Yuri', 'Zuleide',
  'Akira', 'Bia', 'Chico', 'Dandara', 'Enzo', 'Flávia', 'Guto', 'Hana', 'Igor', 'Jade',
];

export const EQUIPMENT_SHORT = {
  esteira: 'esteira', bicicleta: 'bike', supino: 'supino', halteres: 'halteres',
  rack_agachamento: 'rack', colchonete: 'colchonete', maquina_peito: 'máquina de peito',
  puxador: 'puxador', leg_press: 'leg press', bebedouro: 'bebedouro', ventilador: 'ventilador',
  espelho: 'espelho', vestiario: 'vestiário', planta: 'plantinha', poster: 'pôster',
  eliptico: 'elíptico', remo: 'remo', escada: 'simulador de escada', kettlebell: 'kettlebell',
  plataforma: 'plataforma', saco_pancada: 'saco de pancada', barra_fixa: 'barra fixa',
  corda_naval: 'corda naval', extensora: 'extensora', smith: 'smith', crossover: 'crossover',
  ring_light: 'ring light', geladeira: 'geladeira de isotônicos', caixa_som: 'caixa de som', trofeus: 'estante de troféus',
  piscina: 'piscina', pista_corrida: 'pista de corrida', ringue: 'ringue', banheira_gelo: 'banheira de gelo', sauna: 'sauna',
  recepcao: 'recepção', escada_filial: 'escada',
  maquina_gluteo: 'máquina de glúteo', abdominal: 'máquina de abdominal', polia: 'polia', flexora: 'flexora',
  panturrilha: 'panturrilha', voador: 'voador', abdutora: 'abdutora', desenvolvimento: 'desenvolvimento',
  hack_squat: 'hack', multiestacao: 'multiestação', hip_thrust: 'hip thrust', graviton: 'graviton',
};

// Conversa de quem treina em cada estilo de filial (balões na visita à filial).
export const STYLE_CHATTER = {
  acolhedora: ['Que cheirinho de café!', 'Aqui todo mundo sabe meu nome.', 'Vim pelo sofá, fiquei pela esteira.', 'O gerente me deu bom-dia duas vezes!'],
  hardcore: ['Mais uma série!', 'Cadê o giz?', 'Hoje é dia de perna, não tem desculpa.', 'Essa música dá força!'],
  familia: ['Mãe, olha eu na bike!', 'Enquanto as crianças brincam, eu treino.', 'Aqui até o vovô corre!', 'Domingo tem gincana!'],
  premium: ['A toalha está geladinha!', 'Que vista, gente.', 'Espelho com luz, foto garantida.', 'Vale cada centavo.'],
  funcional: ['Bora, turma, mais uma rodada!', 'A corda naval me venceu hoje.', 'Burpee de novo?!', 'Treino em grupo é outro nível.'],
  luta: ['Jab, direto, esquiva!', 'O saco de pancada que lute.', 'Ganhei a faixa nova!', 'Bandagem bem apertada, bora.'],
  zen: ['Inspira... expira...', 'Que plantinha linda.', 'Minha coluna agradece.', 'Silêncio bom, né?'],
  express: ['Treino rápido antes do trabalho!', 'Meia-noite e a esteira livre.', 'Pagou pouco, treinou muito.', 'Entro, treino, saio. Perfeito.'],
};

// Mensagens do mural e quadros da cerimônia em cada mudança de era.
export const ERA_MESSAGES = {
  2: [
    ['tioze', 'Sobrinho(a), ponto de bairro com letreiro e tudo! A garagem vira o Museu do Tio Zé: deixei lá o caderno e as fotos. Agora tem aluguel, então cuida do caixa.'],
    ['armando', 'Mudou?! Finalmente vou dormir em paz. ...Peraí, esse ponto não é aqui na esquina?'],
    ['valeria', 'Ponto próprio de bairro? Agora sim é concorrência. Bem-vindo(a) ao clube, vizinho(a)!'],
  ],
  3: [
    ['tioze', 'Um prédio inteiro, sobrinho(a)! Com fachada de vidro! Eu chorei no barco. Pendura a placa antiga no museu, que ela merece.'],
    ['armando', 'Letreiro neon?! Vai piscar na minha janela a noite toda! ...Minha neta tirou foto na frente. Ficou bonito, tá.'],
    ['valeria', 'Prédio próprio e terraço no projeto? Ok, vizinho(a), agora a MegaFit está oficialmente preocupada. Parabéns. De verdade.'],
  ],
  4: [
    ['tioze', 'VOLTEI, sobrinho(a)! Larguei a vara de pescar no meio do robalo para ver a inauguração da rede. A garagem virou Matriz Histórica: o caderno está lá, aberto na primeira página.'],
    ['armando', 'Rede?! Vai ter Tio Zé em cada esquina agora? ...Abre uma perto da casa da minha neta, então.'],
    ['valeria', 'Uma rede de verdade, vizinho(a)! Agora é MegaFit contra Tio Zé no mapa da cidade. Que vença a melhor recepção.'],
  ],
  5: [
    ['tioze', 'Um CENTRO ESPORTIVO, sobrinho(a)! Piscina, ringue, pista... Eu só tinha um supino e um rádio de pilha. A Duda Raio topou ser nossa embaixadora: escuta o que ela fala, que ela sabe.'],
    ['duda', 'Oi! Sou a Duda, três vezes campeã brasileira nos 400 m. Atleta de verdade vai aparecer de manhã cedo: quer pista, plataforma e banheira de gelo. E as filiais? Agora dá para entrar e montar cada uma, até construir andar.'],
    ['valeria', 'Um complexo esportivo?! Vizinho(a), a MegaFit vai precisar de uma reunião de emergência. Parabéns. De novo. Que raiva.'],
    ['armando', 'Arquibancada?! Vai ter torcida gritando aqui do lado? ...Guarda um lugar na frente para mim e para a minha neta.'],
  ],
};

// Falas da Era 4: cesta da Valéria a cada filial aberta e reações do Tio Zé.
export const BRANCH_LINES = {
  valeria: [
    (name) => `Cesta de presente para a ${name}! Tem toalhinha, garrafinha e um bilhete: "boa sorte, mas não muita".`,
    (name) => `Mandei uma cesta para a ${name}. O smoothie é de couve: se ninguém tomar, eu entendo.`,
    (name) => `${name}, é? Lindo letreiro. A cesta chega amanhã, com um vale-aula na MegaFit, claro.`,
    (name) => `Mais uma filial! A ${name} ganhou cesta, laço e um cartão assinado "sua rival preferida".`,
  ],
  tioze: [
    (name) => `${name} aberta! Pendura uma foto minha na recepção, que dá sorte.`,
    (name) => `Sobrinho(a), a ${name} tem que ter café passado para o gerente. Gerente feliz, aluno feliz.`,
    (name) => `Mais uma bandeirinha no mapa: ${name}! Quando eu era Mister Bairro, o bairro era um só.`,
  ],
};

// Gerentes de filial: qualidade + defeito engraçado (seção 14 do documento).
export const MANAGER_TRAITS = [
  'ótimo(a) com planilha, mas atende o celular no meio da reunião',
  'lembra o nome de todo aluno, mas esquece a chave todo dia',
  'monta escala perfeita, mas só fala em caixa alta no grupo',
  'organiza tudo por cor, inclusive as reclamações',
  'faz a melhor recepção da cidade, mas conta a mesma piada há 12 anos',
  'nunca falta, mas leva o cachorro para o trabalho',
  'negocia com fornecedor como ninguém, mas chora no fim de todo mês',
  'motiva a equipe com discurso, mas o discurso dura 40 minutos',
];

export const ERA_CEREMONY = {
  2: {
    truck: 'Cada aparelho foi encaixado no novo ponto pela mudança inteligente. Se quiser, ajuste depois no modo edição: mover é grátis.',
    ribbon: 'O bairro inteiro veio ver o letreiro novo.',
    tioze: 'Sobrinho(a), ponto de bairro com letreiro pintado à mão! A garagem vira o Museu do Tio Zé, com o caderno e as fotos. Agora tem aluguel: fecha o caixa todo mês e não esquece da turma da manhã, que chega gente nova por aí.',
    whey: 'Miau. (O Whey cheirou cada canto, aprovou o piso e já escolheu o lugar da soneca: bem do lado da porta.)',
    armando: '“Mudou de endereço e o barulho veio junto?! ...Tá, o letreiro ficou bonito. Minha neta disse que vai se matricular.”',
  },
  3: {
    truck: 'A reforma derrubou as paredes e o caminhão trouxe tudo: cada aparelho já tem lugar no prédio novo. Sobrou espaço de sobra para crescer.',
    ribbon: 'Fachada de vidro, letreiro neon e o bairro inteiro na calçada. Tem até gente filmando para a internet.',
    tioze: 'Sobrinho(a), um prédio! O Mister Bairro 1987 nunca sonhou tão alto. A placa pintada à mão foi para o museu, do lado do meu caderno. Agora chega uma turma que vive de foto: capricha no espelho e na luz.',
    whey: 'Miau! (O Whey subiu na recepção nova, se viu refletido no vidro e passou dez minutos encarando o outro gato.)',
    armando: '“Neon, vidro, terraço... Isso aqui virou shopping? ...Pelo menos o barulho ficou lá dentro. Parabéns, vizinho(a).”',
  },
  4: {
    city: 'Sem caminhão desta vez: o prédio fica onde está e vira a Matriz. A visão se abre para o mapa da cidade, com bandeirinhas onde a rede chegar.',
    ribbon: 'Fita cortada na porta da Matriz, com o bairro inteiro de camiseta amarela.',
    tioze: 'SURPRESA! O Tio Zé voltou da praia para a inauguração da rede, de regata amarela nova e tudo. “Sobrinho(a), a garagem virou Matriz Histórica e dá uma força para todas as filiais. Agora é cada bairro com a sua academia: escolhe bem o gerente!”',
    whey: 'Miau. (O Whey subiu no mapa da cidade, deitou bem em cima da Matriz e se recusa a sair.)',
    valeria: '“Uma rede, vizinho(a)?! Mandei a primeira cesta de presente. Agora é MegaFit contra Tio Zé no mapa inteiro. Que vença a melhor recepção!”',
  },
  5: {
    truck: 'Três caminhões desta vez! Cada aparelho ganhou lugar no ginásio principal do complexo, e ainda sobra quadra para crescer: parque aquático, ginásio de lutas e pista coberta estão à venda.',
    ribbon: 'Fita cortada no meio da quadra, com a arquibancada lotada e a bateria da escola de samba do bairro.',
    tioze: 'Sobrinho(a), da garagem ao Centro Esportivo! Guardei a foto da primeira esteira no bolso da camisa para hoje. Agora as filiais também são suas para montar: entra em cada uma, arruma do seu jeito e, quando faltar espaço, constrói para cima.',
    whey: 'Miau! (O Whey correu a pista inteira, parou na beira da piscina, olhou para a água com desconfiança e voltou para a arquibancada.)',
    armando: '“Arquibancada, piscina, pista... Isso aqui virou Olimpíada? ...Minha neta já pediu matrícula na natação. Parabéns, vizinho(a).”',
    duda: 'Duda Raio chegou de agasalho da seleção: “Prazer, sou a embaixadora do Centro! Atleta de verdade treina cedo e cobra estrutura: pista, plataforma olímpica e banheira de gelo. Se tiver piscina e ringue, aí eu trago a equipe inteira.”',
  },
};

export const CATEGORY_SHORT = { cardio: 'cardio', peso: 'peso', funcional: 'funcional' };

// Reclamações por tipo, com variação por perfil.
export const COMPLAINTS = {
  missingEssential: {
    iniciante: (it) => `Cadê a ${it}? Eu não sei usar o resto...`,
    marombeiro: (it) => `Sem ${it} hoje, mano... tá difícil.`,
    corredor: (it) => `Cadê ${it}?! Bora, bora, bora!`,
    idoso: (it) => `Cadê ${it}, meu bem? O médico mandou.`,
    influencer: (it) => `Sem ${it} não dá foto, amor.`,
    atleta: (it) => `Sem ${it} eu perco a temporada, treinador(a)!`,
  },
  missingDesired: {
    iniciante: (it) => `Seria tão bom ter ${it}...`,
    marombeiro: (it) => `Um ${it} ia cair bem, hein.`,
    corredor: (it) => `Faltou ${it} pra ficar perfeito.`,
    idoso: (it) => `Com ${it} minhas costas iam agradecer.`,
    influencer: (it) => `Com ${it} esse fundo ia bombar nos stories.`,
    atleta: (it) => `Com ${it} eu baixava meu tempo, certeza.`,
  },
  queue: {
    iniciante: (cat) => `Tem gente demais no ${cat}... vou esperar.`,
    marombeiro: (cat) => `Fila no ${cat}?! Perdi o pump.`,
    corredor: (cat) => `Fila no ${cat}, tudo bem, aqueço aqui.`,
    idoso: (cat) => `Fila no ${cat}? Sem pressa, aproveito e converso.`,
    influencer: (cat) => `Fila no ${cat}?! Perdi a luz boa da tarde.`,
    atleta: (cat) => `Fila no ${cat}? Meu treino tem cronômetro, gente!`,
  },
  broken: (it) => `O ${it} quebrou! Alguém chama o Tio Zé?`,
  dirty: 'Eca, pisei numa poça de suor.',
  price: 'Tá salgada essa mensalidade, hein.',
  vibe: 'Falta um clima aqui, sabe?',
  mania: {
    precisa_espelho: 'Sem espelho não sei se a postura tá certa!',
    odeia_lotacao: 'Lotado assim eu não consigo treinar.',
    halter_favorito: 'Cadê o meu halter favorito?!',
    calorento: 'Tá um forno aqui! Cadê o ventilador?',
  },
};

export const PRAISES = [
  'Amo treinar aqui!',
  'Hoje o treino rendeu!',
  'Que academia gostosinha.',
  'Melhor garagem do bairro!',
  'Já indiquei pra minha tia.',
];

export const FINALLY_LINES = ['Finalmente!', 'Eba, chegou!', 'Agora sim!', 'Até que enfim!'];

// Motivos de cancelamento, pelo fator de menor nota.
export const CANCEL_REASONS = {
  needs: ['volto quando tiver o que eu preciso', 'faltou aparelho pra mim', 'vou procurar uma com mais coisa'],
  queue: ['cansei de esperar na fila', 'muita fila, pouco treino', 'volto na segunda (mentira)'],
  condition: ['o aparelho rangeu e eu fugi', 'tá tudo meio quebrado', 'pisei numa toalha suada'],
  vibe: ['faltou um clima', 'muito barulho pro meu gosto', 'tá calor demais'],
  price: ['tá caro pra uma garagem', 'a mensalidade apertou', 'achei um preço melhor'],
};

export const FACTOR_LABELS = {
  needs: 'Necessidades',
  queue: 'Filas',
  condition: 'Condição e limpeza',
  vibe: 'Vibe e conforto',
  price: 'Preço justo',
};

export const REVIEW_GOOD = {
  needs: 'tem tudo que eu preciso',
  queue: 'nunca pego fila',
  condition: 'tudo limpinho e funcionando',
  vibe: 'clima ótimo',
  price: 'preço justo',
};

export const REVIEW_BAD = {
  needs: 'mas falta aparelho',
  queue: 'mas a fila da noite é longa',
  condition: 'mas o equipamento está cansado',
  vibe: 'mas falta um ventiladorzinho',
  price: 'mas a mensalidade pesou',
};

// Jeitinho de cada faxineiro(a): só personalidade, sem efeito no jogo.
export const STAFF_TRAITS = [
  'canta pagode enquanto passa o pano',
  'deixa tudo cheirando a lavanda',
  'conversa com o Whey como se fosse gente',
  'organiza os halteres por cor',
  'chama todo aluno de "campeão"',
  'tira foto do chão limpo pra mandar pra família',
];

export const WHEY_TIPS = {
  broken: (it) => `Miau. (O Whey está encarando o ${it} quebrado. Um clique em Consertar resolve.)`,
  unreachable: (it) => `Miau? (O Whey não consegue chegar no ${it}. Abra um corredor até a frente dele.)`,
  dirty: 'Mrrr. (O Whey pisou numa poça. Clique nas sujeiras, arraste o mouse sobre elas ou contrate faxineiros na aba Equipe.)',
  queue: (cat) => `Miau! (Muita gente esperando no ${cat}. Mais um aparelho ou um upgrade ajuda.)`,
  missing: (it) => `Prrr. (Vários alunos pedem ${it}. Veja a caixa de sugestões.)`,
  price: 'Miau... (A mensalidade está acima da faixa justa.)',
  happy: 'Zzz... (Tudo em ordem. O Whey aprova.)',
  empty: 'Miau! (Compre um aparelho na loja para os primeiros alunos aparecerem.)',
};
