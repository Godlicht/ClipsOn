"""Select and report the device used by both WhisperX inference engines."""
import os
from pathlib import Path

_dll_directories = []


def select_device(requested, torch_cuda, ctranslate_cuda):
    if requested not in {"auto", "cpu", "cuda"}:
        raise ValueError("CLIPSON_DEVICE musi mieć wartość auto, cpu lub cuda.")
    available = torch_cuda and ctranslate_cuda
    if requested == "cuda" and not available:
        raise RuntimeError("GPU jest wymagane, ale PyTorch lub CTranslate2 nie widzi CUDA. Uruchom backend/setup.ps1 -Device cuda.")
    return "cuda" if available and requested != "cpu" else "cpu"


def runtime_info():
    import torch
    # PyTorch's CUDA wheel includes cuBLAS/cuDNN on Windows. Make these
    # libraries visible to CTranslate2 without changing the system PATH.
    if os.name == "nt" and torch.version.cuda:
        library_path = str(Path(torch.__file__).parent / "lib")
        if library_path not in os.environ.get("PATH", "").split(os.pathsep):
            os.environ["PATH"] = library_path + os.pathsep + os.environ.get("PATH", "")
            _dll_directories.append(os.add_dll_directory(library_path))
    import ctranslate2
    torch_cuda = torch.cuda.is_available()
    ct2_cuda = ctranslate2.get_cuda_device_count() > 0
    device = select_device(os.environ.get("CLIPSON_DEVICE", "auto"), torch_cuda, ct2_cuda)
    return {"device": device, "deviceName": torch.cuda.get_device_name(0) if device == "cuda" else "CPU",
            "computeType": "float16" if device == "cuda" else "int8",
            "cudaAvailable": torch_cuda and ct2_cuda, "torchVersion": torch.__version__}
