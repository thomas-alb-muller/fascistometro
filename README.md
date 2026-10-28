# Fascistômetro

Mede o quanto um texto concorda com *A Doutrina do Fascismo* (Mussolini e Gentile). Sem API e sem IA paga: a régua são frases copiadas letra por letra da própria Doutrina.

## Situação atual: protótipo

Antes de fazer o site, estamos testando como comparar as frases do texto com as da Doutrina.

- `prototipo/teses.mjs`: a régua do teste, com frases copiadas da Doutrina.
- `prototipo/textos/`: os textos de calibragem.
- `prototipo/comparar.mjs`: divisão em frases (ou em blocos de ~30 palavras, quando o texto não tem pontuação), regra de negação, a conta e o jeito A, que compara só pelas palavras.
- `prototipo/relatorio-A.md`: o resultado do jeito A, frase por frase.
- `prototipo/exportar-itens.mjs`, `prototipo/vetores_spacy.py` e `prototipo/avaliar.mjs`: o jeito B', que compara por vetores de palavra do spaCy, e a avaliação dos dois jeitos com a mesma regra de cortes.

O B' é um substituto do jeito B planejado (modelo de sentido de frase), que não deu para baixar no ambiente de teste.

## Como rodar

Precisa do Node 20 ou mais novo.

```bash
npm install
```

```bash
npm run prototipo
```

Para o jeito B' (precisa do Python 3.10 ou mais novo; o modelo do spaCy tem 568 MB):

```bash
python3 -m venv .venv && .venv/bin/pip install "spacy>=3.8,<3.9" https://github.com/explosion/spacy-models/releases/download/pt_core_news_lg-3.8.0/pt_core_news_lg-3.8.0-py3-none-any.whl
```

```bash
node prototipo/exportar-itens.mjs itens.json prototipo/textos/*.txt
```

```bash
.venv/bin/python prototipo/vetores_spacy.py itens.json vetores.json
```

```bash
node prototipo/avaliar.mjs vetores.json prototipo/textos/*.txt
```
