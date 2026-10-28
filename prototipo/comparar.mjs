// Protótipo: compara cada frase de um texto com as teses da Doutrina e confere a negação.
// A: semelhança só pelas palavras (TF-IDF com cosseno).
// B: semelhança por vetores calculados fora (ver comparar-b.mjs). O resto é igual nos dois.
// Uso: node prototipo/comparar.mjs [--resumo] [arquivos...]  (sem arquivos, roda prototipo/textos)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import criarRslp from "rslp";
import { TESES } from "./teses.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const rslp = criarRslp();

// Cortes de semelhança do jeito A (definidos antes de ver os resultados)
export const CORTES_A = { total: 0.45, parcial: 0.25 };

// Texto sem pontuação (transcrição de fala): frase com mais de MAX_FRASE palavras
// é cortada em blocos de tamanho parecido, perto de TAM_BLOCO palavras.
export const TAM_BLOCO = 30;
export const MAX_FRASE = 45;

// Palavras vazias do português (lista do Snowball) e alguns vícios de fala
export const VAZIAS = new Set(`de a o que e do da em um para com nao uma os no se na por mais as dos como mas ao ele das a seu sua ou quando muito nos ja eu tambem so pelo pela ate isso ela entre depois sem mesmo aos seus quem nas me esse eles voce essa num nem suas meu as minha numa pelos elas qual nos lhe deles essas esses pelas este dele tu te voces vos lhes meus minhas teu tua teus tuas nosso nossa nossos nossas dela delas esta estes estas aquele aquela aqueles aquelas isto aquilo estou esta estamos estao estive esteve estivemos estiveram estava estavamos estavam estivera estiveramos esteja estejamos estejam estivesse estivessemos estivessem estiver estivermos estiverem hei ha havemos hao houve houvemos houveram houvera houveramos haja hajamos hajam houvesse houvessemos houvessem houver houvermos houverem houverei houvera houveremos houverao houveria houveriamos houveriam sou somos sao era eramos eram fui foi fomos foram fora foramos seja sejamos sejam fosse fossemos fossem for formos forem serei sera seremos serao seria seriamos seriam tenho tem temos tem tinha tinhamos tinham tive teve tivemos tiveram tivera tiveramos tenha tenhamos tenham tivesse tivessemos tivessem tiver tivermos tiverem terei tera teremos terao teria teriamos teriam ser ter todo toda todos todas cada outro outra outros outras tal tais assim pois porque sobre ainda apenas onde vez eh ne ta ah`.split(/\s+/));

// Palavras que só dão nome à Doutrina: não contam na comparação
export const NOME = /^(anti)?(fascis\w*|fasci|mussolini\w*|italia\w*|italian\w*)$/;

// Marcas de sinal negativo: negação, rejeição e juízo negativo ("anti" sozinho vem de "anti-algo", separado pelo hífen)
const NEGATIVAS = /^(nao|anti|nunca|jamais|nem|nenhum|nenhuma|nenhuns|nenhumas|ninguem|nada|sem|contra|contrari[oa]s?|opost[oa]s?|rejeit\w*|neg(a|o|am|ar|amos|ou|aram|ava|avam|ando|ado|ada|acao)|repudi\w*|desprez\w*|descart\w*|recus\w*|abomin\w*|mentira\w*|farsa\w*|fraude\w*|engano\w*|ilus\w*|ilud\w*|covard\w*|absurd\w*|ridicul\w*|decaden\w*|fracass\w*|ruina\w*|falso|falsa|inute\w*|inutil|nociv\w*|destro\w*|destru\w*|horrivel|terrivel)$/;

export const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

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

