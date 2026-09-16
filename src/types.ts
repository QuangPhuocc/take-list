export interface InsuranceRecord {
  id: string; // internal id
  GCN_TNDS: string;
  Ten_chu_xe: string;
  Dia_chi: string;
  Dien_thoai: string;
  Bien_kiem_soat: string;
  So_khung: string;
  So_may: string;
  Hang_xe: string;
  Hieu_xe: string;
  Nam_san_xuat: string;
  Loai_xe: string;
  So_cho: string;
  Trong_tai: string;
  Muc_dich_su_dung: string;
  Ngay_hieu_luc: string;
  Ngay_ket_thuc: string;
  Ngay_cap: string;
  Phi_bao_hiem_chua_VAT: string;
  VAT: string;
  Tong_phi_bao_hiem_da_VAT: string;
  Trang_thai: string;
  Ghi_chu: string;
  originalFilename: string;
  url?: string;
  feeWarning?: string;
  status: "pending" | "processing" | "success" | "error";
  errorMessage?: string;
  file?: File;
  inputLine?: string;
}

export interface ColumnItem {
  key: keyof InsuranceRecord;
  label: string;
  enabled: boolean;
}
