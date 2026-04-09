#!/usr/bin/env python3
"""
Tạo lại faiss_index.bin từ rag_data.json (thứ tự vector = thứ tự chunk trong JSON).
Cần: pip install faiss-cpu sentence-transformers torch

  python3 build_rag_index.py

Biến môi trường tùy chọn: RAG_DATA_PATH, RAG_EMBED_MODEL (mặc định paraphrase-multilingual-MiniLM-L12-v2).
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("RAG_DATA_PATH", str(ROOT / "rag_data.json")))
OUT = ROOT / "faiss_index.bin"
MODEL = os.environ.get(
    "RAG_EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)


def main() -> None:
    import faiss  # type: ignore
    import numpy as np
    from sentence_transformers import SentenceTransformer  # type: ignore

    with open(DATA, "r", encoding="utf-8") as f:
        chunks = json.load(f)
    texts = [c.get("content", "") or "" for c in chunks]
    model = SentenceTransformer(MODEL)
    emb = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    emb = np.array(emb, dtype=np.float32)
    dim = emb.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(emb)
    faiss.write_index(index, str(OUT))
    print(f"Wrote {OUT} ({index.ntotal} vectors, dim={dim})")


if __name__ == "__main__":
    main()
