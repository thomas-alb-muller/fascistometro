# Leitor de frases: teste contra o B' v3

**Pergunta:** um modelo que lê frases de verdade, rodando local e de graça, resolve os erros de semântica do motor B' v3?

**Resposta curta:** em parte, sim. O melhor leitor acerta os três casos difíceis e marca mais as paráfrases fascistas. Mas ele piora o texto 05 (de 0 para 14), então não passa na regra do projeto ("acertar mais sem piorar nenhum dos 9"). E, do jeito que está, **não cabe na página publicada**: o modelo bom tem 559 MB, e o limite é 256 MB por versão (em base64, que ainda aumenta tudo em um terço). Minha recomendação é **não trocar o motor da página agora**. Mais abaixo explico o que daria para aproveitar.

> **Cuidado com os números:** os 9 textos são os mesmos usados para escolher os limites. Pior: testei 12 montagens (2 modelos de NLI × 2 regras × 3 sentidos) e escolhi a melhor olhando esses mesmos 9 textos. Então o resultado ainda não prova nada. Para provar, precisa de textos novos, com rótulo, que não tenham sido usados em nenhuma escolha.

## Como o leitor funciona

1. **Fora da conta:** as mesmas regras do B' (pergunta, citação, relato, frase curta), chamadas direto do `provisorio/motor.js`.
2. **Achar as teses:** o modelo de frase `paraphrase-multilingual-MiniLM-L12-v2` (versão ONNX da Xenova, comprimida em q8) transforma frases e teses em vetores. Cada frase pega as **3 teses mais parecidas**.
3. **Decidir:** um modelo de inferência textual (NLI) lê cada par e diz a probabilidade de implicação, neutro e contradição. Implicação conta como concorda, contradição como discorda, neutro como nada.
4. **Índice:** a mesma fórmula, 100 × concordâncias ÷ (frases na conta + 2). Concordância total vale 1 e parcial vale 0,5, como no B'.
5. **Limites:** escolhidos só com os 9 textos, pela regra do `calibrar.mjs` (mais acertos; empate, maior margem; depois, o limite mais exigente). O limite de contradição ficou fixo em 0,5, porque discordância não entra no índice.

O sinal da tese (afirma/rejeita) **deixa de ser usado**. O NLI lê o texto da tese como ele é. Por isso "tudo dentro do Estado" e "nada fora do Estado" não dependem mais da forma da frase.

### Variantes testadas

- **Modelos de NLI:** `multilingual-MiniLMv2-L6-mnli-xnli` (pequeno, ONNX do onnx-community) e `mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` (médio, ONNX da Xenova).
- **Sentido:** *ida* (o que foi pedido: premissa = frase, hipótese = tese), *volta* (premissa = tese, hipótese = frase) e *ambos* (vale a maior probabilidade dos dois). Testei a volta porque a tese quase sempre diz mais coisas do que a frase. Aí o NLI responde "neutro" na ida, mesmo quando a frase repete a ideia da tese.
- **Regra para escolher entre as 3 teses:** *maior* (vence a maior implicação ou a maior contradição entre as três) e *ordem* (vale a tese mais parecida que tiver resposta firme; as outras só entram se ela for neutra). A regra *maior* erra feio no pacifismo: a T25 dá implicação de 0,87, mas uma contradição de 0,96 com a T30, que é só a terceira mais parecida, leva a decisão.

### Um defeito encontrado no caminho: a versão q8 estraga os modelos de NLI

As versões comprimidas em q8 que estão no Hugging Face **não servem**. O MiniLMv2-L6 em q8 dá contradição de 0,48 para duas frases idênticas ("O gato está dormindo no sofá."). Em fp32 ou fp16, dá implicação de 0,99. O mDeBERTa em q8 também perde muito. Testei ainda uma compressão só nas multiplicações de matriz (`quantizar.py`): melhora, mas continua estragado (margem cai de 23 para 4, e a receita sobe para 17). Por isso os números abaixo usam o NLI em fp32/fp16, que deram resultado idêntico. O modelo de frase em q8 dá o mesmo resultado que em fp32.

## Resultado nos 9 textos

Linha de corte: índice ≥ 25 quando o esperado é alto.

