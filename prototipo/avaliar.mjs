// Avalia os jeitos A (palavras) e B' (vetores de palavra do spaCy) com a mesma conta,
// a mesma regra de negação e a mesma regra para escolher os cortes de semelhança.
// Os cortes de cada jeito saem só dos textos de calibragem; os demais textos não entram na escolha.
// Uso: node prototipo/avaliar.mjs vetores.json arquivos...
import fs from "node:fs";
import path from "node:path";
import { criarComparadorA, emComum, pontuar, preparar, relatorioResumo, TAM_BLOCO, teses } from "./comparar.mjs";

// O que uma boa régua deveria dar nos textos de calibragem
export const CALIBRAGEM = {
  "01-doutrina-literal": "alto",
  "02-outras-palavras": "alto",
  "03-negado": "baixo",
  "04-aula-historia": "baixo",
  "05-antifascista": "baixo",
  "06-direitos-humanos": "baixo",
  "07-militarista": "alto",
  "08-receita": "baixo",
};
// A partir deste índice, o texto conta como "alto"
export const LINHA = 25;

const [arqVetores, ...arquivos] = process.argv.slice(2);
if (!arqVetores || !arquivos.length) { console.error("uso: node prototipo/avaliar.mjs vetores.json arquivos..."); process.exit(1); }
const dados = JSON.parse(fs.readFileSync(arqVetores, "utf8"));
const textos = new Map(arquivos.map((arq) => [path.basename(arq).replace(/\.(txt|md)$/, ""), fs.readFileSync(arq, "utf8")]));

const unitario = (v) => { if (!v) return null; const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return n ? v.map((x) => x / n) : null; };
const vetorTese = new Map(teses.map((t) => [t.id, unitario(dados.teses[t.id])]));

// Guarda a resposta de cada item, porque a escolha dos cortes repete a conta muitas vezes
function memoria(comparador) {
  const m = new Map();
  return (item) => { if (!m.has(item)) m.set(item, comparador(item)); return m.get(item); };
}

function criarComparadorB(itens, vetores) {
  const posicao = new Map(itens.map((it, i) => [it, i]));
  return (item) => {
    const v = unitario(vetores[posicao.get(item)]);
    let melhor = { valor: 0, tese: teses[0] };
    if (v) {
      for (const t of teses) {
        const w = vetorTese.get(t.id);
        let soma = 0;
        for (let k = 0; k < v.length; k++) soma += v[k] * w[k];
        if (soma > melhor.valor) melhor = { valor: soma, tese: t };
      }
    }
    return { ...melhor, comuns: emComum(item, melhor.tese) };
  };
}

const comparadorA = criarComparadorA();
const conjuntos = Object.keys(dados.conjuntos).map((nome) => {
  const [base, tamTexto] = nome.split("@");
  const tam = tamTexto ? Number(tamTexto) : TAM_BLOCO;
  if (!textos.has(base)) throw new Error(`falta o arquivo de ${base}`);
  const itens = preparar(textos.get(base), tam);
  const vetores = dados.conjuntos[nome];
  if (vetores.length !== itens.length) throw new Error(`${nome}: ${vetores.length} vetores para ${itens.length} blocos`);
  return { nome, base, tam, itens, A: memoria(comparadorA), B: memoria(criarComparadorB(itens, vetores)) };
});
const calibra = conjuntos.filter((c) => CALIBRAGEM[c.base] && c.tam === TAM_BLOCO);
const avaliados = conjuntos.filter((c) => !CALIBRAGEM[c.base]);

function grade(min, max, passo) {
  const g = [];
  for (let t = min + passo; t <= max + 1e-9; t += passo)
    for (let p = min; p <= t - passo + 1e-9; p += passo) g.push({ total: +t.toFixed(3), parcial: +p.toFixed(3) });
  return g;
}

// Regra: mais acertos na calibragem (índice >= LINHA quando o esperado é "alto");
// empate: maior margem entre o pior "alto" e o melhor "baixo"; empate de novo: o corte mais exigente.
function escolherCortes(jeito) {
  let melhor = null;
  for (const cortes of grade(0.05, 0.975, 0.025)) {
    const indices = calibra.map((c) => pontuar(c.itens, c[jeito], cortes).indice);
    const alto = calibra.map((c) => CALIBRAGEM[c.base] === "alto");
    const acertos = indices.filter((ix, i) => (ix >= LINHA) === alto[i]).length;
    const margem = Math.min(...indices.filter((_, i) => alto[i])) - Math.max(...indices.filter((_, i) => !alto[i]));
    const c = { cortes, indices, acertos, margem };
    const melhorQue = (a, b) =>
      a.acertos !== b.acertos ? a.acertos > b.acertos
      : a.margem !== b.margem ? a.margem > b.margem
      : a.cortes.total !== b.cortes.total ? a.cortes.total > b.cortes.total
      : a.cortes.parcial > b.cortes.parcial;
    if (!melhor || melhorQue(c, melhor)) melhor = c;
  }
  return melhor;
}

