# VinSchool One — Smart Hub (AI20K)

Ý tưởng hackathon (track AI20K: VinUni–VinSchool, tháng 4/2026): thêm lớp hội thoại AI lên app VinSchool One dành cho phụ huynh — thông tin chủ động qua chat, giọng nói và thông báo thông minh, thay vì phải lần nhiều tab.

## Tính năng trọng tâm

| Tính năng | Mô tả ngắn |
|-----------|------------|
| **Vin-Assistant** | Tra cứu bằng văn bản/giọng nói; phân loại intent + entity, gọi tool/mock API, trả về thẻ tóm tắt và deep-link về màn hình gốc. |
| **Smart Daily Brief** | Gom thông báo rời rạc thành bản tin tóm tắt (ví dụ gửi buổi tối). |
| **Actionable Notifications** | Trích từ thông báo dài thành 3 ý: việc gì, hạn, cần làm gì. |

**Ràng buộc thiết kế:** không dùng LLM để *sinh* số học phí hay điểm số — chỉ định tuyến tới UI/dữ liệu đúng; mọi truy vấn gắn với học sinh đang chọn (multi-child). Chi tiết: [`Spec_draft.md`](Spec_draft.md), [`CLAUDE.md`](CLAUDE.md).

## Cấu trúc repo

| Mục | Nội dung |
|-----|----------|
| `index.html` | Redirect sang `prototype.html`. |
| `prototype.html`, `prototype-data.js` | Prototype giao diện (tab Chat / Vin-Assistant, v.v.). |
| `vinschool_agent.py` | Agent Gemini (Vertex AI) + function calling tới mock tools. |
| `services/` | `vinschool_tools.py` (dữ liệu mock), `rag_service.py` (RAG). |
| `rag_data.json`, `faiss_index.bin` | Corpus chunk và chỉ mục FAISS cho tra cứu ngữ nghĩa. |
| `build_rag_index.py` | Tạo lại `faiss_index.bin` từ `rag_data.json`. |
| `AI20K_VinSchoolOne_Mockdata.xlsx` | Dữ liệu mẫu: học sinh, môn, bài tập, thực đơn, học phí… |
| `Userflow.md` | Sơ đồ luồng (Mermaid). |

## Chạy prototype (HTML)

```bash
cd /path/to/VinschoolOne
python3 -m http.server 8000
```

Mở trình duyệt: `http://localhost:8000/` (sẽ chuyển tới `prototype.html`).

> Prototype HTML hiển thị luồng UI; tích hợp API/RAG thật được mô tả trong spec và code Python.

## Backend Python (tùy chọn)

**Agent (Vertex AI / Gemini):** cần cấu hình Google Cloud (Vertex AI), biến môi trường project/region theo tài liệu `vertexai`. Chạy thử tùy theo entrypoint bạn thêm (repo tập trung vào class `VinschoolAgent` trong `vinschool_agent.py`).

**RAG — build lại chỉ mục:**

```bash
pip install faiss-cpu sentence-transformers torch
python3 build_rag_index.py
```

Biến môi trường tùy chọn: `RAG_DATA_PATH`, `RAG_EMBED_MODEL` (mặc định `paraphrase-multilingual-MiniLM-L12-v2`).

**Bảo mật:** không commit file `.env` (đã liệt kê trong `.gitignore`).

## Tài liệu thêm

- [`Spec_draft.md`](Spec_draft.md) — spec đầy đủ, user story, rủi ro.
- [`Userflow.md`](Userflow.md) — luồng Vin-Assistant.

---

*Nhóm 28 — E403 Lab.*
