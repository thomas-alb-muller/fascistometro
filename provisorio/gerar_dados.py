"""Gera a tabela reduzida de vetores de palavra que a página do Fascistômetro carrega.

Fonte: vetores do spaCy pt_core_news_lg (Explosion fastText Vectors, licença CC BY-SA 4.0).
Guarda só palavras minúsculas e feitas só de letras, entre as 100 mil linhas mais frequentes
da tabela, mais as palavras das teses. Cada vetor vira int8 com uma escala própria.
O peso SIF de cada palavra sai da posição dela na tabela (que está em ordem de frequência).

Saída em provisorio/dados/:
  vocab.txt         uma palavra por linha (a linha é o número da palavra)
  pesos.bin         float32, peso SIF de cada palavra
  escalas.bin       float32, escala do vetor de cada palavra
  vetores-1.bin ... int8, vetores em blocos de até 10 MB

Uso: python -I gerar_dados.py teses.json saida/
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import spacy

LINHAS = 100_000
A_SIF = 1e-3
BLOCO = 10_000_000


def principal(arq_teses: str, saida: str) -> None:
    nlp = spacy.load(
        "pt_core_news_lg",
        exclude=["parser", "ner", "tagger", "attribute_ruler", "lemmatizer", "morphologizer", "senter"],
    )
    vetores = nlp.vocab.vectors
    total = vetores.shape[0]
    H = math.log(total) + 0.5772

    escolhidas: dict[str, int] = {}
    for chave, linha in vetores.key2row.items():
        if linha >= LINHAS:
            continue
        palavra = nlp.vocab.strings[chave]
        if palavra == palavra.lower() and palavra.isalpha():
            escolhidas[palavra] = linha

    with open(arq_teses, encoding="utf-8") as f:
        teses = json.load(f)
    for texto in teses:
        for tok in nlp.tokenizer(texto):
            if not tok.is_alpha:
                continue
            linha = vetores.key2row.get(nlp.vocab[tok.lower_].orth)
            if linha is not None:
                escolhidas.setdefault(tok.lower_, linha)

    palavras = sorted(escolhidas, key=escolhidas.get)
    linhas = np.array([escolhidas[p] for p in palavras])
    matriz = vetores.data[linhas].astype(np.float32)
    escalas = np.abs(matriz).max(axis=1) / 127.0
    escalas[escalas == 0] = 1.0
    quantizados = np.clip(np.round(matriz / escalas[:, None]), -127, 127).astype(np.int8)
    prob = (1.0 / (linhas + 1)) / H
    pesos = (A_SIF / (A_SIF + prob)).astype(np.float32)

    destino = Path(saida)
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "vocab.txt").write_text("\n".join(palavras), encoding="utf-8")
    pesos.tofile(destino / "pesos.bin")
    escalas.astype(np.float32).tofile(destino / "escalas.bin")
    bruto = quantizados.tobytes()
    partes = [bruto[i : i + BLOCO] for i in range(0, len(bruto), BLOCO)]
    for n, parte in enumerate(partes, start=1):
        (destino / f"vetores-{n}.bin").write_bytes(parte)
    info = {"palavras": len(palavras), "dimensoes": int(matriz.shape[1]), "partes": len(partes)}
    (destino / "info.json").write_text(json.dumps(info), encoding="utf-8")
    print(json.dumps(info))


if __name__ == "__main__":
    principal(sys.argv[1], sys.argv[2])
