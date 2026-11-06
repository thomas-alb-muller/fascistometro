"""Comprime o NLI só nas multiplicações de matriz (int8 por canal), sem mexer nas outras partes.
O q8 pronto do Hugging Face comprime tudo e estraga o modelo; este teste vê se o estrago some.
Uso: python -I leitor/quantizar.py entrada.onnx saida.onnx
"""
import sys
from onnxruntime.quantization import QuantType, quantize_dynamic

quantize_dynamic(sys.argv[1], sys.argv[2], op_types_to_quantize=["MatMul"], per_channel=True, weight_type=QuantType.QInt8)
