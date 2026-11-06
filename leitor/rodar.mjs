// Roda o leitor novo e o B' v3 nos 9 textos de prototipo/textos e compara.
// Uso: node leitor/rodar.mjs [minilm|mdeberta] [precisão do modelo de frase] [precisão do NLI]
// Antes: bash leitor/baixar.sh tudo, e os dados do B' em provisorio/dados (gerar_dados.py + ajustes.json da página).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline, AutoTokenizer, AutoModelForSequenceClassification } from "@huggingface/transformers";
import { criarLeitor, pontuar, calibrar, LIMITE_CONTRA } from "./leitor.js";
import { criarMotor } from "../provisorio/motor.js";
import { TESES } from "../provisorio/teses.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
env.localModelPath = path.join(aqui, "modelos") + "/";
env.allowRemoteModels = false;

const NLI = {
  minilm: "onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX",
  mdeberta: "Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7",
};
const qual = process.argv[2] ?? "minilm";
// precisão dos pesos: fp32 (completo), fp16 ou q8 (comprimido). O q8 estraga os dois NLIs.
// Outro nome (ex.: matmul8, enxuto) carrega onnx/model_<nome>.onnx, feito por quantizar.py ou enxugar.py.
const DT_FRASE = process.argv[3] ?? "fp32", DT_NLI = process.argv[4] ?? "fp32";
const rotulo = `${qual}-${DT_FRASE}-${DT_NLI}`;
const ESPERADO = {
  "01-doutrina-literal": "alto", "02-outras-palavras": "alto", "03-negado": "baixo",
  "04-aula-historia": "baixo", "05-antifascista": "baixo", "06-direitos-humanos": "baixo",
  "07-militarista": "alto", "08-receita": "baixo", "09-estado-contra-mercado": "alto",
};
const pastaTextos = path.join(aqui, "..", "prototipo", "textos");
const textos = Object.keys(ESPERADO).map((nome) => ({ nome, texto: fs.readFileSync(path.join(pastaTextos, nome + ".txt"), "utf8") }));

// --- modelos ---
const t0 = performance.now();
const extrator = await pipeline("feature-extraction", "Xenova/paraphrase-multilingual-MiniLM-L12-v2", { dtype: DT_FRASE, device: "cpu" });
const tok = await AutoTokenizer.from_pretrained(NLI[qual]);
const modelo = await AutoModelForSequenceClassification.from_pretrained(NLI[qual], ["fp32", "fp16", "q8"].includes(DT_NLI) ? { dtype: DT_NLI, device: "cpu" } : { dtype: "fp32", model_file_name: `model_${DT_NLI}`, device: "cpu" });
const carga = performance.now() - t0;
const rotulos = modelo.config.id2label;
const pos = Object.fromEntries(Object.entries(rotulos).map(([i, r]) => [r.toLowerCase(), +i]));

const embutir = async (lista) => (await extrator(lista, { pooling: "mean", normalize: true })).tolist();
async function inferir(premissas, hipoteses) {
  const saida = [];
  for (let i = 0; i < premissas.length; i += 16) {
    const x = tok(premissas.slice(i, i + 16), { text_pair: hipoteses.slice(i, i + 16), padding: true, truncation: true });
    const { logits } = await modelo(x);
    for (const r of logits.tolist()) {
      const m = Math.max(...r), e = r.map((v) => Math.exp(v - m)), s = e.reduce((a, b) => a + b);
      saida.push({ ent: e[pos.entailment] / s, neu: e[pos.neutral] / s, con: e[pos.contradiction] / s });
    }
  }
  return saida;
}

