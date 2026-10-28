"""Vetores de frase para o protótipo B' (substituto do modelo de sentido, que a rede daqui não deixa baixar).

Cada frase vira a média dos vetores de palavra do spaCy (pt_core_news_lg), sem palavras vazias,
com peso SIF (palavra frequente pesa menos; a frequência vem da posição da palavra na tabela de
vetores, que está em ordem de frequência) e sem o primeiro componente comum (Arora et al., 2017).

Uso: python -I vetores_spacy.py itens.json vetores.json
"""
import json
import re
import sys
import unicodedata

import numpy as np
import spacy

A_SIF = 1e-3

nlp = spacy.load(
    "pt_core_news_lg",
    exclude=["parser", "ner", "tagger", "attribute_ruler", "lemmatizer", "morphologizer", "senter"],
)
vetores = nlp.vocab.vectors
H = np.log(vetores.shape[0]) + 0.5772


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def principal(entrada: dict):
    vazias = set(entrada["vazias"])
    nome = re.compile(entrada["nome"])

    def vetor(texto: str):
        soma, n = np.zeros(vetores.shape[1], dtype=np.float64), 0
        for tok in nlp.tokenizer(texto):
            if not tok.is_alpha:
                continue
            p = sem_acento(tok.lower_)
            if p in vazias or nome.match(p) or len(p) < 3:
                continue
            lex = nlp.vocab[tok.lower_]
            linha = vetores.key2row.get(lex.orth)
            if linha is None:
                continue
            prob = (1.0 / (linha + 1)) / H
            soma += (A_SIF / (A_SIF + prob)) * vetores.data[linha]
            n += 1
        return (soma / n) if n else None

    teses = {t["id"]: vetor(t["texto"]) for t in entrada["teses"]}
    conjuntos = {c["nome"]: [vetor(i["texto"]) for i in c["itens"]] for c in entrada["conjuntos"]}

    # remove o primeiro componente comum, calculado sobre todas as frases (teses e textos)
    todos = [v for v in teses.values() if v is not None]
    for lista in conjuntos.values():
        todos += [v for v in lista if v is not None]
    u = np.linalg.svd(np.vstack(todos), full_matrices=False)[2][0]

    def limpa(v):
        return None if v is None else [round(float(x), 5) for x in (v - u * (u @ v))]

    return {
        "teses": {k: limpa(v) for k, v in teses.items()},
        "conjuntos": {k: [limpa(v) for v in lista] for k, lista in conjuntos.items()},
    }


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        entrada = json.load(f)
    saida = principal(entrada)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(saida, f)
    n = sum(len(v) for v in saida["conjuntos"].values())
    print(f"{len(saida['teses'])} teses e {n} blocos com vetor")
