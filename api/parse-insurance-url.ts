import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

function parseUrlLine(inputLine: string) {
  const trimmed = inputLine.trim();
  const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/i);
  if (!urlMatch) {
    return null;
  }
  const url = urlMatch[1];
  const extraContext = trimmed.replace(url, "").trim();
  let filename = url.split("/").pop()?.split("?")[0] || "document.pdf";
  if (extraContext) {
    filename = `${filename} ${extraContext}`;
  }
  return { url, extraContext, filename };
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";
  let s = dateStr.trim();
  const vnMatch = s.match(/(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
  if (vnMatch) {
    const day = vnMatch[1].padStart(2, '0');
    const month = vnMatch[2].padStart(2, '0');
    const year = vnMatch[3];
    return `${day}/${month}/${year}`;
  }
  const dmyMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${day}/${month}/${year}`;
  }
  const ymdMatch = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${day}/${month}/${year}`;
  }
  return s;
}

function normalizeCurrency(val: string): string {
  if (!val) return "";
  const cleanVal = val.replace(/[^0-9]/g, "");
  if (!cleanVal) return val;
  return Number(cleanVal).toLocaleString("en-US");
}

function validateFees(chuaVat: string, vat: string, daVat: string): string | undefined {
  const cleanNum = (val: string) => parseInt((val || "").replace(/[^0-9]/g, ""), 10) || 0;
  const numChuaVat = cleanNum(chuaVat);
  const numVat = cleanNum(vat);
  const numDaVat = cleanNum(daVat);

  if (numChuaVat > 0 && numDaVat > 0) {
    const computed = numChuaVat + numVat;
    const diff = Math.abs(computed - numDaVat);
    if (diff > 2) {
      return `Lưu ý: Phí chưa VAT (${chuaVat}) + VAT (${vat}) = ${computed.toLocaleString("en-US")}đ, khác với Tổng thanh toán (${daVat})! (Chênh lệch ${diff}đ)`;
    }
  }
  return undefined;
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    GCN_TNDS: { type: Type.STRING, description: "Số seri GCN_TNDS, thường nằm trên cùng, ví dụ TNDS2604/157973" },
    Ten_chu_xe: { type: Type.STRING, description: "Tên chủ xe" },
    Bien_kiem_soat: { type: Type.STRING, description: "Biển kiểm soát" },
    Ngay_cap: { type: Type.STRING, description: "Ngày cấp bảo hiểm (ngày cấp/ngày ký/ngày bắt đầu hiệu lực), định dạng bắt buộc dd/mm/yyyy. Ví dụ: 22/06/2026." },
    Phi_bao_hiem_chua_VAT: { type: Type.STRING, description: "Phí bảo hiểm chưa VAT (số), bắt buộc lấy từ dòng 'Tổng phí bảo hiểm (Trước VAT):(1)+(2)+(3)+(4)'." },
    VAT: { type: Type.STRING, description: "VAT (số), bắt buộc lấy từ dòng 'VAT:'." },
    Tong_phi_bao_hiem_da_VAT: { type: Type.STRING, description: "Tổng phí bảo hiểm đã VAT / thanh toán (số), bắt buộc lấy từ dòng 'Tổng phí bảo hiểm thanh toán (gồm VAT)'." },
    Trang_thai: { type: Type.STRING, description: "Trạng thái thẻ. Nếu tên file có chữ 'HUỶ' thì là 'HUỶ', ngược lại để trống." },
    Ghi_chu: { type: Type.STRING, description: "Ghi chú, thường nằm sau biển kiểm soát trong tên file. Nếu tên file không rõ ràng thì lưu toàn bộ tên file vào đây." },
  },
  required: [
    "GCN_TNDS",
    "Ten_chu_xe",
    "Bien_kiem_soat",
    "Ngay_cap",
    "Phi_bao_hiem_chua_VAT",
    "VAT",
    "Tong_phi_bao_hiem_da_VAT",
    "Trang_thai",
    "Ghi_chu",
  ],
};

