# Fascistômetro

Mede o quanto um texto concorda com *A Doutrina do Fascismo* (Mussolini e Gentile). Sem API e sem IA paga: a régua são frases copiadas letra por letra da própria Doutrina.

## Situação atual: protótipo

Antes de fazer o site, estamos testando como comparar as frases do texto com as da Doutrina.

- `prototipo/teses.mjs`: a régua do teste, com frases copiadas da Doutrina.
- `prototipo/textos/`: os textos de teste.
- `prototipo/comparar.mjs`: o jeito A, que compara só pelas palavras.
- `prototipo/relatorio-A.md`: o resultado do jeito A, frase por frase.

O jeito A só reconhece quem copia a Doutrina quase ao pé da letra. O jeito B, que compara pelo sentido com um modelo que roda no próprio computador, ainda vai ser testado.

## Como rodar

Precisa do Node 20 ou mais novo.

```bash
npm install
```

```bash
npm run prototipo
```
