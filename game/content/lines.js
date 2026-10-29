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
  geladeira: 'geladeira de isotônicos', caixa_som: 'caixa de som', trofeus: 'estante de troféus',
};

export const CATEGORY_SHORT = { cardio: 'cardio', peso: 'peso', funcional: 'funcional' };

// Reclamações por tipo, com variação por perfil.
export const COMPLAINTS = {
  missingEssential: {
    iniciante: (it) => `Cadê a ${it}? Eu não sei usar o resto...`,
    marombeiro: (it) => `Sem ${it} hoje, mano... tá difícil.`,
    corredor: (it) => `Cadê ${it}?! Bora, bora, bora!`,
    idoso: (it) => `Cadê ${it}, meu bem? O médico mandou.`,
  },
  missingDesired: {
    iniciante: (it) => `Seria tão bom ter ${it}...`,
    marombeiro: (it) => `Um ${it} ia cair bem, hein.`,
    corredor: (it) => `Faltou ${it} pra ficar perfeito.`,
    idoso: (it) => `Com ${it} minhas costas iam agradecer.`,
  },
  queue: {
    iniciante: (cat) => `Tem gente demais no ${cat}... vou esperar.`,
    marombeiro: (cat) => `Fila no ${cat}?! Perdi o pump.`,
    corredor: (cat) => `Fila no ${cat}, tudo bem, aqueço aqui.`,
    idoso: (cat) => `Fila no ${cat}? Sem pressa, aproveito e converso.`,
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
