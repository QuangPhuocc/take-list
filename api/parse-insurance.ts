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

        const prompt = `Analyze this insurance document and extract the required fields.
    
Filename context for "Trạng thái" and "Ghi chú": "${utf8Name}"
Rules for filename extraction:
- Trạng thái: Lấy từ tên file, nếu có chữ "HUỶ" -> "HUỶ". Nếu không -> "".
- Ghi chú: Nội dung thường nằm sau Biển kiểm soát của tên file. 
  Ví dụ tên file là "HUỶ 12A11216 THƯƠNG TGBH" thì biển số là 12A11216, ghi chú là "THƯƠNG TGBH".
  Ví dụ tên file là "51D93485 PHƯỚC.pdf" thì biển số là 51D93485, ghi chú là "PHƯỚC".
  Nếu tên file không rõ ràng, không thể tách trạng thái và ghi chú thì lưu toàn bộ "${utf8Name}" vào Ghi chú và để trống trạng thái.
  
Rules for document extraction:
- GCN_TNDS: Số seri (thường nằm trên cùng, ví dụ: TNDS2606/632467)
- Tên chủ xe: Tên chủ xe đầy đủ
- Biển kiểm soát: Biển kiểm soát của xe. Hãy CỰC KỲ CẨN THẬN để tránh lỗi OCR nhận diện sai chữ cái thành chữ số (hoặc ngược lại):
  * Nhầm chữ "B" thành số "8" (Ví dụ: "81B" bị nhận diện nhầm thành "818"). Hãy đảm bảo ký tự thứ 3 của biển số thường là chữ cái.
  * Nhầm chữ "S" thành số "5" (Ví dụ: "51S" bị nhận diện nhầm thành "515" hoặc "51").
  * Nhầm chữ "D" thành số "0" hoặc chữ "O".
  * Nhầm chữ "I" hoặc "L" thành số "1".
  Hãy đối chiếu định dạng biển số xe Việt Nam chuẩn: [2 chữ số mã tỉnh] + [1 hoặc 2 chữ cái sê-ri] + [dãy số phía sau].
- Ngày cấp: Ngày cấp bảo hiểm (ngày cấp/ngày ký/ngày bắt đầu hiệu lực bảo hiểm). BẮT BUỘC định dạng dd/mm/yyyy. Ví dụ: '22/06/2026'. Tìm ở phần chữ ký điện tử ký ngày dd/mm/yyyy hoặc góc dưới cùng bên phải.
- Phi_bao_hiem_chua_VAT: BẮT BUỘC phải lấy số tiền từ dòng "Tổng phí bảo hiểm (Trước VAT):(1)+(2)+(3)+(4)". KHÔNG lấy phí bảo hiểm riêng lẻ của mục 1 hay mục khác.
- VAT: BẮT BUỘC phải lấy từ dòng "VAT:" hoặc "Thuế giá trị gia tăng".
- Tong_phi_bao_hiem_da_VAT: BẮT BUỘC phải lấy từ dòng "Tổng phí bảo hiểm thanh toán (gồm VAT):".
- Ensure numbers are formatted as raw numbers or exactly as they appear.
`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",

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