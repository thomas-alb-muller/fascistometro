// Motor B do Fascistômetro (versão provisória). Roda igual no navegador e no Node.
// Cada frase do texto vira um vetor (média dos vetores das palavras, com peso maior para
// palavras raras e sem o componente comum) e é ligada à tese da Doutrina mais parecida.
// Se a semelhança passa do corte, a frase concorda, a não ser que só uma das duas tenha
// negação ou rejeição: aí discorda. Nota = 100 × concordâncias ÷ (frases na conta + 2).

export const TAM_BLOCO = 30;
const MAX_FRASE = 45;

const VAZIAS = new Set(`de a o que e do da em um para com nao uma os no se na por mais as dos como mas ao ele das seu sua ou quando muito nos ja eu tambem so pelo pela ate isso ela entre depois sem mesmo aos seus quem nas me esse eles voce essa num nem suas meu minha numa pelos elas qual lhe deles essas esses pelas este dele tu te voces vos lhes meus minhas teu tua teus tuas nosso nossa nossos nossas dela delas esta estes estas aquele aquela aqueles aquelas isto aquilo estou estamos estao estive esteve estivemos estiveram estava estavamos estavam estivera estiveramos esteja estejamos estejam estivesse estivessemos estivessem estiver estivermos estiverem hei ha havemos hao houve houvemos houveram houvera houveramos haja hajamos hajam houvesse houvessemos houvessem houver houvermos houverem houverei houveremos houverao houveria houveriamos houveriam sou somos sao era eramos eram fui foi fomos foram fora foramos seja sejamos sejam fosse fossemos fossem for formos forem serei sera seremos serao seria seriamos seriam tenho tem temos tinha tinhamos tinham tive teve tivemos tiveram tivera tiveramos tenha tenhamos tenham tivesse tivessemos tivessem tiver tivermos tiverem terei tera teremos terao teria teriamos teriam ser ter todo toda todos todas cada outro outra outros outras tal tais assim pois porque sobre ainda apenas onde vez eh ne ta ah`.split(/\s+/));

// Palavras que só dão nome à Doutrina: não contam
const NOME = /^(anti)?(fascis\w*|fasci|mussolini\w*|italia\w*|italian\w*)$/;

// Negação, rejeição e juízo negativo ("anti" sozinho vem de "anti-algo")
const NEGATIVAS = /^(nao|anti|nunca|jamais|nem|nenhum|nenhuma|nenhuns|nenhumas|ninguem|nada|sem|contra|contrari[oa]s?|opost[oa]s?|rejeit\w*|neg(a|o|am|ar|amos|ou|aram|ava|avam|ando|ado|ada|acao)|repudi\w*|desprez\w*|descart\w*|recus\w*|abomin\w*|mentira\w*|farsa\w*|fraude\w*|engano\w*|ilus\w*|ilud\w*|covard\w*|absurd\w*|ridicul\w*|decaden\w*|fracass\w*|ruina\w*|falso|falsa|inute\w*|inutil|nociv\w*|destro\w*|destru\w*|horrivel|terrivel)$/;

const RELATO = /\b(dizia|diziam|disse|disseram|afirmava|afirmavam|afirmou|defendia|defendiam|defendeu|pregava|pregavam|acreditava|acreditavam|desprezavam|desprezava|escreveu|declarou|sustentava|exaltava|exaltavam)\b/i;
const ATRIBUICAO = /\b(segundo|de acordo com)\s+(o|a|os|as|ele|ela|eles|elas|[A-ZÁÉÍÓÚ])/;

export const FAIXAS = [
  { ate: 4, rotulo: "NADA FASCISTA", cor: "verde" },
  { ate: 19, rotulo: "POUCO FASCISTA", cor: "verde-amarela" },
  { ate: 39, rotulo: "MEIO FASCISTA", cor: "amarela" },
  { ate: 59, rotulo: "BEM FASCISTA", cor: "laranja" },
  { ate: 79, rotulo: "FASCISTA", cor: "vermelha" },
  { ate: 100, rotulo: "CAMISA NEGRA!", cor: "preta" },
];
export const faixaDe = (indice) => FAIXAS.find((f) => indice <= f.ate);

