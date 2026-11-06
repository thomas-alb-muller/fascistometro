#!/usr/bin/env bash
# Baixa os modelos do teste para leitor/modelos/ (fica fora do git).
# Uso: bash leitor/baixar.sh [minilm|mdeberta|tudo]
set -euo pipefail
cd "$(dirname "$0")"
baixar() {
  local id=$1; shift
  for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json "$@"; do
    mkdir -p "modelos/$id/$(dirname "$f")"
    [ -s "modelos/$id/$f" ] || curl -sSfL -o "modelos/$id/$f" "https://huggingface.co/$id/resolve/main/$f"
  done
}
qual=${1:-minilm}
baixar Xenova/paraphrase-multilingual-MiniLM-L12-v2 onnx/model_quantized.onnx
if [ "$qual" != mdeberta ]; then baixar onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX onnx/model_quantized.onnx; fi
if [ "$qual" != minilm ]; then baixar Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 onnx/model_quantized.onnx spm.model added_tokens.json; fi
du -sh modelos/*/*
