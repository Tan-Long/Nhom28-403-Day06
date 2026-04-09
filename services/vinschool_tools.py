import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.rag_service import get_rag_service

_REPO_ROOT = Path(__file__).resolve().parent.parent

DATA_PENDING_MSG = (
    "Nhà trường chưa cập nhật dữ liệu. Phụ huynh vui lòng thử lại sau."
)


def _default_data_path() -> Path:
    env = os.environ.get("RAG_DATA_PATH")
    if env:
        return Path(env).expanduser().resolve()
    return _REPO_ROOT / "rag_data.json"


def _date_variants(date_str: str) -> List[str]:
    """Chuẩn hóa ngày DD/MM/YYYY và YYYY-MM-DD để khớp nội dung JSON."""
    s = date_str.strip()
    variants = {s}
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s, fmt)
            variants.add(d.strftime("%d/%m/%Y"))
            variants.add(d.strftime("%Y-%m-%d"))
            break
        except ValueError:
            continue
    return list(variants)


def _sort_by_row(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(items, key=lambda x: x.get("metadata", {}).get("row", 0))


class VinschoolTools:
    def __init__(self, data_path: Optional[Path] = None):
        self.data_path = data_path or _default_data_path()
        self.chunks: List[Dict[str, Any]] = []
        self._rag_service = None
        self.load_data()

    @property
    def rag_service(self):
        if self._rag_service is None:
            self._rag_service = get_rag_service()
        return self._rag_service

    def load_data(self) -> None:
        if self.data_path.is_file():
            with open(self.data_path, "r", encoding="utf-8") as f:
                self.chunks = json.load(f)
        else:
            print(f"Error: Data file not found at {self.data_path}")

    def _filter_by_sheet(self, sheet_name: str) -> List[Dict[str, Any]]:
        return [c for c in self.chunks if c.get("metadata", {}).get("sheet") == sheet_name]

    def get_student_profile(self, student_name: str = "Nguyễn Hưng") -> str:
        sheet_data = self._filter_by_sheet("Student Information")
        for item in sheet_data:
            if student_name.lower() in item["content"].lower():
                return item["content"]
        return DATA_PENDING_MSG

    def get_attendance(self, date_str: str, student_id: str = "VS108245") -> str:
        sheet_data = _sort_by_row(self._filter_by_sheet("Điểm danh"))
        daily_attendance: List[str] = []
        current_date_found = False

        for item in sheet_data:
            content = item["content"]
            if date_str in content:
                daily_attendance.append(content)
                current_date_found = True
            elif current_date_found and "Ngày:" not in content:
                daily_attendance.append(content)
            elif current_date_found and "Ngày:" in content and date_str not in content:
                break

        if not daily_attendance:
            return DATA_PENDING_MSG

        return "\n---\n".join(daily_attendance)

    def get_homework(self, status: str = "all", student_id: str = "VS108245") -> str:
        sheet_data = self._filter_by_sheet("Bài tập")
        filtered: List[str] = []
        for item in sheet_data:
            content = item["content"]
            if status == "all" or status.lower() in content.lower():
                filtered.append(content)

        if not filtered:
            return DATA_PENDING_MSG

        return "\n---\n".join(filtered)

    def get_menu(self, date_str: str) -> str:
        sheet_data = _sort_by_row(self._filter_by_sheet("Thực đơn"))
        menu_items: List[str] = []
        found_date = False

        for item in sheet_data:
            content = item["content"]
            if date_str in content:
                found_date = True
                menu_items.append(content)
            elif found_date and "Ngày:" not in content:
                menu_items.append(content)
            elif found_date and "Ngày:" in content:
                break

        if not menu_items:
            return DATA_PENDING_MSG

        return "\n---\n".join(menu_items)

    def get_tuition_info(self, student_id: str = "VS108245") -> str:
        sheet_data = self._filter_by_sheet("Học phí")
        if not sheet_data:
            return DATA_PENDING_MSG

        return "\n---\n".join([item["content"] for item in sheet_data])

    def get_teacher_comments(self, date_str: Optional[str] = None) -> str:
        sheet_data = self._filter_by_sheet("Nhận xét")
        if not date_str:
            return "\n---\n".join([item["content"] for item in sheet_data])

        variants = _date_variants(date_str)
        filtered: List[str] = []
        for item in sheet_data:
            content = item["content"]
            if any(v in content for v in variants):
                filtered.append(content)

        if not filtered:
            return DATA_PENDING_MSG

        return "\n---\n".join(filtered)

    def general_search(self, query: str) -> str:
        results = self.rag_service.query(query, top_k=3)
        if not results:
            return DATA_PENDING_MSG

        formatted_results = []
        for res in results:
            formatted_results.append(
                f"Nguồn: {res['metadata'].get('sheet', 'Chung')}\n{res['content']}"
            )

        return "\n---\n".join(formatted_results)


_vinschool_tools: Optional[VinschoolTools] = None


def get_vinschool_tools() -> VinschoolTools:
    global _vinschool_tools
    if _vinschool_tools is None:
        _vinschool_tools = VinschoolTools()
    return _vinschool_tools
