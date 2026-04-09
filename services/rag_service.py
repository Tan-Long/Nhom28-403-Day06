import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

_REPO_ROOT = Path(__file__).resolve().parent.parent


def _default_rag_data_path() -> Path:
    env = os.environ.get("RAG_DATA_PATH")
    if env:
        return Path(env).expanduser().resolve()
    return _REPO_ROOT / "rag_data.json"


def _tokenize(text: str) -> List[str]:
    text = text.lower()
    return [t for t in re.split(r"[^\w]+", text, flags=re.UNICODE) if len(t) > 1]


def _score_chunk(query_tokens: List[str], content: str) -> float:
    if not query_tokens:
        return 0.0
    ct = set(_tokenize(content))
    if not ct:
        return 0.0
    hits = sum(1 for t in query_tokens if t in ct)
    return hits / (len(query_tokens) ** 0.5)


class RagService:
    """RAG tìm kiếm trên rag_data.json: ưu tiên FAISS + embedding nếu khả dụng, không thì chấm điểm từ khóa."""

    def __init__(self, data_path: Optional[Path] = None):
        self.data_path = data_path or _default_rag_data_path()
        self.chunks: List[Dict[str, Any]] = []
        self._faiss_index = None
        self._embed_model = None
        self._load_chunks()
        self._try_load_faiss()

    def _load_chunks(self) -> None:
        if not self.data_path.is_file():
            return
        with open(self.data_path, "r", encoding="utf-8") as f:
            self.chunks = json.load(f)

    def _try_load_faiss(self) -> None:
        index_path = _REPO_ROOT / "faiss_index.bin"
        if not index_path.is_file():
            return
        try:
            import faiss  # type: ignore
            from sentence_transformers import SentenceTransformer  # type: ignore
        except ImportError:
            return
        try:
            self._faiss_index = faiss.read_index(str(index_path))
            self._embed_model = SentenceTransformer(
                os.environ.get(
                    "RAG_EMBED_MODEL",
                    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                )
            )
        except Exception:
            self._faiss_index = None
            self._embed_model = None

    def query(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        if not self.chunks:
            return []
        q = query.strip()
        if not q:
            return []

        if self._faiss_index is not None and self._embed_model is not None:
            try:
                import numpy as np

                if self._faiss_index.ntotal != len(self.chunks):
                    raise ValueError("FAISS index out of sync with rag_data.json; rebuild with build_rag_index.py")
                vec = self._embed_model.encode([q], normalize_embeddings=True)
                scores, indices = self._faiss_index.search(
                    vec.astype("float32"), min(top_k, len(self.chunks))
                )
                out: List[Dict[str, Any]] = []
                for idx, sc in zip(indices[0], scores[0]):
                    if 0 <= idx < len(self.chunks):
                        c = self.chunks[idx]
                        out.append(
                            {
                                "content": c.get("content", ""),
                                "metadata": c.get("metadata", {}),
                                "score": float(sc),
                            }
                        )
                return out[:top_k]
            except Exception:
                pass

        qt = _tokenize(q)
        ranked: List[tuple] = []
        for i, c in enumerate(self.chunks):
            content = c.get("content", "")
            s = _score_chunk(qt, content)
            if s > 0:
                ranked.append((s, i))
        ranked.sort(key=lambda x: -x[0])
        out = []
        for s, i in ranked[:top_k]:
            c = self.chunks[i]
            out.append(
                {
                    "content": c.get("content", ""),
                    "metadata": c.get("metadata", {}),
                    "score": s,
                }
            )
        return out


_rag_service: Optional[RagService] = None


def get_rag_service() -> RagService:
    global _rag_service
    if _rag_service is None:
        _rag_service = RagService()
    return _rag_service