| Montagem | Limites (total / parcial) | Acertos | Margem | Índices 01 · 02 · 03 · 04 · 05 · 06 · 07 · 08 · 09 |
|---|---|---|---|---|
| **B' v3 (página atual)** | 0,525 / 0,475 (semelhança) | **9** | **13** | 67 · 36 · 0 · 20 · 0 · 14 · 33 · 0 · 50 |
| MiniLM-L6, maior, ida (pedido original) | 0,525 / 0,525 | 7 | −17 | 67 · 29 · 17 · 0 · 14 · 0 · 0 · 0 · 0 |
| MiniLM-L6, ordem, ida | 0,425 / 0,425 | 8 | 0 | 67 · 29 · 17 · 0 · 14 · 0 · 17 · 0 · 25 |
| MiniLM-L6, ordem, ambos | 0,55 / 0,55 | 8 | −3 | 67 · 14 · 17 · 0 · 14 · 0 · 33 · 0 · 25 |
| mDeBERTa, maior, ida (pedido original) | 0,4 / 0,4 | 8 | −3 | 67 · 29 · 0 · 20 · 14 · 0 · 17 · 0 · 25 |
| mDeBERTa, maior, ambos | 0,925 / 0,4 | 9 | 15 | 58 · 29 · 0 · 10 · 7 · 0 · 25 · 0 · 25 |
| mDeBERTa, ordem, ida | 0,3 / 0,225 | 9 | 9 | 67 · 29 · 0 · 20 · 14 · 0 · 33 · 0 · 38 |
| mDeBERTa, ordem, volta | 0,85 / 0,075 | 9 | 19 | 67 · 36 · 0 · 0 · 14 · 0 · 33 · 0 · 38 |
| **mDeBERTa, ordem, ambos (melhor)** | 0,225 / 0,225 | **9** | **23** | 67 · 43 · 0 · 20 · 14 · 0 · 67 · 0 · 50 |

As outras montagens do MiniLM-L6 (maior/volta, maior/ambos, ordem/volta) deram 6 ou 7 acertos. Todas estão em `saida/`.

O MiniLM-L6 é fraco demais: erra o sinal até de frases copiadas da Doutrina. A versão pedida do mDeBERTa (regra *maior*, só a ida) dá 8 de 9. O resto deste relatório fala da melhor montagem: **mDeBERTa, regra ordem, dois sentidos**.

### Melhor montagem × B' v3, texto por texto

| Texto | Esperado | B' v3 | Leitor | Mudou |
|---|---|---|---|---|
| 01 Doutrina literal | alto | 67 | 67 | igual |
| 02 Outras palavras | alto | 36 | 43 | melhor |
| 03 Negado | baixo | 0 | 0 | igual |
| 04 Aula de história | baixo | 20 | 20 | igual |
| 05 Antifascista | baixo | 0 | **14** | **pior** |
| 06 Direitos humanos | baixo | 14 | 0 | melhor |
| 07 Militarista | alto | 33 | 67 | melhor |
| 08 Receita | baixo | 0 | 0 | igual |
| 09 Estado contra mercado | alto | 50 | 50 | igual |

**Os limites ficam firmes.** Com um limite só (total = parcial), dá 9 de 9 em toda a faixa de 0,15 a 0,85 (`sensibilidade.mjs`). A margem 23 só aparece entre 0,15 e 0,20; no resto da faixa, fica entre 5 e 11. O texto 05 fica em 14 em toda a faixa: o erro vem do NLI, não do limite.

### Frase por frase, nos textos que mudaram

**02 Outras palavras (36 → 43)**

| Frase | B' v3 | Leitor |
|---|---|---|
| O governo está acima de tudo e de todos; cada pessoa só vale enquanto serve à pátria. | nada (T28) | discorda T18 ✗ |
| Ser livre é cumprir obrigações, não reclamar direitos. | concorda T58 | concorda T58 |
| A ideia de um mundo sem conflitos armados é uma ilusão de fracos. | nada (T34) | concorda T26 ✓ |
| Rejeitamos o mercado livre e o individualismo dos liberais. | concorda parcial T45 | discorda T12 ✗ |
| O povo pede comando firme e obediência. | concorda T54 | concorda T23 |

Ganhou a frase da "ilusão de fracos", mas errou duas. Em "Rejeitamos o mercado livre…", o NLI enxerga contradição com a T12 ("O liberalismo negou o Estado… o Fascismo reasserta os direitos do Estado"). Ele se confunde com duas rejeições na mesma conta.

**05 Antifascista (0 → 14), o texto que piorou**

