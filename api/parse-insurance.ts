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
    GCN_TNDS: { type: Type.STRING, description: "Số seri GCNBH (viết tắt/đầy đủ), thường nằm ở góc trên, ví dụ TNDS2609/409586" },
    Ten_chu_xe: { type: Type.STRING, description: "Tên chủ xe đầy đủ" },
    Dia_chi: { type: Type.STRING, description: "Địa chỉ chủ xe đầy đủ" },
    Dien_thoai: { type: Type.STRING, description: "Số điện thoại chủ xe (ví dụ 000****000 hoặc số cụ thể)" },
    Bien_kiem_soat: { type: Type.STRING, description: "Biển kiểm soát xe (ví dụ 15K77720)" },
    So_khung: { type: Type.STRING, description: "Số khung của xe (ví dụ RLUSW81HHNNO34303)" },
    So_may: { type: Type.STRING, description: "Số máy của xe (ví dụ D4HENH776828)" },
    Hang_xe: { type: Type.STRING, description: "Hãng xe (ví dụ HYUNDAI, TOYOTA, HONDA)" },
    Hieu_xe: { type: Type.STRING, description: "Hiệu xe (ví dụ HYUNDAI SANTAFE, CAMRY)" },
    Nam_san_xuat: { type: Type.STRING, description: "Năm sản xuất (ví dụ 2021, 2022)" },
    Loai_xe: { type: Type.STRING, description: "Loại xe (ví dụ Xe ô tô chở người, Xe tải)" },
    So_cho: { type: Type.STRING, description: "Số chỗ ngồi (ví dụ 5 chỗ, 7 chỗ hoặc số '7')" },
    Trong_tai: { type: Type.STRING, description: "Trọng tải (ví dụ 0 tấn, 15840.0 tấn hoặc 2.5 tấn)" },
    Muc_dich_su_dung: { type: Type.STRING, description: "Mục đích sử dụng: 'Kinh doanh' hoặc 'Không kinh doanh' (xem ô checkbox nào được tích v)" },
    Ngay_hieu_luc: { type: Type.STRING, description: "Thời hạn bảo hiểm - Từ ngày: định dạng dd/mm/yyyy (ví dụ 16/09/2026 từ '12 giờ 10 phút ngày 16 tháng 09 năm 2026')" },
    Ngay_ket_thuc: { type: Type.STRING, description: "Thời hạn bảo hiểm - Đến ngày: định dạng dd/mm/yyyy (ví dụ 16/09/2027 từ '12 giờ 10 phút ngày 16 tháng 09 năm 2027')" },
    Ngay_cap: { type: Type.STRING, description: "Ngày cấp bảo hiểm / ngày ký (định dạng dd/mm/yyyy, ví dụ 16/09/2026)" },
    Phi_bao_hiem_chua_VAT: { type: Type.STRING, description: "Phí bảo hiểm chưa VAT (số), bắt buộc lấy từ dòng 'Tổng phí bảo hiểm (Trước VAT)' hoặc '(Chưa VAT)'" },
    VAT: { type: Type.STRING, description: "VAT (số), bắt buộc lấy từ dòng 'VAT:'" },
    Tong_phi_bao_hiem_da_VAT: { type: Type.STRING, description: "Tổng phí bảo hiểm thanh toán gồm VAT (số), bắt buộc lấy từ dòng 'Tổng phí bảo hiểm thanh toán (gồm VAT)'" },
    Trang_thai: { type: Type.STRING, description: "Trạng thái thẻ. Kiểm tra mộc đỏ/chữ in chéo mờ trên tất cả các trang của PDF/ảnh (ví dụ 'ĐÃ SỬA ĐỔI', 'ĐÃ HỦY BỎ', 'ĐÃ HỦY') hoặc tên file/văn bản kèm theo: Nếu có 'ĐÃ SỬA ĐỔI' -> 'ĐÃ SỬA ĐỔI'; nếu có 'ĐÃ HỦY BỎ' hoặc 'ĐÃ HỦY' hoặc chữ 'HUỶ' -> 'HUỶ'; nếu không có dấu/chữ đặc biệt thì để trống." },
    Ghi_chu: { type: Type.STRING, description: "Ghi chú, bắt buộc trích xuất phần chữ đi kèm trong văn bản đính kèm sau biển số xe (ví dụ 'YÊN GL' từ '15K77720 YÊN GL', hoặc 'PHƯỚC TGBH' từ '65H07081 PHƯỚC TGBH'). Nếu không có chữ đính kèm thì để trống." },
  },
  required: [
    "GCN_TNDS", "Ten_chu_xe", "Dia_chi", "Dien_thoai", "Bien_kiem_soat", "So_khung", "So_may", 
    "Hang_xe", "Hieu_xe", "Nam_san_xuat", "Loai_xe", "So_cho", "Trong_tai", "Muc_dich_su_dung", 
    "Ngay_hieu_luc", "Ngay_ket_thuc", "Ngay_cap", "Phi_bao_hiem_chua_VAT", "VAT", 
    "Tong_phi_bao_hiem_da_VAT", "Trang_thai", "Ghi_chu"
  ]
};