const promptInstructions = `Analyze this insurance document and extract the required fields with extreme accuracy.

Rules for context & filename extraction:
- Trạng thái: Lấy từ tên file/văn bản kèm theo. Nếu có chữ "HUỶ" -> "HUỶ". Nếu không -> "".
- Biển kiểm soát & Ghi chú:
  * Nếu văn bản kèm theo chứa biển kiểm soát (ví dụ "15K77720 YÊN GL" hoặc "HUỶ 12A11216 THƯƠNG TGBH"):
    - Biển kiểm soát: Ưu tiên biển số trong văn bản kèm theo (ví dụ: "15K77720" hoặc "12A11216") nếu trên chứng nhận khó đọc.
    - Ghi chú: Phần thông tin còn lại trong văn bản (ví dụ: "YÊN GL" hoặc "THƯƠNG TGBH").
  * Nếu văn bản không rõ ràng, lưu toàn bộ văn bản đính kèm vào Ghi chú.

Rules for document extraction:
- GCN_TNDS: Số seri (thường nằm trên cùng, ví dụ: TNDS2606/632467)
- Tên chủ xe: Tên chủ xe đầy đủ
- Biển kiểm soát: Biển kiểm soát của xe. Hãy CỰC KỲ CẨN THẬN tránh nhầm lẫn chữ cái và số:
  * Nhầm chữ "B" thành "8", chữ "S" thành "5", chữ "D" thành "0", chữ "I/L" thành "1".
  * Định dạng biển số xe Việt Nam chuẩn: [2 chữ số mã tỉnh] + [1 hoặc 2 chữ cái sê-ri] + [dãy số phía sau].
- Ngày cấp: Ngày cấp bảo hiểm (ngày cấp/ngày ký/ngày bắt đầu hiệu lực bảo hiểm). BẮT BUỘC định dạng dd/mm/yyyy. Ví dụ: '22/06/2026'.

QUY TẮC BẮT BUỘC VỀ PHÍ BẢO HIỂM (Cực kỳ quan trọng - Copy chính xác từng chữ số):
- Phi_bao_hiem_chua_VAT: BẮT BUỘC lấy chính xác số tiền từ dòng "Tổng phí bảo hiểm (Trước VAT):(1)+(2)+(3)+(4)" hoặc dòng "Tổng phí bảo hiểm (Trước VAT)". KHÔNG ĐƯỢC lấy phí của từng mục riêng lẻ (1) hay (2).
- VAT: BẮT BUỘC lấy chính xác số tiền từ dòng "VAT:" hoặc "Thuế giá trị gia tăng".
- Tong_phi_bao_hiem_da_VAT: BẮT BUỘC lấy chính xác số tiền từ dòng "Tổng phí bảo hiểm thanh toán (gồm VAT):".
- TUYỆT ĐỐI KHÔNG TỰ TÍNH TOÁN, KHÔNG TỰ LÀM TRÒN SỐ, KHÔNG BỎ HOẶC THÊM CHỮ SỐ. Hãy chép chính xác chữ số ghi trên tài liệu.
`;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { inputLine } = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (!inputLine || typeof inputLine !== "string") {
      return res.status(400).json({ success: false, error: "Thiếu dữ liệu 'inputLine'" });
    }

    const parsed = parseUrlLine(inputLine);
    if (!parsed) {
      return res.status(400).json({ success: false, error: "Không tìm thấy đường link hợp lệ trong văn bản" });
    }

    const { url, filename } = parsed;

    // Fetch PDF from remote URL with User-Agent header
    const pdfResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
    });

    if (!pdfResponse.ok) {
      throw new Error(`Không thể tải PDF từ link (Mã lỗi ${pdfResponse.status}: ${pdfResponse.statusText})`);
    }

    const arrayBuffer = await pdfResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const mimeType = pdfResponse.headers.get("content-type") || "application/pdf";

    const prompt = `${promptInstructions}\nFilename Context: "${filename}"\nURL: "${url}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType.includes("pdf") || mimeType.includes("image") ? mimeType : "application/pdf",
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Không nhận được phản hồi từ AI");
    }

    const result = JSON.parse(text);

    if (result.Ngay_cap) result.Ngay_cap = normalizeDate(result.Ngay_cap);
    if (result.Phi_bao_hiem_chua_VAT) result.Phi_bao_hiem_chua_VAT = normalizeCurrency(result.Phi_bao_hiem_chua_VAT);
    if (result.VAT) result.VAT = normalizeCurrency(result.VAT);
    if (result.Tong_phi_bao_hiem_da_VAT) result.Tong_phi_bao_hiem_da_VAT = normalizeCurrency(result.Tong_phi_bao_hiem_da_VAT);

    const feeWarning = validateFees(result.Phi_bao_hiem_chua_VAT, result.VAT, result.Tong_phi_bao_hiem_da_VAT);

    return res.status(200).json({
      success: true,
      data: {
        ...result,
        originalFilename: filename,
        url,
        feeWarning,
      },
    });
  } catch (error: any) {
    console.error("Error parsing PDF URL:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Lỗi xử lý file từ URL",
    });
  }
}
