// Leitor de frases do Fascistômetro (teste). Roda igual no navegador e no Node.
// 1. As regras de fora da conta (pergunta, citação, relato, frase curta) são as do motor B'.
// 2. Um modelo de frase (paraphrase-multilingual-MiniLM-L12-v2) acha as 3 teses mais parecidas.
// 3. Um modelo de inferência textual (NLI) lê cada par: premissa = frase do texto, hipótese = tese
//    (a "ida", que é o teste pedido). Também guarda a "volta" (premissa = tese, hipótese = frase).
//    Implicação conta como concorda; contradição, como discorda; neutro, como nada.
// Índice = 100 × concordâncias ÷ (frases na conta + 2), igual ao B'.
import { criarMotor, faixaDe } from "../provisorio/motor.js";

export const VIZINHAS = 3;
// A contradição não mexe no índice (só as concordâncias entram na conta), então não é calibrada.
export const LIMITE_CONTRA = 0.5;

// Usa o motor B' sem vetores só para dividir as frases e aplicar as regras de fora da conta
export function separarFrases(texto, teses) {
  const vazio = criarMotor({ vocab: [], pesos: new Float32Array(0), escalas: new Float32Array(0), vetores: new Int8Array(0), dim: 1, componente: null, teses, cortes: null });
  return vazio.preparar(texto).map(({ frase, fora, leitura }) => ({ frase, fora, leitura }));
}

const cosseno = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };

// embutir(textos) -> vetores normalizados; inferir(premissas, hipoteses) -> [{ent, neu, con}]
export function criarLeitor({ teses, embutir, inferir, vetoresTeses }) {
  let vt = vetoresTeses;
  async function vetoresDasTeses() {
    if (!vt) vt = await embutir(teses.map((t) => t.trecho.replace(/\[\d+\]/g, "")));
    return vt;
  }

  // Lê o texto e guarda as probabilidades de cada par; a decisão fica para pontuar()
  async function ler(texto) {
    const itens = separarFrases(texto, teses);
    const naConta = itens.filter((i) => !i.fora);
    if (!naConta.length) return itens;
    const [vTeses, vFrases] = [await vetoresDasTeses(), await embutir(naConta.map((i) => i.frase))];
    const pares = [];
    naConta.forEach((item, n) => {
      item.vizinhas = teses
        .map((tese, j) => ({ tese, cosseno: cosseno(vFrases[n], vTeses[j]) }))
        .sort((a, b) => b.cosseno - a.cosseno)
        .slice(0, VIZINHAS);
      item.vizinhas.forEach((v) => pares.push({ v, premissa: item.frase, hipotese: v.tese.trecho.replace(/\[\d+\]/g, "") }));
    });
    // os dois sentidos: ida = frase implica a tese; volta = a tese implica a frase
    const ida = await inferir(pares.map((p) => p.premissa), pares.map((p) => p.hipotese));
    const volta = await inferir(pares.map((p) => p.hipotese), pares.map((p) => p.premissa));
    pares.forEach((p, i) => { p.v.ida = ida[i]; p.v.volta = volta[i]; });
    return itens;
  }

  return { ler, pontuar, analisar: async (texto, limites) => pontuar(await ler(texto), limites) };
}

// Probabilidades de um par conforme o sentido: "ida" (pedido original), "volta" ou "ambos" (o maior)
export function probs(v, sentido = "ida") {
  if (sentido !== "ambos") return v[sentido];
  return { ent: Math.max(v.ida.ent, v.volta.ent), con: Math.max(v.ida.con, v.volta.con), neu: Math.min(v.ida.neu, v.volta.neu) };
}

// Decide cada frase com os limites de probabilidade: { total, parcial, contra, sentido, regra }
// regra "maior": vence o par de maior implicação ou de maior contradição entre as 3 vizinhas.
// regra "ordem": vale a tese mais parecida (pelo modelo de frase) que tiver resposta firme
// (implicação >= parcial ou contradição >= contra); as outras só entram se ela for neutra.
export function decidir(item, limites) {
  const viz = item.vizinhas.map((v) => ({ ...v, ...probs(v, limites.sentido) }));
  const contra = limites.contra ?? LIMITE_CONTRA;
  const concorda = (par) => ({ decisao: "concorda", grau: par.ent >= limites.total ? "total" : "parcial", par });
  if (limites.regra === "ordem") {
    for (const v of viz) {
      if (v.ent >= limites.parcial && v.ent >= v.con) return concorda(v);
      if (v.con >= contra && v.con > v.ent) return { decisao: "discorda", par: v };
    }
    return { decisao: "nada", par: viz[0] };
  }
  const porEnt = viz.reduce((a, b) => (b.ent > a.ent ? b : a));
  const porCon = viz.reduce((a, b) => (b.con > a.con ? b : a));
  if (porEnt.ent >= limites.parcial && porEnt.ent >= porCon.con) return concorda(porEnt);
  if (porCon.con >= contra && porCon.con > porEnt.ent) return { decisao: "discorda", par: porCon };
  return { decisao: "nada", par: viz[0] };
}

export function pontuar(itens, limites) {
  let C = 0, N = 0, discordam = 0;
  const porGrupo = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const resultado = itens.map((item) => {
    if (item.fora) return { frase: item.frase, fora: item.fora };
    N++;
    const d = decidir(item, limites);
    if (d.decisao === "concorda") { const p = d.grau === "total" ? 1 : 0.5; C += p; porGrupo[d.par.tese.grupo] += p; }
    if (d.decisao === "discorda") discordam++;
    return { frase: item.frase, ...d, tese: d.par.tese, vizinhas: item.vizinhas.map((v) => ({ ...v, ...probs(v, limites.sentido) })) };
  });
  const indice = Math.round((100 * C) / (N + 2));
  return { indice, faixa: faixaDe(indice), C, N, discordam, porGrupo, resultado };
}

// Mesma regra do provisorio/calibrar.mjs: mais acertos; empate, maior margem; depois, o corte mais exigente
export function calibrar(lidos, esperado, sentido = "ida", regra = "maior", linha = 25) {
  let melhor = null;
  for (let t = 0.1; t <= 0.975 + 1e-9; t += 0.025) {
    for (let p = 0.05; p <= t + 1e-9; p += 0.025) {
      const limites = { total: +t.toFixed(3), parcial: +p.toFixed(3), sentido, regra };
      const indices = lidos.map((x) => pontuar(x.itens, limites).indice);
      const alto = lidos.map((x) => esperado[x.nome] === "alto");
      const acertos = indices.filter((ix, i) => (ix >= linha) === alto[i]).length;
      const margem = Math.min(...indices.filter((_, i) => alto[i])) - Math.max(...indices.filter((_, i) => !alto[i]));
      const c = { limites, indices, acertos, margem };
      const ganha = !melhor || c.acertos > melhor.acertos || (c.acertos === melhor.acertos && (c.margem > melhor.margem || (c.margem === melhor.margem && (t > melhor.limites.total + 1e-9 || (Math.abs(t - melhor.limites.total) < 1e-9 && p > melhor.limites.parcial)))));
      if (ganha) melhor = c;
    }
  }
  return melhor;
}
