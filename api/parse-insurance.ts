import formidable from "formidable";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

export const config = {
    api: {
        bodyParser: false,
    },
};

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
});

function parseForm(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const form = formidable({
            multiples: false,
            keepExtensions: true,
        });

        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve({ fields, files });
        });
    });
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";
  let s = dateStr.trim();

  // 1. Try matching Vietnamese long format: "ngày 22 tháng 06 năm 2026" or "ngày 22 tháng 6, 2026" etc.
  const vnMatch = s.match(/(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
  if (vnMatch) {
    const day = vnMatch[1].padStart(2, '0');
    const month = vnMatch[2].padStart(2, '0');
    const year = vnMatch[3];
    return `${day}/${month}/${year}`;
  }

  // 2. Try matching DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${day}/${month}/${year}`;
  }

  // 3. Try matching YYYY-MM-DD or YYYY/MM/DD
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
  // Strip non-digit characters
  const cleanVal = val.replace(/[^0-9]/g, "");
  if (!cleanVal) return val;
  // Format with thousand separator commas
  return Number(cleanVal).toLocaleString("en-US");
}

export default async function handler(req: any, res: any) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed",
        });
    }

    try {
        const { files } = await parseForm(req);

        const uploadedFile = files.file;

        if (!uploadedFile) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded",
            });
        }

        const fileObj = Array.isArray(uploadedFile)
            ? uploadedFile[0]
            : uploadedFile;

        const buffer = fs.readFileSync(fileObj.filepath);

        const utf8Name =
            fileObj.originalFilename || "unknown";

        const mimeType =
            fileObj.mimetype || "application/pdf";

        const prompt = `Analyze this insurance document and extract the required fields with extreme accuracy.

Rules for "Trạng thái" (CỰC KỲ QUAN TRỌNG - Kiểm tra tất cả các trang PDF và văn bản đính kèm):
- Hãy soi kỹ tất cả các trang của tài liệu (đặc biệt là trang 2 của PDF nơi có chứng nhận):
  * Nếu trên trang có con dấu mộc đỏ/chữ in nghiêng chéo "ĐÃ SỬA ĐỔI" -> Trạng thái BẮT BUỘC = "ĐÃ SỬA ĐỔI".
  * Nếu trên trang có con dấu mộc đỏ/chữ in nghiêng chéo "ĐÃ HỦY BỎ" hoặc "ĐÃ HỦY" hoặc tên file/văn bản kèm theo có chữ "HUỶ"/"HỦY" -> Trạng thái BẮT BUỘC = "HUỶ".
  * Nếu chứng nhận bình thường, không có con dấu hủy hay sửa đổi -> Trạng thái = "".

Rules for context & filename extraction:
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
\nFilename Context: "${utf8Name}"
`;

        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",

            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: prompt,
                        },
                        {
                            inlineData: {
                                data: buffer.toString("base64"),
                                mimeType: mimeType,
                            },
                        },
                    ],
                },
            ],

            config: {
                responseMimeType: "application/json",

                responseSchema: {
                    type: Type.OBJECT,

                    properties: {
                        GCN_TNDS: { type: Type.STRING, description: "Số seri GCN_TNDS, thường nằm trên cùng, ví dụ TNDS2604/157973" },
                        Ten_chu_xe: { type: Type.STRING, description: "Tên chủ xe" },
                        Bien_kiem_soat: { type: Type.STRING, description: "Biển kiểm soát" },
                        Ngay_cap: { type: Type.STRING, description: "Ngày cấp bảo hiểm (ngày cấp/ngày ký/ngày bắt đầu hiệu lực), định dạng bắt buộc dd/mm/yyyy. Ví dụ: 22/06/2026." },
                        Phi_bao_hiem_chua_VAT: { type: Type.STRING, description: "Phí bảo hiểm chưa VAT (số), bắt buộc lấy từ dòng 'Tổng phí bảo hiểm (Trước VAT):(1)+(2)+(3)+(4)'." },
                        VAT: { type: Type.STRING, description: "VAT (số), bắt buộc lấy từ dòng 'VAT:'." },
                        Tong_phi_bao_hiem_da_VAT: { type: Type.STRING, description: "Tổng phí bảo hiểm đã VAT / thanh toán (số), bắt buộc lấy từ dòng 'Tổng phí bảo hiểm thanh toán (gồm VAT)'." },
                        Trang_thai: { type: Type.STRING, description: "Trạng thái thẻ. Kiểm tra mộc đỏ/chữ in chéo mờ trên tất cả các trang của PDF/ảnh (ví dụ 'ĐÃ SỬA ĐỔI', 'ĐÃ HỦY BỎ', 'ĐÃ HỦY') hoặc tên file/văn bản kèm theo: Nếu có 'ĐÃ SỬA ĐỔI' -> 'ĐÃ SỬA ĐỔI'; nếu có 'ĐÃ HỦY BỎ' hoặc 'ĐÃ HỦY' hoặc chữ 'HUỶ' -> 'HUỶ'; nếu không có dấu/chữ đặc biệt thì để trống." },
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
                },
            },
        });

        const text = response.text;

        if (!text) {
            throw new Error("Empty Gemini response");
        }

        const result = JSON.parse(text);

        // Apply normalization on fields
        if (result.Ngay_cap) {
          result.Ngay_cap = normalizeDate(result.Ngay_cap);
        }
        if (result.Phi_bao_hiem_chua_VAT) {
          result.Phi_bao_hiem_chua_VAT = normalizeCurrency(result.Phi_bao_hiem_chua_VAT);
        }
        if (result.VAT) {
          result.VAT = normalizeCurrency(result.VAT);
        }
        if (result.Tong_phi_bao_hiem_da_VAT) {
          result.Tong_phi_bao_hiem_da_VAT = normalizeCurrency(result.Tong_phi_bao_hiem_da_VAT);
        }

        return res.status(200).json({
            success: true,
            data: {
                ...result,
                originalFilename: utf8Name,
            },
        });
    } catch (error: any) {
        console.error(error);

        return res.status(500).json({
            success: false,
            error: error?.message || "Unknown error",
        });
    }
}