export interface InsuranceRecord {
  id: string; // internal id
  GCN_TNDS: string;
  Ten_chu_xe: string;
  Bien_kiem_soat: string;
  Ngay_cap: string;
  Phi_bao_hiem_chua_VAT: string;
  VAT: string;
  Tong_phi_bao_hiem_da_VAT: string;
  Trang_thai: string;
  Ghi_chu: string;
  originalFilename: string;
  status: "pending" | "processing" | "success" | "error";
  errorMessage?: string;
  file?: File;
}
