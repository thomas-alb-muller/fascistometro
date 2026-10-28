// Exporta as teses e os blocos de texto (já divididos, como no jeito A) para um JSON,
// para que o cálculo dos vetores (feito fora do Node) veja exatamente as mesmas unidades.
// Uso: node prototipo/exportar-itens.mjs saida.json [--extra 15,60] [arquivos...]
//   --extra: tamanhos de bloco a mais (em palavras) só para textos sem pontuação; o conjunto
//            sai com o nome "texto@tamanho". Sem arquivos, usa prototipo/textos.
import fs from "node:fs";
import path from "node:path";
import { listarArquivos, preparar, teses, TAM_BLOCO, VAZIAS, NOME } from "./comparar.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--extra");
const extras = i >= 0 ? args.splice(i, 2)[1].split(",").map(Number) : [];
const [saida, ...arquivos] = args;
if (!saida) { console.error("uso: node prototipo/exportar-itens.mjs saida.json [--extra 15,60] [arquivos...]"); process.exit(1); }

const exporta = (itens) => itens.map((it) => ({ frase: it.frase, texto: it.semAspas, fora: it.fora }));
const conjuntos = [];
for (const arq of listarArquivos(arquivos)) {
  const nome = path.basename(arq).replace(/\.(txt|md)$/, "");
  const texto = fs.readFileSync(arq, "utf8");
  const base = preparar(texto);
  conjuntos.push({ nome, tam: TAM_BLOCO, itens: exporta(base) });
  for (const tam of extras) {
    const outro = preparar(texto, tam);
    // só vale a pena quando o tamanho do bloco muda a divisão (texto sem pontuação)
    if (JSON.stringify(outro.map((x) => x.frase)) !== JSON.stringify(base.map((x) => x.frase))) {
      conjuntos.push({ nome: `${nome}@${tam}`, tam, itens: exporta(outro) });
    }
  }
}

fs.writeFileSync(saida, JSON.stringify({
  vazias: [...VAZIAS],
  nome: NOME.source,
  teses: teses.map((t) => ({ id: t.id, texto: t.texto })),
  conjuntos,
}));
console.log(`${teses.length} teses; ${conjuntos.map((c) => `${c.nome}: ${c.itens.length}`).join(", ")}`);