// Divide em trechos separados por pontuação e devolve as palavras de cada trecho
function trechos(frase) {
  return frase
    .toLowerCase()
    .split(/[.,;:!?()\[\]–—"“”«»]+/)
    .map((t) => t.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

export function analisarPalavras(frase) {
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

export const ehRelato = (f) =>
  /\b(dizia|diziam|disse|disseram|afirmava|afirmavam|afirmou|defendia|defendiam|defendeu|pregava|pregavam|acreditava|acreditavam|desprezavam|desprezava|escreveu|declarou|sustentava|exaltava|exaltavam)\b/i.test(f) ||
  /\b(segundo|de acordo com)\s+(o|a|os|as|ele|ela|eles|elas|[A-ZÁÉÍÓÚ])/.test(f);

// As teses, com o texto para comparar (sem as marcas de nota, como "[6]")
export const teses = TESES.map(([secao, trecho], i) => ({
  id: `T${String(i + 1).padStart(2, "0")}`,
  secao,
  trecho,
  texto: trecho.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim(),
  ...analisarPalavras(trecho),
}));

// Divide o texto em frases e separa as que ficam fora da conta
export function preparar(texto, tamBloco = TAM_BLOCO) {
  return dividirFrases(texto, tamBloco).map((frase) => {
    const semAspas = frase.replace(/["“][^"”]*["”]/g, " ").replace(/\s+/g, " ").trim();
    const a = analisarPalavras(semAspas);
    const conteudo = [...a.termos.keys()].filter((t) => !t.includes("_")).length;
    let fora = null;
    if (frase.trim().endsWith("?")) fora = "pergunta";
    else if (ehRelato(frase)) fora = "relato";
    else if (conteudo < 4) fora = semAspas !== frase ? "citação" : "curta";
    return { frase, semAspas, a, fora };
  });
}

// Palavras (radicais) que o item e a tese têm em comum, só para mostrar na tela
export function emComum(item, tese) {
  return [...item.a.termos.keys()].filter((t) => !t.includes("_") && tese.termos.has(t));
}

// Jeito A: TF-IDF com cosseno sobre os radicais e os pares de radicais
export function criarComparadorA(lista = teses) {
  const df = new Map();
  for (const t of lista) for (const termo of t.termos.keys()) df.set(termo, (df.get(termo) ?? 0) + 1);
  const idf = (termo) => Math.log((lista.length + 1) / ((df.get(termo) ?? 0) + 1)) + 1;
  const vetor = (termos) => {
    const v = new Map();
    for (const [termo, n] of termos) v.set(termo, (1 + Math.log(n)) * idf(termo));
    return v;
  };
  const norma = (v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const dasTeses = new Map(lista.map((t) => { const v = vetor(t.termos); return [t.id, { v, n: norma(v) }]; }));
  return (item) => {
    const v = vetor(item.a.termos);
    const nv = norma(v);
    let melhor = null;
    for (const t of lista) {
      const { v: vt, n: nt } = dasTeses.get(t.id);
      let soma = 0;
      for (const [termo, peso] of v) { const o = vt.get(termo); if (o) soma += peso * o; }
      const valor = nv && nt ? soma / (nv * nt) : 0;
      if (!melhor || valor > melhor.valor) melhor = { valor, tese: t, comuns: emComum(item, t) };
    }
    return melhor;
  };
}

// A conta: cada frase na conta recebe a tese mais parecida; o sinal (negação) decide se concorda ou discorda
export function pontuar(itens, comparador, { total, parcial }) {
  const resultado = [];
  let C = 0, N = 0, discordam = 0;
  const fora = { pergunta: 0, relato: 0, citação: 0, curta: 0 };
  for (const item of itens) {
    if (item.fora) { fora[item.fora]++; resultado.push({ frase: item.frase, fora: item.fora }); continue; }
    N++;
    const melhor = comparador(item);
    const grau = melhor.valor >= total ? "total" : melhor.valor >= parcial ? "parcial" : null;
    if (!grau) { resultado.push({ frase: item.frase, semelhanca: melhor.valor, melhor }); continue; }
    const concorda = item.a.negativo === melhor.tese.negativo;
    if (concorda) C += grau === "total" ? 1 : 0.5; else discordam++;
    resultado.push({ frase: item.frase, grau, concorda, semelhanca: melhor.valor, melhor, marcas: item.a.marcas });
  }
  return { indice: Math.round((100 * C) / (N + 2)), C, N, discordam, fora, resultado };
}

// Relatório frase por frase (textos curtos)
export function relatorioCompleto(nome, r) {
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
  return linhas;
}

// Relatório resumido (textos longos, como transcrições)
export function relatorioResumo(nome, r) {
  const comGrau = r.resultado.filter((x) => x.grau);
  const concordam = comGrau.filter((x) => x.concorda);
  const discordam = comGrau.filter((x) => !x.concorda);
  const semCorresp = r.resultado.filter((x) => !x.fora && !x.grau);
  const total = r.resultado.length;
  const totais = concordam.filter((x) => x.grau === "total").length;
  const linhas = [`## ${nome}`, ""];
  linhas.push(`**Índice ${r.indice}** · ${total} blocos de texto, ${r.N} na conta, ${total - r.N} fora da conta`);
  linhas.push("");
  linhas.push(`- Concordam com uma tese: ${concordam.length} (${totais} total, ${concordam.length - totais} em parte), que somam ${r.C} pontos`);
  linhas.push(`- Discordam de uma tese: ${discordam.length}`);
  linhas.push(`- Sem tese parecida: ${semCorresp.length}`);
  linhas.push(`- Fora da conta: ${Object.entries(r.fora).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  linhas.push("");
  const faixas = Array.from({ length: 10 }, () => 0);
  for (const x of r.resultado) if (!x.fora) faixas[Math.min(9, Math.floor(x.semelhanca * 10))]++;
  linhas.push("Como se distribui a semelhança do melhor par (blocos na conta):", "", "| semelhança | blocos |", "|---|---|");
  faixas.forEach((n, i) => linhas.push(`| ${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)} | ${n} |`));
  linhas.push("");
  const porTese = new Map();
  for (const x of comGrau) porTese.set(x.melhor.tese.id, (porTese.get(x.melhor.tese.id) ?? 0) + 1);
  const topo = [...porTese.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  linhas.push("Teses mais acionadas:", "");
  for (const [id, n] of topo) { const t = teses.find((x) => x.id === id); linhas.push(`- ${id} (${n} blocos) [${t.secao}]: "${t.trecho}"`); }
  linhas.push("");
  const lista = (titulo, itens, max) => {
    linhas.push(titulo, "");
    for (const x of [...itens].sort((a, b) => b.semelhanca - a.semelhanca).slice(0, max)) {
      linhas.push(`- "${x.frase}"`);
      linhas.push(`  - ${x.concorda ? "CONCORDA" : "DISCORDA"} (${x.grau}, semelhança ${x.semelhanca.toFixed(2)}) com ${x.melhor.tese.id} [${x.melhor.tese.secao}]: "${x.melhor.tese.trecho}"`);
      linhas.push(`  - palavras em comum: ${x.melhor.comuns.join(", ") || "—"} · negação no bloco: ${x.marcas.join(", ") || "nenhuma"} · na tese: ${x.melhor.tese.marcas.join(", ") || "nenhuma"}`);
    }
    linhas.push("");
  };
  lista("Os 12 blocos que mais concordam:", concordam, 12);
  lista("Os 8 blocos que mais discordam:", discordam, 8);
  return linhas;
}

export function montarRelatorio(titulo, resultados, resumido) {
  const tabela = resultados.map(({ nome, r }) => `| ${nome} | ${r.indice} |`);
  const corpo = resultados.flatMap(({ nome, r }) => [...(resumido ? relatorioResumo(nome, r) : relatorioCompleto(nome, r)), ""]);
  return [`# ${titulo}`, "", "| Texto | Índice |", "|---|---|", ...tabela, "", ...corpo].join("\n");
}

export function listarArquivos(args) {
  return args.length
    ? args
    : fs.readdirSync(path.join(aqui, "textos")).sort().map((f) => path.join(aqui, "textos", f));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const resumido = args.includes("--resumo");
  const comparador = criarComparadorA();
  const resultados = listarArquivos(args.filter((a) => a !== "--resumo")).map((arq) => ({
    nome: path.basename(arq).replace(/\.(txt|md)$/, ""),
    r: pontuar(preparar(fs.readFileSync(arq, "utf8")), comparador, CORTES_A),
  }));
  console.log(montarRelatorio("Protótipo A (por palavras)", resultados, resumido));
}
