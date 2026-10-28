// Protótipo do jeito A: compara cada frase de um texto com as teses da Doutrina
// só pelas palavras (TF-IDF com cosseno) e confere a negação.
// Uso: node prototipo/comparar.mjs [arquivos...]  (sem argumentos, roda todos de prototipo/textos)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import criarRslp from "rslp";
import { TESES } from "./teses.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const rslp = criarRslp();

// Cortes de semelhança (provisórios)
const CORTE_TOTAL = 0.45;
const CORTE_PARCIAL = 0.25;

// Palavras vazias do português (lista do Snowball) e alguns reforços
const VAZIAS = new Set(`de a o que e do da em um para com nao uma os no se na por mais as dos como mas ao ele das a seu sua ou quando muito nos ja eu tambem so pelo pela ate isso ela entre depois sem mesmo aos seus quem nas me esse eles voce essa num nem suas meu as minha numa pelos elas qual nos lhe deles essas esses pelas este dele tu te voces vos lhes meus minhas teu tua teus tuas nosso nossa nossos nossas dela delas esta estes estas aquele aquela aqueles aquelas isto aquilo estou esta estamos estao estive esteve estivemos estiveram estava estavamos estavam estivera estiveramos esteja estejamos estejam estivesse estivessemos estivessem estiver estivermos estiverem hei ha havemos hao houve houvemos houveram houvera houveramos haja hajamos hajam houvesse houvessemos houvessem houver houvermos houverem houverei houvera houveremos houverao houveria houveriamos houveriam sou somos sao era eramos eram fui foi fomos foram fora foramos seja sejamos sejam fosse fossemos fossem for formos forem serei sera seremos serao seria seriamos seriam tenho tem temos tem tinha tinhamos tinham tive teve tivemos tiveram tivera tiveramos tenha tenhamos tenham tivesse tivessemos tivessem tiver tivermos tiverem terei tera teremos terao teria teriamos teriam ser ter todo toda todos todas cada outro outra outros outras tal tais assim pois porque sobre ainda apenas onde vez`.split(/\s+/));

// Palavras que só dão nome à Doutrina: não contam na comparação
const NOME = /^(anti)?(fascis\w*|fasci|mussolini\w*|italia\w*|italian\w*)$/;

// Marcas de sinal negativo: negação, rejeição e juízo negativo
const NEGATIVAS = /^(nao|nunca|jamais|nem|nenhum|nenhuma|nenhuns|nenhumas|ninguem|nada|sem|contra|contrari[oa]s?|opost[oa]s?|rejeit\w*|neg(a|o|am|ar|amos|ou|aram|ava|avam|ando|ado|ada|acao)|repudi\w*|desprez\w*|descart\w*|recus\w*|abomin\w*|mentira\w*|farsa\w*|fraude\w*|engano\w*|ilus\w*|ilud\w*|covard\w*|absurd\w*|ridicul\w*|decaden\w*|fracass\w*|ruina\w*|falso|falsa|inute\w*|inutil|nociv\w*|destro\w*|destru\w*|horrivel|terrivel)$/;

const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function dividirFrases(texto) {
  const seg = new Intl.Segmenter("pt-BR", { granularity: "sentence" });
  const frases = [];
  for (const paragrafo of texto.split(/\n\s*\n/)) {
    for (const { segment } of seg.segment(paragrafo)) {
      const f = segment.replace(/\s+/g, " ").trim();
      if (f) frases.push(f);
    }
  }
  return frases;
}