| Frase | B' v3 | Leitor |
|---|---|---|
| Nenhum governo pode estar acima das pessoas. | nada (T48) | **concorda T15 ✗** |
| Cada cidadão tem direitos que o Estado não pode tirar. | discorda T58 | discorda T58 ✓ |
| A democracia, com eleições livres e partidos diversos, é a melhor forma de governo que conhecemos. | discorda T15 | discorda T36 |
| A guerra não enobrece ninguém; ela destrói vidas. | discorda T55 | discorda T26 ✓ |
| Defendemos a igualdade de todos perante a lei e o direito de discordar. | discorda T58 | discorda T39 |

"Nenhum governo pode estar acima das pessoas" contra a T15 ("Nenhum indivíduo ou grupos… deve existir fora do Estado"): o NLI dá implicação de 0,74 na ida e de 0,86 na volta. Ele vai pela forma ("Nenhum… pode/deve"), não pelo sentido. É exatamente o tipo de erro que queríamos eliminar.

**06 Direitos humanos (14 → 0):** o B' concordava com a T36 na frase do sufrágio universal; o leitor discorda (T18). Todas as frases de direitos discordam, a maioria da T58.

**07 Militarista (33 → 67):** as 4 frases concordam com força total: guerra → T26, pacifismo → **T25**, expansão → T51, morrer pela pátria → T01. No B', o pacifismo discordava da T55 e as outras duas entravam só pela metade.

**09 Estado contra mercado (50 → 50):** índice igual, com teses mais adequadas (T48 e T43 em vez de T11 e T51).

**04 Aula de história (20 → 20):** os dois concordam com "Segundo a doutrina oficial, a guerra enobrecia os povos." Isso é um defeito das regras de fora da conta, e os dois motores dividem: a regra de atribuição procura "segundo" com letra minúscula e não pega "Segundo" no começo da frase. Corrigir isso baixaria o 04 para 0 nos dois.

**08 Receita:** índice 0 nos dois. Mas o leitor marca "discorda" em duas frases da receita (T31 e T26). Não muda o índice, mas apareceria na tela como discordância.

## Os três casos à parte

| Caso | Certo | B' v3 | Leitor (melhor montagem) |
|---|---|---|---|
| "O pacifismo é coisa de covardes que fogem do sacrifício." | concorda com a T25 | discorda da T55 ✗ | **concorda com a T25 ✓** (a T25 é a tese mais parecida, com 0,76; implicação de 0,87 na volta) |
| "Cada cidadão tem direitos que o Estado não pode tirar." | discorda da T58 | discorda da T58 (parcial) ✓ | **discorda da T58 ✓** (contradição de 0,99 na ida) |
| Texto 03 (negação da Doutrina) | perto de 0 | 0 ✓ | **0 ✓** (as 4 frases na conta discordam: T63, T26, T37, T54) |

Na montagem pedida (regra *maior*, só a ida), o pacifismo **continua errado**: a decisão vai para uma contradição com a T30. Ele só se resolve com a regra *ordem*.

## Tamanho e velocidade no navegador

### O que a página teria que baixar

| Peça | Tamanho | Em base64 (.txt) |
|---|---|---|
| Modelo de frase MiniLM-L12, q8 | 118 MB | 158 MB |
| Tokenizador do modelo de frase | 17 MB | 23 MB |
| NLI mDeBERTa, fp16 (o q8 estraga) | 559 MB | 745 MB |
| Tokenizador do mDeBERTa | 16 MB | 22 MB |
| ONNX Runtime `.wasm` (asyncify, o que o transformers.js 4.3 pede) | 26 MB | 35 MB |
| transformers.js | 0,6 MB | (pode vir do jsDelivr) |
| **Total** | **≈ 736 MB** | **≈ 980 MB** |

**Não cabe.** O limite é 256 MB por versão (e 64 MB por publicação, 16 MB por arquivo). Ficaria quase quatro vezes acima do limite, em umas 60 partes de 16 MB.

**Nem enxugando cabe.** Quase todo o peso vem da tabela de pedaços de palavra (250 mil pedaços de cem línguas). Contei quantos pedaços as 200 mil palavras mais comuns do português usam: 54 mil no mDeBERTa e 37 mil no MiniLM. Mesmo cortando a tabela só para esses pedaços, a conta fica assim:

- mDeBERTa fp16: ≈ 172 MB do miolo + 83 MB da tabela = ≈ 255 MB;
- MiniLM q8: ≈ 35 MB;
- wasm e tokenizadores: ≈ 30 MB;
- total ≈ 320 MB, ou ≈ 427 MB em base64.

