import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
});

export const config = {
    runtime: "nodejs",
};

export default async function handler(req: any, res: any) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed",
        });
    }

    try {
        const formData = await req.formData();

        const file = formData.get("file") as File;

        if (!file) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded",
            });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const utf8Name = file.name;

        const prompt = `
Analyze this insurance document and extract the required fields.

Filename context: "${utf8Name}"

Rules:
- Trạng thái: nếu tên file có chữ "HUỶ" => "HUỶ"
- Nếu không => ""

- Ghi chú:
Lấy nội dung sau biển số xe trong tên file.

Ví dụ:
HUỶ 12A11216 THƯƠNG TGBH
=> THƯƠNG TGBH

51D93485 PHƯỚC.pdf
=> PHƯỚC

Nếu không xác định được:
=> lưu toàn bộ tên file.

Extract:

- GCN_TNDS
- Ten_chu_xe
- Bien_kiem_soat
- Ngay_cap
- Phi_bao_hiem_chua_VAT
- VAT
- Tong_phi_bao_hiem_da_VAT
- Trang_thai
- Ghi_chu

Return JSON only.
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
                                mimeType: file.type,
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
                        GCN_TNDS: { type: Type.STRING },
                        Ten_chu_xe: { type: Type.STRING },
                        Bien_kiem_soat: { type: Type.STRING },
                        Ngay_cap: { type: Type.STRING },
                        Phi_bao_hiem_chua_VAT: { type: Type.STRING },
                        VAT: { type: Type.STRING },
                        Tong_phi_bao_hiem_da_VAT: { type: Type.STRING },
                        Trang_thai: { type: Type.STRING },
                        Ghi_chu: { type: Type.STRING },
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
            error: error.message || "Unknown error",
        });
    }
}