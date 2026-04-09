import json
import os
import re
from typing import List, Dict, Any, Optional
from services.rag_service import get_rag_service

class VinschoolTools:
    def __init__(self, data_path: str = r"d:\test_tts_and_live\data\rag_data.json"):
        self.data_path = data_path
        self.chunks = []
        self._rag_service = None
        self.load_data()

    @property
    def rag_service(self):
        if self._rag_service is None:
            self._rag_service = get_rag_service()
        return self._rag_service

    def load_data(self):
        if os.path.exists(self.data_path):
            with open(self.data_path, "r", encoding="utf-8") as f:
                self.chunks = json.load(f)
        else:
            print(f"Error: Data file not found at {self.data_path}")

    def _filter_by_sheet(self, sheet_name: str) -> List[Dict]:
        return [c for c in self.chunks if c.get("metadata", {}).get("sheet") == sheet_name]

    def get_student_profile(self, student_name: str = "Nguyễn Hưng") -> str:
        """Lấy thông tin cơ bản của học sinh."""
        sheet_data = self._filter_by_sheet("Student Information")
        for item in sheet_data:
            if student_name.lower() in item["content"].lower():
                return item["content"]
        return f"Không tìm thấy thông tin cho học sinh {student_name}."

    def get_attendance(self, date_str: str, student_id: str = "VS108245") -> str:
        """
        Lấy thông tin điểm danh của học sinh trong một ngày cụ thể.
        date_str: Định dạng 'DD/MM/YYYY' (ví dụ: '30/03/2026')
        """
        sheet_data = self._filter_by_sheet("Điểm danh")
        # Find entries for the specific date
        daily_attendance = []
        current_date_found = False
        
        for item in sheet_data:
            content = item["content"]
            # Look for date in content (e.g., "30/03/2026")
            if date_str in content:
                daily_attendance.append(content)
                current_date_found = True
            elif current_date_found and "Ngày:" not in content:
                # Some rows might not have the "Ngày:" prefix but belong to the same day in sequential data
                # However, in our JSON, each attendance record for a period is a separate chunk.
                # Let's check if the previous chunk was for the same date.
                daily_attendance.append(content)
            elif current_date_found and "Ngày:" in content and date_str not in content:
                # Hit a new date
                break
                
        if not daily_attendance:
            return f"Không có dữ liệu điểm danh cho ngày {date_str}."
        
        return "\n---\n".join(daily_attendance)

    def get_homework(self, status: str = "all", student_id: str = "VS108245") -> str:
        """
        Lấy danh sách bài tập. 
        status: 'all', 'Chưa làm', 'Đã làm', 'Đã hoàn thành'
        """
        sheet_data = self._filter_by_sheet("Bài tập")
        filtered = []
        for item in sheet_data:
            content = item["content"]
            if status == "all" or status.lower() in content.lower():
                filtered.append(content)
        
        if not filtered:
            return f"Không tìm thấy bài tập với trạng thái '{status}'."
            
        return "\n---\n".join(filtered)

    def get_menu(self, date_str: str) -> str:
        """
        Lấy thực đơn của nhà trường.
        date_str: Định dạng 'DD/MM/YYYY' (ví dụ: '16/03/2026')
        """
        sheet_data = self._filter_by_sheet("Thực đơn")
        menu_items = []
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
            return f"Không có dữ liệu thực đơn cho ngày {date_str}."
            
        return "\n---\n".join(menu_items)

    def get_tuition_info(self, student_id: str = "VS108245") -> str:
        """Lấy thông tin học phí và các khoản phí."""
        sheet_data = self._filter_by_sheet("Học phí")
        if not sheet_data:
            return "Không tìm thấy dữ liệu học phí."
        
        return "\n---\n".join([item["content"] for item in sheet_data])

    def get_teacher_comments(self, date_str: Optional[str] = None) -> str:
        """Lấy nhận xét của giáo viên."""
        sheet_data = self._filter_by_sheet("Nhận xét")
        if not date_str:
            return "\n---\n".join([item["content"] for item in sheet_data])
            
        filtered = [item["content"] for item in sheet_data if date_str in item["content"]]
        if not filtered:
            return f"Không có nhận xét nào trong ngày {date_str}."
        return "\n---\n".join(filtered)

    def general_search(self, query: str) -> str:
        """Tìm kiếm thông tin chung bằng RAG."""
        results = self.rag_service.query(query, top_k=3)
        if not results:
            return "Không tìm thấy thông tin liên quan."
            
        formatted_results = []
        for res in results:
            formatted_results.append(f"Nguồn: {res['metadata'].get('sheet', 'Chung')}\n{res['content']}")
            
        return "\n---\n".join(formatted_results)

# Global helper instance
_vinschool_tools = None

def get_vinschool_tools():
    global _vinschool_tools
    if _vinschool_tools is None:
        _vinschool_tools = VinschoolTools()
    return _vinschool_tools