const promptInstructions = `Analyze this insurance document and extract all 22 required fields with extreme accuracy.

Rules for "Trạng thái" (CỰC KỲ QUAN TRỌNG - Kiểm tra tất cả các trang PDF và văn bản đính kèm):
- Soi kỹ tất cả các trang của tài liệu (đặc biệt là trang 2 nơi có chứng nhận):
  * Nếu trên trang có con dấu mộc đỏ/chữ in nghiêng chéo "ĐÃ SỬA ĐỔI" -> Trạng thái BẮT BUỘC = "ĐÃ SỬA ĐỔI".
  * Nếu trên trang có con dấu mộc đỏ/chữ in nghiêng chéo "ĐÃ HỦY BỎ" hoặc "ĐÃ HỦY" hoặc tên file/văn bản kèm theo có chữ "HUỶ"/"HỦY" -> Trạng thái BẮT BUỘC = "HUỶ".
  * Nếu chứng nhận bình thường, không có con dấu hủy hay sửa đổi -> Trạng thái = "".

Rules for context & filename extraction:
- Biển kiểm soát & Ghi chú (CỰC KỲ QUAN TRỌNG):
  * Văn bản đính kèm có chứa Biển số xe và Ghi chú (ví dụ: "15K77720 YÊN GL", "65H07081 PHƯỚC TGBH", hoặc "HUỶ 12A11216 THƯƠNG TGBH").
  * Bạn BẮT BUỘC phải phân tách chính xác:
    - Biển kiểm soát: Lấy phần biển số (ví dụ: "15K77720", "65H07081").
    - Ghi chú: Lấy toàn bộ phần chữ còn lại trong văn bản đính kèm (ví dụ: "YÊN GL", "PHƯỚC TGBH", "THƯƠNG TGBH").
  * Tuyệt đối không bỏ qua thông tin Ghi chú này.

Rules for document extraction:
- GCN_TNDS: Số seri (thường nằm ở góc trên cùng, ví dụ: TNDS2609/409586)
- Tên chủ xe, Địa chỉ, Điện thoại: Lấy đầy đủ chính xác từ phần thông tin chủ xe
- Biển kiểm soát, Số khung, Số máy: Cực kỳ cẩn thận tránh nhầm lẫn ký tự OCR (B-8, S-5, D-0, I/L-1).
- Hãng xe, Hiệu xe, Năm sản xuất, Loại xe, Số chỗ, Trọng tải: Trích xuất chính xác theo nhãn tương ứng.
- Mục đích sử dụng: Quan sát checkbox nào được đánh dấu [v] hoặc [x]: "Kinh doanh" hoặc "Không kinh doanh".
- THỜI HẠN BẢO HIỂM:
  * Ngay_hieu_luc: Ngày bắt đầu (Từ ...), định dạng BẮT BUỘC dd/mm/yyyy. Ví dụ: '16/09/2026'.
  * Ngay_ket_thuc: Ngày kết thúc (Đến ...), định dạng BẮT BUỘC dd/mm/yyyy. Ví dụ: '16/09/2027'.
- Ngày cấp: Ngày cấp bảo hiểm (ngày cấp/ngày ký/ngày bắt đầu hiệu lực bảo hiểm). BẮT BUỘC định dạng dd/mm/yyyy. Ví dụ: '16/09/2026'.

QUY TẮC BẮT BUỘC VỀ PHÍ BẢO HIỂM (Copy chính xác từng chữ số):
- Phi_bao_hiem_chua_VAT: BẮT BUỘC lấy chính xác số tiền từ dòng "Tổng phí bảo hiểm (Trước VAT)" hoặc "(Chưa VAT)". KHÔNG ĐƯỢC lấy phí của từng mục riêng lẻ (1) hay (2).
- VAT: BẮT BUỘC lấy chính xác số tiền từ dòng "VAT:".
- Tong_phi_bao_hiem_da_VAT: BẮT BUỘC lấy chính xác số tiền từ dòng "Tổng phí bảo hiểm thanh toán (gồm VAT):".
- TUYỆT ĐỐI KHÔNG TỰ TÍNH TOÁN, KHÔNG TỰ LÀM TRÒN SỐ, KHÔNG BỎ HOẶC THÊM CHỮ SỐ.
`;

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

    const fileObj = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;
    const buffer = fs.readFileSync(fileObj.filepath);
    const utf8Name = fileObj.originalFilename || "unknown";
    const mimeType = fileObj.mimetype || "application/pdf";

    const prompt = `${promptInstructions}\nFilename Context: "${utf8Name}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
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
        responseSchema: responseSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty Gemini response");
    }

    const result = JSON.parse(text);

    if (result.Ngay_cap) result.Ngay_cap = normalizeDate(result.Ngay_cap);
    if (result.Ngay_hieu_luc) result.Ngay_hieu_luc = normalizeDate(result.Ngay_hieu_luc);
    if (result.Ngay_ket_thuc) result.Ngay_ket_thuc = normalizeDate(result.Ngay_ket_thuc);
    if (result.Phi_bao_hiem_chua_VAT) result.Phi_bao_hiem_chua_VAT = normalizeCurrency(result.Phi_bao_hiem_chua_VAT);
    if (result.VAT) result.VAT = normalizeCurrency(result.VAT);
    if (result.Tong_phi_bao_hiem_da_VAT) result.Tong_phi_bao_hiem_da_VAT = normalizeCurrency(result.Tong_phi_bao_hiem_da_VAT);

    const feeWarning = validateFees(result.Phi_bao_hiem_chua_VAT, result.VAT, result.Tong_phi_bao_hiem_da_VAT);

    return res.status(200).json({
      success: true,
      data: {
        ...result,
        originalFilename: utf8Name,
        feeWarning,
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