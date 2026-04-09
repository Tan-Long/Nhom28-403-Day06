Vinschool One "Smart Hub" — AI Product Spec
===========================================

**Hackathon Draft · Track: VinUni-VinSchool · April 2026**

Problem Statement
-----------------

App Vinschool One hiện tại chứa một lượng dữ liệu khổng lồ (điểm danh, bài tập, thực đơn, nhận xét, học phí...) nhưng bị phân mảnh thành quá nhiều tab/mục. Phụ huynh gặp khó khăn khi muốn tra cứu nhanh một thông tin cụ thể (phải nhớ đường dẫn navigation), đồng thời bị "bội thực" bởi các thông báo rác, văn bản dài dòng toàn chữ. Hậu quả là phụ huynh bỏ lỡ thông tin quan trọng hoặc quay sang nhắn tin làm phiền giáo viên những câu hỏi mà app đã có sẵn.

1 · AI Product Canvas
---------------------

### Value

**User:** Phụ huynh VinSchool (bận rộn, không có thời gian lướt app mỗi ngày).

**Pain:** - Quá nhiều tab, lạc lối khi tìm thông tin (VD: "Học phí học kỳ 1 ở đâu?").

*   Thông báo dài, toàn chữ, trôi tuột mất.
    
*   **AI giải (Solution):** - Thay vì "Parent đi tìm Data", dùng AI để "Data tự tìm Parent" qua giao diện hội thoại (Chat/Voice) và các thẻ tóm tắt trực quan (Visual Cards).
    

### Trust

**AI sai khi:** Lấy nhầm dữ liệu (VD: hỏi bài tập môn Toán lại lôi bài tập môn Khoa học ra).

**Recovery:** Mọi câu trả lời của AI luôn phải đính kèm deep-link (nút bấm) dẫn về màn hình gốc chứa dữ liệu (Grounding).

### Feasibility

**Cost:** Rất thấp. Chủ yếu dùng NLP (Natural Language Processing) để phân loại intent (ý định người dùng) và call API nội bộ của app, hoặc dùng LLM tóm tắt text ngắn.

**Latency:** < 1 giây cho các truy vấn tra cứu.

2 · User Stories — 3 Tính năng Cốt lõi
--------------------------------------

### Feature 1: Giao diện tìm kiếm hội thoại (Vin-Assistant)

**Trigger:** Phụ huynh lười tìm kiếm trong menu, gõ hoặc nói thẳng vào thanh search ở màn hình chính.

**PathTrải nghiệm Phụ huynhLogic AI phía sauHappy**Phụ huynh gõ: _"Tuần này Hưng có bài tập nào chưa làm?"_ -> Trả về 3 gạch đầu dòng ngắn gọn kèm nút "Mở bài tập".AI nhận diện Intent \[Check\_Homework\], Entity \[Current\_Week\], lọc data trạng thái \[Chưa làm\].**Complex**Phụ huynh hỏi chéo data: _"Hôm nay con ăn gì, có tiết thể dục không?"_ -> Trả về thực đơn + nhắc nhở mang giày thể thao.AI gọi cùng lúc 2 API: \[Thực\_đơn\] + \[TKB\].**Failure**Gõ tiếng lóng/sai chính tả không ra (VD: _"Tiền hụi tháng này ntn?"_)AI báo không hiểu, suggest 3 topic phổ biến: Học phí, Điểm số, Thực đơn.

### Feature 2: Smart Daily Brief (Bản tin 1 Phút Mỗi Sáng/Tối)

**Trigger:** Thay vì gửi 5 push notification lẻ tẻ trong ngày (báo điểm danh, báo thực đơn, nhận xét mới), AI gộp lại thành 1 bản tóm tắt gửi vào lúc 19h00.

**PathTrải nghiệm Phụ huynhMô tả hệ thốngHappy**Nhận 1 Push: _"Tóm tắt thứ 4 của Hưng: Vắng 1 tiết ESL, ăn hết suất, cô Kim Anh khen bài Văn"_. Phụ huynh click vào xem thẻ trực quan.LLM (Prompt: Tóm tắt 3 sự kiện nổi bật nhất trong ngày thành 1 câu < 20 chữ, highlight các data bất thường).**Boring Day**Ngày bình thường, không có điểm số hay nhận xét mới.Chỉ hiển thị card: _"Một ngày học tập suôn sẻ. Thực đơn hôm nay có Cơm trộn cá hồi con thích."_

