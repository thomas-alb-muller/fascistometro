// Calibra o motor da página com os textos de prototipo/textos e grava provisorio/dados/ajustes.json.
// Mesma regra do prototipo/avaliar.mjs: mais acertos (índice >= 25 quando o esperado é alto);
// empate: maior margem; empate de novo: o corte mais exigente.
// Uso: node provisorio/calibrar.mjs [--corpus texto-longo] [textos extras para só conferir...]
//   --corpus: texto longo, sem rótulo, que só entra no cálculo do componente comum.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarMotor, componenteComum } from "./motor.js";
import { TESES } from "./teses.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dados = path.join(aqui, "dados");
const pastaTextos = path.join(aqui, "..", "prototipo", "textos");
const LINHA = 25;
const ESPERADO = {
  "01-doutrina-literal": "alto", "02-outras-palavras": "alto", "03-negado": "baixo",
  "04-aula-historia": "baixo", "05-antifascista": "baixo", "06-direitos-humanos": "baixo",
  "07-militarista": "alto", "08-receita": "baixo", "09-estado-contra-mercado": "alto",
};

const info = JSON.parse(fs.readFileSync(path.join(dados, "info.json"), "utf8"));
const lerF32 = (f) => { const b = fs.readFileSync(path.join(dados, f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const partes = Array.from({ length: info.partes }, (_, i) => fs.readFileSync(path.join(dados, `vetores-${i + 1}.bin`)));
const vetores = new Int8Array(Buffer.concat(partes).buffer.slice(0));
const base = {
  vocab: fs.readFileSync(path.join(dados, "vocab.txt"), "utf8").split("\n"),
  pesos: lerF32("pesos.bin"), escalas: lerF32("escalas.bin"), vetores, dim: info.dimensoes, teses: TESES,
};

const args = process.argv.slice(2);
const ic = args.indexOf("--corpus");
const corpus = ic >= 0 ? fs.readFileSync(args.splice(ic, 2)[1], "utf8") : "";
const textos = Object.keys(ESPERADO).map((nome) => ({ nome, texto: fs.readFileSync(path.join(pastaTextos, nome + ".txt"), "utf8") }));

// 1. componente comum, das teses e dos textos de calibragem
const sem = criarMotor({ ...base, componente: null, cortes: null });
const brutos = [...sem.teses.map((t) => sem.vetorBruto(t.conteudo)), ...textos.flatMap((t) => sem.preparar(t.texto).map((i) => i.bruto)), ...sem.preparar(corpus).map((i) => i.bruto)].filter(Boolean);
const componente = componenteComum(brutos, info.dimensoes);

// 2. escolha dos cortes
const motor = criarMotor({ ...base, componente, cortes: null });
const itens = textos.map((t) => ({ ...t, itens: motor.preparar(t.texto) }));
let melhor = null;
for (let t = 0.1; t <= 0.975 + 1e-9; t += 0.025) {
  for (let p = 0.05; p <= t - 0.025 + 1e-9; p += 0.025) {
    const cortes = { total: +t.toFixed(3), parcial: +p.toFixed(3) };
    const indices = itens.map((x) => motor.pontuar(x.itens, cortes).indice);
    const alto = itens.map((x) => ESPERADO[x.nome] === "alto");
    const acertos = indices.filter((ix, i) => (ix >= LINHA) === alto[i]).length;
    const margem = Math.min(...indices.filter((_, i) => alto[i])) - Math.max(...indices.filter((_, i) => !alto[i]));
    const c = { cortes, indices, acertos, margem };
    const ganha = !melhor || c.acertos > melhor.acertos || (c.acertos === melhor.acertos && (c.margem > melhor.margem || (c.margem === melhor.margem && (t > melhor.cortes.total + 1e-9 || (Math.abs(t - melhor.cortes.total) < 1e-9 && p > melhor.cortes.parcial)))));
    if (ganha) melhor = c;
  }
}

fs.writeFileSync(path.join(dados, "ajustes.json"), JSON.stringify({ componente: componente.map((x) => +x.toFixed(6)), cortes: melhor.cortes }));
console.log(`Cortes: total ${melhor.cortes.total}, parcial ${melhor.cortes.parcial} — ${melhor.acertos} de ${itens.length} acertos, margem ${melhor.margem}\n`);
console.log("| Texto | Esperado | Índice | Selo |\n|---|---|---|---|");
itens.forEach((x, i) => console.log(`| ${x.nome} | ${ESPERADO[x.nome]} | ${melhor.indices[i]} | ${motor.pontuar(x.itens, melhor.cortes).faixa.rotulo} |`));
for (const arq of args) {
  const r = motor.analisar(fs.readFileSync(arq, "utf8"), melhor.cortes);
  console.log(`\n${path.basename(arq)}: índice ${r.indice} (${r.faixa.rotulo}), ${r.C} concordâncias, ${r.discordam} discordâncias, ${r.N} frases na conta`);
}
