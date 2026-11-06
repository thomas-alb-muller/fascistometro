// Mostra como acertos e margem mudam com o limite de implicação (total = parcial), a partir de um resultado salvo.
// Uso: node leitor/sensibilidade.mjs leitor/saida/resultado-....json
import fs from "node:fs";
import { pontuar } from "./leitor.js";
import { TESES } from "../provisorio/teses.js";
const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const porId = Object.fromEntries(TESES.map((t) => [t.id, t]));
const lidos = r.textos.map((t) => ({ nome: t.nome, alto: t.esperado === "alto", itens: t.novo.frases.map((f) => (f.fora ? f : { frase: f.frase, vizinhas: f.vizinhas.map((v) => ({ ...v, tese: porId[v.tese] })) })) }));
console.log("| Limite | Acertos | Margem | Índices (01…09) |\n|---|---|---|---|");
for (let t = 0.1; t <= 0.951; t += 0.05) {
  const lim = { total: t, parcial: t, sentido: r.sentido, regra: r.regra, contra: r.limites.contra };
  const ix = lidos.map((x) => pontuar(x.itens, lim).indice);
  const acertos = ix.filter((v, i) => (v >= 25) === lidos[i].alto).length;
  const margem = Math.min(...ix.filter((_, i) => lidos[i].alto)) - Math.max(...ix.filter((_, i) => !lidos[i].alto));
  console.log(`| ${t.toFixed(2)} | ${acertos} | ${margem} | ${ix.join(" ")} |`);
}