export const GRUPOS = {
  1: "Estado totalitário e ético",
  2: "Anti-individualismo e anti-marxismo",
  3: "Pensamento e ação",
  4: "Nação espiritual e homem novo",
  5: "Guerra, expansão, contra o voto e a igualdade",
};

const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function dividirFrases(texto, tamBloco = TAM_BLOCO) {
  const seg = new Intl.Segmenter("pt-BR", { granularity: "sentence" });
  const frases = [];
  for (const paragrafo of texto.split(/\n\s*\n/)) {
    for (const { segment } of seg.segment(paragrafo)) {
      const f = segment.replace(/\s+/g, " ").trim();
      if (!f) continue;
      const palavras = f.split(" ");
      if (palavras.length <= MAX_FRASE) { frases.push(f); continue; }
      const blocos = Math.max(1, Math.round(palavras.length / tamBloco));
      const tam = Math.ceil(palavras.length / blocos);
      for (let i = 0; i < palavras.length; i += tam) frases.push(palavras.slice(i, i + tam).join(" "));
    }
  }
  return frases;
}

// Palavras de conteúdo e marcas de negação de uma frase
export function lerPalavras(frase) {
  const tokens = frase.toLowerCase().match(/\p{L}+/gu) ?? [];
  const conteudo = [];
  const marcas = [];
  tokens.forEach((t, i) => {
    const p = semAcento(t);
    if (NEGATIVAS.test(p) && !(p === "sem" && semAcento(tokens[i + 1] ?? "") === "duvida")) marcas.push(t);
    if (VAZIAS.has(p) || NOME.test(p) || p.length < 3) return;
    conteudo.push(t);
  });
  return { conteudo, marcas, negativo: marcas.length > 0 };
}