const leitor = criarLeitor({ teses: TESES, embutir, inferir });
const t1 = performance.now();
const lidos = [];
for (const t of textos) lidos.push({ ...t, itens: await leitor.ler(t.texto) });
const tempoLeitura = performance.now() - t1;
const frasesNaConta = lidos.reduce((n, x) => n + x.itens.filter((i) => !i.fora).length, 0);
// --- B' v3, com os dados e ajustes da página publicada ---
const dados = path.join(aqui, "..", "provisorio", "dados");
const info = JSON.parse(fs.readFileSync(path.join(dados, "info.json"), "utf8"));
const lerF32 = (f) => { const b = fs.readFileSync(path.join(dados, f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const ajustes = JSON.parse(fs.readFileSync(path.join(dados, "ajustes.json"), "utf8"));
const motorB = criarMotor({
  vocab: fs.readFileSync(path.join(dados, "vocab.txt"), "utf8").split("\n"),
  pesos: lerF32("pesos.bin"), escalas: lerF32("escalas.bin"),
  vetores: new Int8Array(Buffer.concat(Array.from({ length: info.partes }, (_, i) => fs.readFileSync(path.join(dados, `vetores-${i + 1}.bin`)))).buffer.slice(0)),
  dim: info.dimensoes, teses: TESES, componente: ajustes.componente, cortes: ajustes.cortes,
});

const resumo = (r) => r.resultado.map((x) => (x.fora ? { frase: x.frase, fora: x.fora } : x));
const r3 = (x) => +x.toFixed(3);
const pp = (p) => ({ ent: r3(p.ent), neu: r3(p.neu), con: r3(p.con) });
fs.mkdirSync(path.join(aqui, "saida"), { recursive: true });
for (const regra of ["maior", "ordem"]) for (const sentido of ["ida", "volta", "ambos"]) {
  const melhor = calibrar(lidos, ESPERADO, sentido, regra);
  const limites = { ...melhor.limites, contra: LIMITE_CONTRA };
  const saida = {
    nli: NLI[qual], precisao: { frase: DT_FRASE, nli: DT_NLI }, sentido, regra, limites, acertos: melhor.acertos, margem: melhor.margem,
    tempo: { cargaMs: Math.round(carga), leituraMs: Math.round(tempoLeitura), frasesNaConta, pares: frasesNaConta * 3 * 2 },
    textos: lidos.map((x) => {
      const novo = pontuar(x.itens, limites);
      const b = motorB.analisar(x.texto, ajustes.cortes);
      return {
        nome: x.nome, esperado: ESPERADO[x.nome],
        novo: { indice: novo.indice, C: novo.C, N: novo.N, discordam: novo.discordam, frases: resumo(novo).map((f) => f.fora ? f : { frase: f.frase, decisao: f.decisao, grau: f.grau, tese: f.tese.id, vizinhas: f.vizinhas.map((v) => ({ tese: v.tese.id, cosseno: r3(v.cosseno), ida: pp(v.ida), volta: pp(v.volta) })) }) },
        bv3: { indice: b.indice, C: b.C, N: b.N, discordam: b.discordam, frases: resumo(b).map((f) => f.fora ? f : { frase: f.frase, decisao: f.grau ? (f.concorda ? "concorda" : "discorda") : "nada", grau: f.grau, tese: f.tese?.id, valor: r3(f.valor) }) },
      };
    }),
  };
  fs.writeFileSync(path.join(aqui, "saida", `resultado-${rotulo}-${regra}-${sentido}.json`), JSON.stringify(saida, null, 1));
  console.log(`\n# ${NLI[qual]} (${DT_NLI}), frase ${DT_FRASE}, regra ${regra}, sentido ${sentido} — limites total ${limites.total}, parcial ${limites.parcial} — ${melhor.acertos} de 9, margem ${melhor.margem}`);
  console.log(`carga ${Math.round(carga)} ms; leitura de ${frasesNaConta} frases (${frasesNaConta * 6} pares, nos dois sentidos) em ${Math.round(tempoLeitura)} ms\n`);
  console.log("| Texto | Esperado | B' v3 | Novo |\n|---|---|---|---|");
  for (const t of saida.textos) console.log(`| ${t.nome} | ${t.esperado} | ${t.bv3.indice} | ${t.novo.indice} |`);
  for (const t of saida.textos) {
    console.log(`\n## ${t.nome}`);
    t.novo.frases.forEach((f, i) => {
      const b = t.bv3.frases[i];
      if (f.fora) return console.log(`- (fora: ${f.fora}) ${f.frase}`);
      const v = f.vizinhas.map((x) => `${x.tese} c${x.cosseno} ida e${x.ida.ent}/x${x.ida.con} volta e${x.volta.ent}/x${x.volta.con}`).join(" | ");
      console.log(`- ${f.frase}\n    B': ${b.decisao}${b.grau ? "/" + b.grau : ""} ${b.tese} (${b.valor})  NOVO: ${f.decisao}${f.grau ? "/" + f.grau : ""} ${f.tese}\n    ${v}`);
    });
  }
}