const escolha = { A: escolherCortes("A"), B: escolherCortes("B") };
const resultado = (c, jeito, cortes = escolha[jeito].cortes) => pontuar(c.itens, c[jeito], cortes);
const fmt = (x) => x.toFixed(2);
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const distribuicao = (c, jeito) => {
  const s = c.itens.filter((i) => !i.fora).map((i) => c[jeito](i).valor).sort((a, b) => a - b);
  return s.length ? `${fmt(pct(s, 0.5))} / ${fmt(pct(s, 0.9))} / ${fmt(s[s.length - 1])}` : "—";
};

const L = [];
L.push("# Avaliação dos jeitos A e B'", "");
L.push("- **A**: semelhança pelas palavras (radicais e pares de radicais, TF-IDF com cosseno).");
L.push("- **B'**: semelhança por vetores de palavra do spaCy (`pt_core_news_lg`), com peso SIF. **Não é o modelo de sentido de frase planejado para o B**, que a rede deste ambiente não deixa baixar (`huggingface.co` bloqueado). É um substituto mais fraco.");
L.push("- Nos dois: a mesma divisão em frases (texto sem pontuação vira blocos de ~30 palavras), a mesma regra de negação, as mesmas exclusões e a mesma conta: índice = 100 × concordâncias ÷ (frases na conta + 2).");
L.push(`- Cortes de semelhança: escolhidos para cada jeito só com os 8 textos de calibragem. Regra fixada antes de rodar o debate: mais acertos (índice ≥ ${LINHA} quando o esperado é alto, abaixo quando é baixo); no empate, maior margem; depois, o corte mais exigente.`, "");

L.push("## 1. Calibragem", "");
L.push(`Cortes escolhidos — A: total ${escolha.A.cortes.total}, parcial ${escolha.A.cortes.parcial} (${escolha.A.acertos} de 8 acertos) · B': total ${escolha.B.cortes.total}, parcial ${escolha.B.cortes.parcial} (${escolha.B.acertos} de 8 acertos).`, "");
L.push("| Texto | Esperado | A | B' |", "|---|---|---|---|");
calibra.forEach((c, i) => L.push(`| ${c.base} | ${CALIBRAGEM[c.base]} | ${escolha.A.indices[i]} | ${escolha.B.indices[i]} |`));
L.push("");

L.push("## 2. Como a semelhança se comporta", "", "Semelhança da tese mais parecida, por bloco na conta (mediana / 90% / máximo):", "");
L.push("| Texto | A | B' |", "|---|---|---|");
for (const c of [...calibra, ...avaliados.filter((c) => c.tam === TAM_BLOCO)]) L.push(`| ${c.base} | ${distribuicao(c, "A")} | ${distribuicao(c, "B")} |`);
L.push("");

const curva = (jeito, totais) => {
  const col = [...calibra, ...avaliados.filter((c) => c.tam === TAM_BLOCO)];
  L.push(`| corte total/parcial | ${col.map((c) => c.base.slice(0, 2) === "ca" ? c.base : c.base.slice(0, 2)).join(" | ")} |`, `|---|${col.map(() => "---").join("|")}|`);
  for (const t of totais) {
    const cortes = { total: t, parcial: +Math.max(0.05, t - 0.1).toFixed(2) };
    L.push(`| ${cortes.total}/${cortes.parcial} | ${col.map((c) => pontuar(c.itens, c[jeito], cortes).indice).join(" | ")} |`);
  }
  L.push("");
};
L.push("## 3. Índice conforme o corte", "", "Mostra a troca: baixar o corte para pegar os textos fascistas com outras palavras (02 e 07) também sobe os textos que deveriam ficar baixos.", "");
L.push("**B'**", ""); curva("B", [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]);
L.push("**A**", ""); curva("A", [0.5, 0.4, 0.3, 0.25, 0.2, 0.15]);

L.push("## 4. Textos fora da calibragem", "");
L.push("| Texto | Bloco (palavras) | Blocos | A: índice (concordam / discordam) | B': índice (concordam / discordam) |", "|---|---|---|---|---|");
for (const c of avaliados) {
  const a = resultado(c, "A"), b = resultado(c, "B");
  L.push(`| ${c.base} | ${c.tam} | ${c.itens.length} | ${a.indice} (${a.C} / ${a.discordam}) | ${b.indice} (${b.C} / ${b.discordam}) |`);
}
L.push("");
for (const c of avaliados.filter((c) => c.tam === TAM_BLOCO)) {
  for (const [jeito, rotulo] of [["B", "B'"], ["A", "A"]]) {
    L.push(...relatorioResumo(`${c.base} — jeito ${rotulo} (cortes ${escolha[jeito].cortes.total}/${escolha[jeito].cortes.parcial})`, resultado(c, jeito)), "");
  }
}
console.log(L.join("\n"));