export function criarMotor({ vocab, pesos, escalas, vetores, dim, componente, teses, cortes }) {
  const indice = new Map(vocab.map((p, i) => [p, i]));

  function vetorBruto(palavras) {
    const soma = new Float64Array(dim);
    let n = 0;
    for (const p of palavras) {
      const i = indice.get(p);
      if (i === undefined) continue;
      const peso = pesos[i] * escalas[i];
      const base = i * dim;
      for (let k = 0; k < dim; k++) soma[k] += peso * vetores[base + k];
      n++;
    }
    if (!n) return null;
    for (let k = 0; k < dim; k++) soma[k] /= n;
    return soma;
  }

  function limpar(v) {
    if (!v) return null;
    if (componente) {
      let proj = 0;
      for (let k = 0; k < dim; k++) proj += v[k] * componente[k];
      for (let k = 0; k < dim; k++) v[k] -= proj * componente[k];
    }
    let norma = 0;
    for (let k = 0; k < dim; k++) norma += v[k] * v[k];
    norma = Math.sqrt(norma);
    if (!norma) return null;
    for (let k = 0; k < dim; k++) v[k] /= norma;
    return v;
  }

  const dasTeses = teses.map((t) => {
    const leitura = lerPalavras(t.trecho.replace(/\[\d+\]/g, ""));
    return { ...t, ...leitura, vetor: limpar(vetorBruto(leitura.conteudo)) };
  });

  function preparar(texto, tamBloco = TAM_BLOCO) {
    return dividirFrases(texto, tamBloco).map((frase) => {
      const semAspas = frase.replace(/["“][^"”]*["”]/g, " ").replace(/\s+/g, " ").trim();
      const leitura = lerPalavras(semAspas);
      const distintas = new Set(leitura.conteudo).size;
      let fora = null;
      if (frase.trim().endsWith("?")) fora = "pergunta";
      else if (RELATO.test(frase) || ATRIBUICAO.test(frase)) fora = "relato";
      else if (distintas < 4) fora = semAspas !== frase ? "citação" : "curta";
      return { frase, leitura, fora, bruto: fora ? null : vetorBruto(leitura.conteudo) };
    });
  }

  function ranking(item) {
    const v = limpar(item.bruto ? Float64Array.from(item.bruto) : null);
    if (!v) return [];
    return dasTeses
      .filter((t) => t.vetor)
      .map((t) => { let s = 0; for (let k = 0; k < dim; k++) s += v[k] * t.vetor[k]; return { tese: t, valor: s }; })
      .sort((a, b) => b.valor - a.valor);
  }

  function pontuar(itens, c = cortes) {
    let C = 0, N = 0, discordam = 0;
    const porGrupo = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const resultado = itens.map((item) => {
      if (item.fora) return { frase: item.frase, fora: item.fora };
      N++;
      if (!item.rank) item.rank = ranking(item);
      const melhor = item.rank[0];
      const valor = melhor ? melhor.valor : 0;
      const grau = valor >= c.total ? "total" : valor >= c.parcial ? "parcial" : null;
      if (!grau) return { frase: item.frase, valor, tese: melhor?.tese, vizinhas: item.rank.slice(0, 3) };
      const concorda = item.leitura.negativo === melhor.tese.negativo;
      if (concorda) { const p = grau === "total" ? 1 : 0.5; C += p; porGrupo[melhor.tese.grupo] += p; } else discordam++;
      return { frase: item.frase, valor, grau, concorda, tese: melhor.tese, marcas: item.leitura.marcas, vizinhas: item.rank.slice(0, 3) };
    });
    const indice = Math.round((100 * C) / (N + 2));
    return { indice, faixa: faixaDe(indice), C, N, discordam, porGrupo, resultado };
  }

  return { preparar, pontuar, analisar: (texto, c) => pontuar(preparar(texto), c), vetorBruto, teses: dasTeses };
}

// Componente comum (primeiro componente principal) de uma lista de vetores, por iteração de potência
export function componenteComum(lista, dim, voltas = 200) {
  let u = new Float64Array(dim).fill(1 / Math.sqrt(dim));
  for (let v = 0; v < voltas; v++) {
    const novo = new Float64Array(dim);
    for (const x of lista) {
      let p = 0;
      for (let k = 0; k < dim; k++) p += x[k] * u[k];
      for (let k = 0; k < dim; k++) novo[k] += p * x[k];
    }
    const n = Math.hypot(...novo);
    u = novo.map((x) => x / n);
  }
  return Array.from(u);
}

// Carrega os dados no navegador (arquivos publicados junto com a página)
export async function carregarDados(base = "dados/") {
  const info = await (await fetch(base + "info.json")).json();
  // os binários vão como base64 em .txt, porque a página só serve arquivos de texto
  const binario = async (nome) => {
    const b64 = await (await fetch(`${base}${nome}.b64.txt`)).text();
    const bruto = atob(b64.trim());
    const bytes = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
    return bytes.buffer;
  };
  const [vocabTxt, pesos, escalas, extra, ...partes] = await Promise.all([
    fetch(base + "vocab.txt").then((r) => r.text()),
    binario("pesos"),
    binario("escalas"),
    fetch(base + "ajustes.json").then((r) => r.json()),
    ...Array.from({ length: info.partes }, (_, i) => binario(`vetores-${i + 1}`)),
  ]);
  const vetores = new Int8Array(info.palavras * info.dimensoes);
  let pos = 0;
  for (const p of partes) { vetores.set(new Int8Array(p), pos); pos += p.byteLength; }
  return {
    vocab: vocabTxt.split("\n"),
    pesos: new Float32Array(pesos),
    escalas: new Float32Array(escalas),
    vetores,
    dim: info.dimensoes,
    componente: extra.componente,
    cortes: extra.cortes,
  };
}
