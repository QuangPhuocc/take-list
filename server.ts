import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { createServer as createViteServer } from "vite";
import 'dotenv/config';
const app = express();
const PORT = 3000;

// Setup multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit per file
  },
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

// The schema we want Gemini to return
const responseSchema: Schema = {
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
    Ghi_chu: { type: Type.STRING, description: "Ghi chú, bắt buộc trích xuất phần chữ đi kèm trong văn bản đính kèm sau biển số xe (ví dụ 'YÊN GL' từ '15K77720 YÊN GL', hoặc 'PHƯỚC TGBH' từ '65H07081 PHƯỚC TGBH'). Nếu không có chữ đính kèm thì để trống." },
  },
  required: ["GCN_TNDS", "Ten_chu_xe", "Bien_kiem_soat", "Ngay_cap", "Phi_bao_hiem_chua_VAT", "VAT", "Tong_phi_bao_hiem_da_VAT", "Trang_thai", "Ghi_chu"]
};

// Enable JSON body parsing for URL requests
app.use(express.json());

// Helper function to extract URL and extra context from a text line
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
    filename = `${filename} (${extraContext})`;
  }
  return { url, extraContext, filename };
}

// Function to validate fee calculation
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

const promptInstructions = `Analyze this insurance document and extract the required fields with extreme accuracy.

Rules for context & filename extraction:
- Trạng thái: Lấy từ văn bản đính kèm/tên file. Nếu có chữ "HUỶ" -> "HUỶ". Nếu không -> "".
- Biển kiểm soát & Ghi chú (CỰC KỲ QUAN TRỌNG):
  * Văn bản đính kèm có chứa Biển số xe và Ghi chú (ví dụ: "15K77720 YÊN GL", "65H07081 PHƯỚC TGBH", hoặc "HUỶ 12A11216 THƯƠNG TGBH").
  * Bạn BẮT BUỘC phải phân tách chính xác:
    - Biển kiểm soát: Lấy phần biển số (ví dụ: "15K77720", "65H07081").
    - Ghi chú: Lấy toàn bộ phần chữ còn lại trong văn bản đính kèm (ví dụ: "YÊN GL", "PHƯỚC TGBH", "THƯƠNG TGBH").
  * Tuyệt đối không bỏ qua thông tin Ghi chú này.

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

// API route for parsing local uploaded files
app.post("/api/parse-insurance", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { buffer, mimetype, originalname } = req.file;
    const utf8Name = Buffer.from(originalname, "latin1").toString("utf8");

    const prompt = `${promptInstructions}\nFilename context for "Trạng thái" and "Ghi chú": "${utf8Name}"`;

    const base64Data = buffer.toString("base64");

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
                mimeType: mimetype,
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
      throw new Error("Empty response from AI");
    }

    const result = JSON.parse(text);

    if (result.Ngay_cap) result.Ngay_cap = normalizeDate(result.Ngay_cap);
    if (result.Phi_bao_hiem_chua_VAT) result.Phi_bao_hiem_chua_VAT = normalizeCurrency(result.Phi_bao_hiem_chua_VAT);
    if (result.VAT) result.VAT = normalizeCurrency(result.VAT);
    if (result.Tong_phi_bao_hiem_da_VAT) result.Tong_phi_bao_hiem_da_VAT = normalizeCurrency(result.Tong_phi_bao_hiem_da_VAT);

    const feeWarning = validateFees(result.Phi_bao_hiem_chua_VAT, result.VAT, result.Tong_phi_bao_hiem_da_VAT);

    res.json({ success: true, data: { ...result, originalFilename: utf8Name, feeWarning } });
  } catch (error: any) {
    console.error("Error parsing file:", error);
    res.status(500).json({ error: "Failed to parse document: " + (error?.message || "Unknown Error") });
  }
});

// API route for parsing PDF from URL
app.post("/api/parse-insurance-url", async (req, res) => {
  try {
    const { inputLine } = req.body;
    if (!inputLine || typeof inputLine !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'inputLine'" });
    }

    const parsed = parseUrlLine(inputLine);
    if (!parsed) {
      return res.status(400).json({ error: "No valid URL found in input" });
    }

    const { url, extraContext, filename } = parsed;

    // Fetch PDF from URL
    const pdfResponse = await fetch(url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF from URL (Status ${pdfResponse.status})`);
    }

    const arrayBuffer = await pdfResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const mimeType = pdfResponse.headers.get("content-type") || "application/pdf";

    const prompt = `${promptInstructions}\nFilename & Context: "${filename}"\nURL Context: "${url}"`;

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
      throw new Error("Empty response from AI");
    }

    const result = JSON.parse(text);

    if (result.Ngay_cap) result.Ngay_cap = normalizeDate(result.Ngay_cap);
    if (result.Phi_bao_hiem_chua_VAT) result.Phi_bao_hiem_chua_VAT = normalizeCurrency(result.Phi_bao_hiem_chua_VAT);
    if (result.VAT) result.VAT = normalizeCurrency(result.VAT);
    if (result.Tong_phi_bao_hiem_da_VAT) result.Tong_phi_bao_hiem_da_VAT = normalizeCurrency(result.Tong_phi_bao_hiem_da_VAT);

    const feeWarning = validateFees(result.Phi_bao_hiem_chua_VAT, result.VAT, result.Tong_phi_bao_hiem_da_VAT);

    res.json({
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
    res.status(500).json({ error: "Failed to process PDF URL: " + (error?.message || "Unknown Error") });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on http://localhost:" + PORT);
  });
}

export default app;

if (process.env.NODE_ENV !== "production") {
  startServer();
}