### Feature 3: Actionable Notifications (Rút gọn thông báo chữ)

**Trigger:** Trường gửi một thông báo 500 chữ về việc nộp tiền ngoại khóa hoặc đổi phòng học.

**PathTrải nghiệm Phụ huynhMô tả hệ thốngHappy**Thay vì đọc bài văn dài, AI tự trích xuất thành 3 bullet points: **Sự kiện gì? Hạn chót bao giờ? Nút nộp tiền/Đăng ký ở đâu?**AI Extract information. Giữ nút "Đọc toàn văn bản" ở dưới cùng.

3 · Eval Metrics + Threshold
----------------------------

Ưu tiên **User Engagement** và **Time-to-Value** (Thời gian để phụ huynh lấy được thông tin cần thiết).

**MetricThreshold kỳ vọngRed flag (dấu hiệu thất bại)Time-to-Information**< 10 giây (từ lúc mở app đến lúc có thông tin)Phụ huynh vẫn phải click quá 4 lần.**Search Success Rate**\> 85% câu hỏi được AI trả về đúng data< 70% (NLP model không hiểu ngôn ngữ tự nhiên của phụ huynh).**Notification Open Rate**\> 60% đối với Smart Daily BriefPhụ huynh tắt Push Notification của app.

4 · Top 3 Failure Modes & Mitigations
-------------------------------------

1.  **Rủi ro: Bất đồng ngôn ngữ (Vocabulary Gap) giữa Hệ thống và Phụ huynh.**
    
    *   _Vấn đề:_ Hệ thống lưu là "Phí dịch vụ bán trú", phụ huynh gõ "Tiền ăn trưa". Hệ thống lưu "CIE Maths", phụ huynh gõ "Toán tiếng anh".
        
    *   _Khắc phục:_ Xây dựng bộ từ điển đồng nghĩa (Synonym mapping) dành riêng cho context Vinschool trước khi đưa vào mô hình AI xử lý.
        
2.  **Rủi ro: AI ảo giác (Hallucination) ra số liệu tài chính.**
    
    *   _Vấn đề:_ Phụ huynh hỏi "Tôi phải đóng bao nhiêu tiền?", AI tóm tắt sai số tiền từ 110.520.000đ thành 110.000đ. Đây là lỗi chết người.
        
    *   _Khắc phục:_ AI **tuyệt đối không** được dùng Text Generation (LLM) để tạo ra câu trả lời về Tài chính/Điểm số. Với các mục này, AI chỉ đóng vai trò phân tích Intent để lôi đúng giao diện bảng biểu (Hard-coded UI) ra hiển thị.
        
3.  **Rủi ro: Quyền riêng tư (Privacy) của học sinh.**
    
    *   _Vấn đề:_ Nhà có 2 con (Hưng lớp 5, em gái lớp 2), AI trả lời lộn data thực đơn của em sang anh.
        
    *   _Khắc phục:_ Contextual grounding. Mọi prompt đều phải đi kèm \[StudentID\] đang được select trên Header của app.
        

5 · ROI & Business Value (Tại sao Ban Giám Khảo nên chọn ý tưởng này?)
----------------------------------------------------------------------

*   **Đối với Phụ huynh:** Cứu họ khỏi ma trận thông tin. App trở thành một trợ lý ảo cá nhân thấu hiểu con họ, chứ không phải một cái kho chứa tài liệu.
    
*   **Đối với Giáo viên/Nhà trường:** Giảm tới 40% lượng tin nhắn Zalo/cuộc gọi rác từ phụ huynh hỏi những câu như _"Hôm nay cô có giao bài không?", "Tháng này hạn đóng tiền là hôm nào?"_.
    
*   **Về Tech:** Đây là ứng dụng thực tiễn nhất của GenAI trong UX/UI (Conversational UI + Smart Summarization) - chi phí triển khai thấp nhưng tạo ra Wow-moment tức thì cho người dùng đầu cuối.