Continua acima de 256 MB, e ainda seria um download enorme para quem só quer testar um texto. Só caberia com o NLI comprimido em int8, e isso hoje estraga o modelo.

O NLI pequeno (MiniLM-L6) caberia enxugado (≈ 70 MB, ≈ 95 MB em base64), mas a qualidade dele é ruim (7 ou 8 de 9).

### Velocidade

Medi no Chromium (Playwright), com WebAssembly e **uma linha de execução**, porque a página publicada não tem o isolamento que libera várias. A máquina tem 4 núcleos. Os 9 textos têm 36 frases na conta, o que dá 216 pares (3 teses × 2 sentidos).

| | Carga | Modelo de frase (36 frases + 64 teses) | NLI por par | Os 9 textos |
|---|---|---|---|---|
| Node, mDeBERTa fp16 (nativo, vários núcleos) | 9 s | — | ≈ 0,12 s | 25 s |
| Navegador, mDeBERTa fp16 | 16 s | 8,6 s | **1,07 s** | 240 s |
| Navegador, mDeBERTa fp32 | 23 s | 8,0 s | **0,84 s** | 190 s |
| Navegador, MiniLM-L6 fp16 | 18 s | 8,3 s | 0,09 s | 28 s |

Com o mDeBERTa no navegador, são **5 a 6 segundos por frase**. Um texto de 5 frases leva cerca de 30 segundos num computador; num celular, deve levar de 2 a 4 vezes mais. A carga não conta o download (os arquivos estavam no próprio computador).

## Recomendação

1. **Não trocar o motor da página agora.** O leitor bom não cabe nos limites da página, é lento demais no navegador e ainda piora o texto 05. Pela regra do projeto, a mudança não entra.
2. **O que vale aproveitar:** o modelo de frase para achar as teses. Ele acertou a tese em casos onde o B' errava (pacifismo → T25, guerra → T26, "ilusão de fracos" → T26). Ele sozinho pesa ≈ 135 MB (≈ 35 MB enxugado). No navegador, levou 8,6 s para 100 frases (as 36 dos textos mais as 64 teses), uns 0,09 s por frase. Com os vetores das teses calculados antes e publicados junto, um texto de 5 frases fica em menos de 1 s. Um próximo teste barato seria **B' com as teses achadas pelo MiniLM-L12** e o sinal lido pela regra de hoje. Isso cabe na página se a tabela de pedaços for enxugada.
3. **Para o NLI um dia caber:** um mDeBERTa enxugado e comprimido sem estragar (compressão calibrada, e não a automática) ou um NLI pequeno de melhor qualidade. Os dois precisam de mais teste.
4. **Antes de qualquer troca:** montar um conjunto novo de textos com rótulo, sem uso em escolha nenhuma, porque os 9 de hoje já foram usados demais.
5. **Defeito a corrigir nos dois motores:** a regra de atribuição não pega "Segundo…" no começo da frase.

## Como rodar

```bash
cd leitor && npm install                  # transformers.js 4.3.2
bash leitor/baixar.sh tudo                # modelos em leitor/modelos/ (fora do git)
# NLI completo, que o q8 estraga:
curl -sSfL -o leitor/modelos/Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7/onnx/model_fp16.onnx \
  https://huggingface.co/Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7/resolve/main/onnx/model_fp16.onnx
curl -sSfL -o leitor/modelos/onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX/onnx/model.onnx \
  https://huggingface.co/onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX/resolve/main/onnx/model.onnx
# dados do B' v3: provisorio/gerar_dados.py e o ajustes.json da página publicada em provisorio/dados/
node leitor/rodar.mjs mdeberta q8 fp16    # NLI, precisão do modelo de frase, precisão do NLI
node leitor/rodar.mjs minilm q8 fp32
node leitor/sensibilidade.mjs leitor/saida/resultado-mdeberta-q8-fp16-ordem-ambos.json
node leitor/medir_navegador.mjs mdeberta fp16
```

Arquivos:

- `leitor.js`: o leitor (roda no navegador e no Node);
- `rodar.mjs`: roda o leitor e o B' v3 e compara;
- `navegador.html` e `medir_navegador.mjs`: a medição no Chromium;
- `quantizar.py`: o teste de compressão só nas multiplicações;
- `saida/`: os resultados de cada montagem, frase por frase, com as probabilidades de cada par.

A rede do ambiente precisou liberar `us.aws.cdn.hf.co` e `us.gcp.cdn.hf.co`, que é de onde o Hugging Face serve os arquivos grandes.