// Divide em trechos separados por pontuação e devolve as palavras de cada trecho
function trechos(frase) {
  return frase
    .toLowerCase()
    .split(/[.,;:!?()\[\]–—"“”«»]+/)
    .map((t) => t.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

function analisarPalavras(frase) {
  const termos = new Map();
  let negativo = false;
  const marcas = [];
  for (const trecho of trechos(frase)) {
    const radicais = [];
    for (let i = 0; i < trecho.length; i++) {
      const original = trecho[i];
      const p = semAcento(original);
      if (NEGATIVAS.test(p) && !(p === "sem" && semAcento(trecho[i + 1] ?? "") === "duvida")) {
        negativo = true;
        marcas.push(original);
      }
      if (/^anti\w{3,}/.test(p) && !NOME.test(p)) { negativo = true; marcas.push(original); }
      if (VAZIAS.has(p) || NOME.test(p) || /^\d+$/.test(p) || p.length < 3) continue;
      radicais.push(rslp(original));
    }
    for (const r of radicais) termos.set(r, (termos.get(r) ?? 0) + 1);
    for (let i = 0; i + 1 < radicais.length; i++) {
      const par = radicais[i] + "_" + radicais[i + 1];
      termos.set(par, (termos.get(par) ?? 0) + 1);
    }
  }
  return { termos, negativo, marcas };
}

const ehRelato = (f) =>
  /\b(dizia|diziam|disse|disseram|afirmava|afirmavam|afirmou|defendia|defendiam|defendeu|pregava|pregavam|acreditava|acreditavam|desprezavam|desprezava|escreveu|declarou|sustentava|exaltava|exaltavam)\b/i.test(f) ||
  /\b(segundo|de acordo com)\s+(o|a|os|as|ele|ela|eles|elas|[A-ZÁÉÍÓÚ])/.test(f);

// Monta o modelo das teses
const teses = TESES.map(([secao, trecho], i) => ({ id: `T${String(i + 1).padStart(2, "0")}`, secao, trecho, ...analisarPalavras(trecho) }));
const df = new Map();
for (const t of teses) for (const termo of t.termos.keys()) df.set(termo, (df.get(termo) ?? 0) + 1);
const idf = (termo) => Math.log((teses.length + 1) / ((df.get(termo) ?? 0) + 1)) + 1;
const vetor = (termos) => {
  const v = new Map();
  for (const [termo, n] of termos) v.set(termo, (1 + Math.log(n)) * idf(termo));
  return v;
};
const norma = (v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
for (const t of teses) { t.vetor = vetor(t.termos); t.norma = norma(t.vetor); }

function cosseno(v, nv, t) {
  let soma = 0;
  const comuns = [];
  for (const [termo, peso] of v) {
    const outro = t.vetor.get(termo);
    if (outro) { soma += peso * outro; if (!termo.includes("_")) comuns.push(termo); }
  }
  return { valor: nv && t.norma ? soma / (nv * t.norma) : 0, comuns };
}

export function analisar(texto) {
  const resultado = [];
  let C = 0, N = 0, discordam = 0;
  for (const frase of dividirFrases(texto)) {
    const semAspas = frase.replace(/["“][^"”]*["”]/g, " ");
    const a = analisarPalavras(semAspas);
    const conteudo = [...a.termos.keys()].filter((t) => !t.includes("_")).length;
    let fora = null;
    if (frase.trim().endsWith("?")) fora = "pergunta";
    else if (ehRelato(frase)) fora = "relato";
    else if (conteudo < 4) fora = semAspas !== frase ? "citação" : "curta";
    if (fora) { resultado.push({ frase, fora }); continue; }
    N++;
    const v = vetor(a.termos);
    const nv = norma(v);
    let melhor = null;
    for (const t of teses) {
      const c = cosseno(v, nv, t);
      if (!melhor || c.valor > melhor.valor) melhor = { ...c, tese: t };
    }
    const grau = melhor.valor >= CORTE_TOTAL ? "total" : melhor.valor >= CORTE_PARCIAL ? "parcial" : null;
    if (!grau) { resultado.push({ frase, semelhanca: melhor.valor, melhor }); continue; }
    const concorda = a.negativo === melhor.tese.negativo;
    if (concorda) C += grau === "total" ? 1 : 0.5; else discordam++;
    resultado.push({ frase, grau, concorda, semelhanca: melhor.valor, melhor, marcas: a.marcas });
  }
  const indice = Math.round((100 * C) / (N + 2));
  return { indice, C, N, discordam, resultado };
}

function relatorio(nome, texto) {
  const r = analisar(texto);
  const linhas = [`## ${nome}`, "", `**Índice ${r.indice}** · concordam ${r.C} · frases na conta ${r.N} · discordam ${r.discordam}`, ""];
  for (const item of r.resultado) {
    linhas.push(`- "${item.frase}"`);
    if (item.fora) { linhas.push(`  - fora da conta (${item.fora})`); continue; }
    const m = item.melhor;
    const s = item.semelhanca.toFixed(2);
    if (!item.grau) { linhas.push(`  - sem correspondência (melhor: ${s} com ${m.tese.id})`); continue; }
    const sinal = item.concorda ? "CONCORDA" : "DISCORDA";
    linhas.push(`  - ${sinal} (${item.grau}, semelhança ${s}) com ${m.tese.id} [${m.tese.secao}]: "${m.tese.trecho}"`);
    linhas.push(`  - palavras em comum: ${m.comuns.join(", ") || "—"}${item.marcas?.length || m.tese.negativo ? ` · negação no texto: ${item.marcas.join(", ") || "nenhuma"} · na tese: ${m.tese.marcas.join(", ") || "nenhuma"}` : ""}`);
  }
  return { linhas, indice: r.indice };
}

const arquivos = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(path.join(aqui, "textos")).sort().map((f) => path.join(aqui, "textos", f));
const resumo = [], corpo = [];
for (const arq of arquivos) {
  const nome = path.basename(arq, ".txt");
  const { linhas, indice } = relatorio(nome, fs.readFileSync(arq, "utf8"));
  resumo.push(`| ${nome} | ${indice} |`);
  corpo.push(...linhas, "");
}
console.log(["# Protótipo A (por palavras)", "", "| Texto | Índice |", "|---|---|", ...resumo, "", ...corpo].join("\n"));
