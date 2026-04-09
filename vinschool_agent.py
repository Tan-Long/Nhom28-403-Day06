import vertexai
from vertexai.generative_models import GenerativeModel, Tool, FunctionDeclaration, Content, Part
from services.vinschool_tools import get_vinschool_tools
import os
from typing import List, Dict, Any

# Tool declarations for Gemini
get_student_profile_declaration = FunctionDeclaration(
    name="get_student_profile",
    description="Lấy thông tin cơ bản của học sinh (tên, lớp, trường, mã học sinh).",
    parameters={
        "type": "OBJECT",
        "properties": {
            "student_name": {
                "type": "STRING",
                "description": "Tên học sinh cần tra cứu."
            }
        }
    }
)

get_attendance_declaration = FunctionDeclaration(
    name="get_attendance",
    description="Lấy thông tin điểm danh chi tiết của học sinh theo ngày.",
    parameters={
        "type": "OBJECT",
        "properties": {
            "date_str": {
                "type": "STRING",
                "description": "Ngày cần tra cứu định dạng DD/MM/YYYY (ví dụ: 30/03/2026)."
            }
        },
        "required": ["date_str"]
    }
)

get_homework_declaration = FunctionDeclaration(
    name="get_homework",
    description="Lấy danh sách bài tập, hạn nộp và trạng thái hoàn thành.",
    parameters={
        "type": "OBJECT",
        "properties": {
            "status": {
                "type": "STRING",
                "description": "Lọc theo trạng thái: 'all', 'Chưa làm', 'Đã làm'."
            }
        }
    }
)

get_menu_declaration = FunctionDeclaration(
    name="get_menu",
    description="Lấy thực đơn (bữa trưa và bữa phụ) của nhà trường theo ngày.",
    parameters={
        "type": "OBJECT",
        "properties": {
            "date_str": {
                "type": "STRING",
                "description": "Ngày cần tra cứu định dạng DD/MM/YYYY (ví dụ: 16/03/2026)."
            }
        },
        "required": ["date_str"]
    }
)

get_tuition_info_declaration = FunctionDeclaration(
    name="get_tuition_info",
    description="Lấy thông tin chi tiết về học phí, số dư và hạn thanh toán.",
    parameters={"type": "OBJECT", "properties": {}}
)

general_school_search_declaration = FunctionDeclaration(
    name="general_school_search",
    description="Tìm kiếm thông tin chung về quy định, FAQ hoặc thông báo của nhà trường.",
    parameters={
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": "Câu hỏi tra cứu."
            }
        },
        "required": ["query"]
    }
)

vinschool_tool = Tool(
    function_declarations=[
        get_student_profile_declaration,
        get_attendance_declaration,
        get_homework_declaration,
        get_menu_declaration,
        get_tuition_info_declaration,
        general_school_search_declaration
    ]
)

class VinschoolAgent:
    def __init__(self, model_name: str = "gemini-3.1-flash-lite-preview"):
        self.model = GenerativeModel(
            model_name,
            tools=[vinschool_tool],
            system_instruction=(
                "Bạn là Vin-Assistant, trợ lý ảo thông minh cho phụ huynh VinSchool. "
                "Nhiệm vụ của bạn là giúp phụ huynh tra cứu thông tin nhanh chóng và chính xác. "
                "QUY TẮC CỐT LÕI: "
                "1. Luôn sử dụng tool để lấy dữ liệu trước khi trả lời. "
                "2. Đối với Học phí và Bài tập: Trả lời ngắn gọn, trung thực, tuyệt đối không bịa đặt số liệu. "
                "3. Nếu không tìm thấy dữ liệu, hãy báo rõ và gợi ý phụ huynh kiểm tra lại thông tin. "
                "4. Giọng điệu: Lễ phép, thân thiện, chuyên nghiệp. "
                "5. Luôn ưu tiên tóm tắt ý chính thành bullet points cho dễ đọc."
            )
        )
        self.tools = get_vinschool_tools()
        self.chat = self.model.start_chat()

    async def chat_with_tools(self, user_input: str):
        response = await self.chat.send_message_async(user_input)
        
        # Handle tool calls (Function Calling)
        part = response.candidates[0].content.parts[0]
        if part.function_call:
            function_call = part.function_call
            name = function_call.name
            args = function_call.args
            
            print(f"DEBUG: AI calling tool: {name} with args: {args}")
            
            # Execute the tool
            result = ""
            if name == "get_student_profile":
                result = self.tools.get_student_profile(**args)
            elif name == "get_attendance":
                result = self.tools.get_attendance(**args)
            elif name == "get_homework":
                result = self.tools.get_homework(**args)
            elif name == "get_menu":
                result = self.tools.get_menu(**args)
            elif name == "get_tuition_info":
                result = self.tools.get_tuition_info(**args)
            elif name == "general_school_search":
                result = self.tools.general_search(**args)
            
            # Send result back to AI
            response = await self.chat.send_message_async(
                Part.from_function_response(
                    name=name,
                    response={"content": result}
                )
            )
            
        return response.text

    async def get_daily_brief(self, date_str: str) -> str:
        """Thực hiện Feature 2: Smart Daily Brief."""
        # Gom dữ liệu từ nhiều tool
        attendance = self.tools.get_attendance(date_str)
        menu = self.tools.get_menu(date_str)
        comments = self.tools.get_teacher_comments(date_str)
        
        prompt = (
            f"Hãy tạo một 'Bản tin 1 Phút Mỗi Sáng' cho phụ huynh vào ngày {date_str} dựa trên dữ liệu sau:\n"
            f"ĐIỂM DANH:\n{attendance}\n"
            f"THỰC ĐƠN:\n{menu}\n"
            f"NHẬN XÉT GIÁO VIÊN:\n{comments}\n\n"
            "YÊU CẦU: Tóm tắt 3 sự kiện/thông tin nổi bật nhất thành các dòng cực ngắn gọn. "
            "Nếu có bất thường (đi muộn, không ăn hết suất), hãy highlight. "
            "Nếu ngày học suôn sẻ, hãy dùng giọng điệu tích cực."
        )
        
        model_no_tools = GenerativeModel("gemini-3.1-flash-lite-preview")
        response = await model_no_tools.generate_content_async(prompt)
        return response.text

    async def extract_actionable_notif(self, announcement_text: str) -> str:
        """Thực hiện Feature 3: Actionable Notifications."""
        prompt = (
            "Bạn là chuyên gia tóm tắt thông báo học đường. Hãy trích xuất thông tin từ văn bản sau thành 3 ý chính:\n"
            "1. Sự kiện gì?\n"
            "2. Hạn chót bao giờ?\n"
            "3. Hành động cần làm (nút bấm/đăng ký ở đâu)?\n\n"
            f"VĂN BẢN: {announcement_text}\n\n"
            "Định dạng trả về: Bullet points ngắn gọn."
        )
        
        model_no_tools = GenerativeModel("gemini-3.1-flash-lite-preview")
        response = await model_no_tools.generate_content_async(prompt)
        return response.text

# Singleton implementation
_vinschool_agent = None

def get_vinschool_agent():
    global _vinschool_agent
    if _vinschool_agent is None:
        _vinschool_agent = VinschoolAgent()
    return _vinschool_agent
