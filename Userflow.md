graph TD
    %% Define Nodes
    A(Phụ huynh mở app Vinschool One)
    B[Màn hình chính Hub có Thanh Search/Icon Trợ lý]
    C(Chọn Trợ lý/Search)
    D{Phương thức?}
    E[Nhập text câu hỏi]
    F[Sử dụng giọng nói]
    G[Vin-Assistant xử lý NLP & Intent]

    H(AI xác định đúng Intent Tra cứu: e.g., TKB)
    I[AI xác định Intent Tài chính/Điểm số]
    J(AI không hiểu Intent - Confidence thấp)

    K[Gọi API lấy data TKB, Thực đơn, Bài tập]
    L(Tạo thẻ Tóm tắt trực quan + nút Deep-link)
    M(Hiển thị màn hình dữ liệu gốc cứng, không tóm tắt)
    N(Hiện thông báo lỗi + gợi ý các topic phổ biến)

    O(Phụ huynh xem thông tin trên Thẻ)
    P{Muốn xem chi tiết?}
    Q[Click nút Deep-link]
    R(Mở màn hình tab đơn lẻ của app gốc: TKB tuần)

    S(Phụ huynh click nút Thử lại hoặc gõ câu hỏi mới)

    %% Define Styles
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style G fill:#ccf,stroke:#f66,stroke-width:2px,color:#fff
    style H fill:#d4f1f4,stroke:#333
    style I fill:#ffe0b2,stroke:#333
    style J fill:#ffcdd2,stroke:#333

    %% Define Connections
    A --> B
    B --> C
    C --> D
    D -- Gõ text --> E
    D -- Nói --> F
    E --> G
    F --> G

    G --> H
    G --> I
    G --> J

    H --> K
    K --> L
    L --> O
    O --> P
    P -- Có --> Q
    Q --> R
    P -- Không --> End((Kết thúc))

    I --> M
    M --> O

    J --> N
    N --> S
    S --> D