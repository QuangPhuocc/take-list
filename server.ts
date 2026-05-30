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

// The schema we want Gemini to return
const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    GCN_TNDS: { type: Type.STRING, description: "Số seri GCN_TNDS, thường nằm trên cùng, ví dụ TNDS2604/157973" },
    Ten_chu_xe: { type: Type.STRING, description: "Tên chủ xe" },
    Bien_kiem_soat: { type: Type.STRING, description: "Biển kiểm soát" },
    Ngay_cap: { type: Type.STRING, description: "Ngày cấp, thường nằm gần vị trí con dấu, phía dưới bên phải" },
    Phi_bao_hiem_chua_VAT: { type: Type.STRING, description: "Phí bảo hiểm chưa VAT (số)" },
    VAT: { type: Type.STRING, description: "VAT (số)" },
    Tong_phi_bao_hiem_da_VAT: { type: Type.STRING, description: "Tổng phí bảo hiểm đã VAT / thanh toán (số)" },
    Trang_thai: { type: Type.STRING, description: "Trạng thái thẻ. Nếu tên file có chữ 'HUỶ' thì là 'HUỶ', ngược lại để trống." },
    Ghi_chu: { type: Type.STRING, description: "Ghi chú, thường nằm sau biển kiểm soát trong tên file. Nếu tên file không rõ ràng thì lưu toàn bộ tên file vào đây." },
  },
  required: ["GCN_TNDS", "Ten_chu_xe", "Bien_kiem_soat", "Ngay_cap", "Phi_bao_hiem_chua_VAT", "VAT", "Tong_phi_bao_hiem_da_VAT", "Trang_thai", "Ghi_chu"]
};

// API routes FIRST
app.post("/api/parse-insurance", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { buffer, mimetype, originalname } = req.file;
    const utf8Name = Buffer.from(originalname, "latin1").toString("utf8");

    // We pass the filename as context because the user explicitly asked to parse it
    const prompt = `Analyze this insurance document and extract the required fields.
    
Filename context for "Trạng thái" and "Ghi chú": "${utf8Name}"
Rules for filename extraction:
- Trạng thái: Lấy từ tên file, nếu có chữ "HUỶ" -> "HUỶ". Nếu không -> "".
- Ghi chú: Nội dung thường nằm sau Biển kiểm soát của tên file. 
  Ví dụ tên file là "HUỶ 12A11216 THƯƠNG TGBH" thì biển số là 12A11216, ghi chú là "THƯƠNG TGBH".
  Ví dụ tên file là "51D93485 PHƯỚC.pdf" thì biển số là 51D93485, ghi chú là "PHƯỚC".
  Nếu tên file không rõ ràng, không thể tách trạng thái và ghi chú thì lưu toàn bộ "${utf8Name}" vào Ghi chú và để trống trạng thái.
  
Rules for document extraction:
- GCN_TNDS: Số seri (thường nằm trên cùng)
- Tên chủ xe: Tên chủ xe
- Biển kiểm soát: Biển kiểm soát
- Ngày cấp: Thường nằm gần ở vị trí con dấu, phía dưới bên phải
- Phí bảo hiểm chưa VAT
- VAT
- Tổng phí bảo hiểm đã VAT (thanh toán)
- Ensure numbers are formatted as raw numbers or exactly as they appear.
`;

    // Convert buffer to base64 for Gemini
    const base64Data = buffer.toString("base64");

    // We can use gemini-3.5-flash for better accuracy on documents and images
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
    // Include original filename logically
    res.json({ success: true, data: { ...result, originalFilename: utf8Name } });

  } catch (error: any) {
    console.error("Error parsing file:", error);
    res.status(500).json({ error: "Failed to parse document: " + (error?.message || "Unknown Error") });
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