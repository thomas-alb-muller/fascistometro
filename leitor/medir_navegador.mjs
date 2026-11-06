// Abre leitor/navegador.html no Chromium (Playwright) e mede carga e leitura dos 9 textos.
// Uso: node leitor/medir_navegador.mjs [mdeberta|minilm] [fp16|fp32|q8]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tipos = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".txt": "text/plain" };
const servidor = http.createServer((req, res) => {
  const arq = path.join(raiz, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!arq.startsWith(raiz) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": tipos[path.extname(arq)] ?? "application/octet-stream" });
  fs.createReadStream(arq).pipe(res);
}).listen(0);
const porta = servidor.address().port;
const nav = await chromium.launch();
const pag = await nav.newPage();
const [nli = "mdeberta", dtype = "fp16"] = process.argv.slice(2);
await pag.goto(`http://localhost:${porta}/leitor/navegador.html?nli=${nli}&dtype=${dtype}`);
await pag.waitForFunction(() => window.resultado, null, { timeout: 1_800_000 });
console.log(nli, dtype, JSON.stringify(await pag.evaluate(() => window.resultado)));
await nav.close();
servidor.close();
