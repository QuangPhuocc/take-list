import React, { useState, useCallback, useRef } from "react";
import { Copy, Upload, FileType, CheckCircle, XCircle, Loader2, Download, AlertCircle, Link as LinkIcon, Sparkles, RefreshCw, Trash2, Edit3, Check, FileWarning, Settings, FileDown } from "lucide-react";
import * as xlsx from "xlsx";
import JSZip from "jszip";
import { type InsuranceRecord, type ColumnItem } from "./types";
import { ConfigModal } from "./components/ConfigModal";

const DEFAULT_COLUMNS: ColumnItem[] = [
  { key: "GCN_TNDS", label: "GCN_TNDS", enabled: true },
  { key: "Ten_chu_xe", label: "Tên chủ xe", enabled: true },
  { key: "Bien_kiem_soat", label: "Biển kiểm soát", enabled: true },
  { key: "Ngay_cap", label: "Ngày cấp", enabled: true },
  { key: "Phi_bao_hiem_chua_VAT", label: "Phí bảo hiểm chưa VAT", enabled: true },
  { key: "VAT", label: "VAT", enabled: true },
  { key: "Tong_phi_bao_hiem_da_VAT", label: "Tổng phí bảo hiểm đã VAT", enabled: true },
  { key: "Trang_thai", label: "Trạng thái", enabled: true },
  { key: "Ghi_chu", label: "Ghi chú", enabled: true },
  // Extra fields disabled by default
  { key: "Dia_chi", label: "Địa chỉ", enabled: false },
  { key: "Dien_thoai", label: "Điện thoại", enabled: false },
  { key: "So_khung", label: "Số khung", enabled: false },
  { key: "So_may", label: "Số máy", enabled: false },
  { key: "Hang_xe", label: "Hãng xe", enabled: false },
  { key: "Hieu_xe", label: "Hiệu xe", enabled: false },
  { key: "Nam_san_xuat", label: "Năm sản xuất", enabled: false },
  { key: "Loai_xe", label: "Loại xe", enabled: false },
  { key: "So_cho", label: "Số chỗ", enabled: false },
  { key: "Trong_tai", label: "Trọng tải", enabled: false },
  { key: "Muc_dich_su_dung", label: "Mục đích sử dụng", enabled: false },
  { key: "Ngay_hieu_luc", label: "Ngày hiệu lực (Từ)", enabled: false },
  { key: "Ngay_ket_thuc", label: "Ngày kết thúc (Đến)", enabled: false },
];

const STORAGE_KEY = "TASCO_EXPORT_COLUMNS_V5";

export default function App() {
  const [activeTab, setActiveTab] = useState<"url" | "file">("url");
  const [urlInput, setUrlInput] = useState<string>("");
  const [records, setRecords] = useState<InsuranceRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<InsuranceRecord>>({});
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  // Column configuration with localStorage persistence
  const [columns, setColumns] = useState<ColumnItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ColumnItem[] = JSON.parse(saved);
        const existingKeys = new Set(parsed.map((c) => c.key));
        const missing = DEFAULT_COLUMNS.filter((c) => !existingKeys.has(c.key));
        return [...parsed, ...missing];
      }
    } catch (e) { }
    return DEFAULT_COLUMNS;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = records.some(r => r.status === "pending" || r.status === "processing");

  const createEmptyRecord = (id: string, filename: string, url?: string, inputLine?: string, file?: File): InsuranceRecord => ({
    id,
    GCN_TNDS: "",
    Ten_chu_xe: "",
    Dia_chi: "",
    Dien_thoai: "",
    Bien_kiem_soat: "",
    So_khung: "",
    So_may: "",
    Hang_xe: "",
    Hieu_xe: "",
    Nam_san_xuat: "",
    Loai_xe: "",
    So_cho: "",
    Trong_tai: "",
    Muc_dich_su_dung: "",
    Ngay_hieu_luc: "",
    Ngay_ket_thuc: "",
    Ngay_cap: "",
    Phi_bao_hiem_chua_VAT: "",
    VAT: "",
    Tong_phi_bao_hiem_da_VAT: "",
    Trang_thai: "",
    Ghi_chu: "",
    originalFilename: filename,
    url,
    inputLine,
    status: "pending",
    file,
  });

  // Helper to parse multi-line text input into URL blocks with associated context text (even if on the next line)
  const parseUrlBlocks = (rawText: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = Array.from(rawText.matchAll(urlRegex));
    
    if (matches.length === 0) return [];

    const items: { url: string; extraContext: string; combinedLine: string; filename: string }[] = [];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const url = match[0];
      const matchIndex = match.index!;
      const urlEndIndex = matchIndex + url.length;
      
      const nextUrlIndex = (i + 1 < matches.length) ? matches[i + 1].index! : rawText.length;
      const textSegment = rawText.slice(urlEndIndex, nextUrlIndex);
      
      const extraContext = textSegment.replace(/[\r\n]+/g, " ").trim();
      const combinedLine = extraContext ? `${url} ${extraContext}` : url;
      
      let filename = url.split("/").pop()?.split("?")[0] || "pdf-document.pdf";
      if (extraContext) {
        filename = `${filename} (${extraContext})`;
      }

      items.push({ url, extraContext, combinedLine, filename });
    }

    return items;
  };

  const parsedUrlBlocks = parseUrlBlocks(urlInput);

  // Process batch of URL blocks
  const handleProcessUrls = () => {
    if (parsedUrlBlocks.length === 0) return;

    const newRecords: InsuranceRecord[] = parsedUrlBlocks.map((block) =>
      createEmptyRecord(crypto.randomUUID(), block.filename, block.url, block.combinedLine)
    );

    setRecords((prev) => [...prev, ...newRecords]);
    setUrlInput("");
    processQueue(newRecords);
  };

  // Process batch of local files
  const handleFiles = useCallback((files: File[]) => {
    const newRecords: InsuranceRecord[] = files.map((file) =>
      createEmptyRecord(crypto.randomUUID(), file.name, undefined, undefined, file)
    );

    setRecords((prev) => [...prev, ...newRecords]);
    processQueue(newRecords);
  }, []);

  const processQueue = async (items: InsuranceRecord[]) => {
    for (const item of items) {
      setRecords((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: "processing" } : r))
      );

      const startTime = Date.now();

      try {
        let response: Response;

        if (item.url || item.inputLine) {
          response = await fetch("/api/parse-insurance-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inputLine: item.inputLine || item.url }),
          });
        } else if (item.file) {
          const formData = new FormData();
          formData.append("file", item.file as Blob);
          response = await fetch("/api/parse-insurance", {
            method: "POST",
            body: formData,
          });
        } else {
          throw new Error("No source file or URL provided");
        }

        if (!response.ok) {
          let errMsg = "Lỗi xử lý phía server";
          try {
            const errJson = await response.json();
            if (errJson.error) errMsg = errJson.error;
          } catch (e) { }
          throw new Error(errMsg);
        }

        const json = await response.json();

        if (json.success && json.data) {
          setRecords((prev) =>
            prev.map((r) =>
              r.id === item.id
                ? {
                    ...r,
                    status: "success",
                    GCN_TNDS: json.data.GCN_TNDS || "",
                    Ten_chu_xe: json.data.Ten_chu_xe || "",
                    Dia_chi: json.data.Dia_chi || "",
                    Dien_thoai: json.data.Dien_thoai || "",
                    Bien_kiem_soat: json.data.Bien_kiem_soat || "",
                    So_khung: json.data.So_khung || "",
                    So_may: json.data.So_may || "",
                    Hang_xe: json.data.Hang_xe || "",
                    Hieu_xe: json.data.Hieu_xe || "",
                    Nam_san_xuat: json.data.Nam_san_xuat || "",
                    Loai_xe: json.data.Loai_xe || "",
                    So_cho: json.data.So_cho || "",
                    Trong_tai: json.data.Trong_tai || "",
                    Muc_dich_su_dung: json.data.Muc_dich_su_dung || "",
                    Ngay_hieu_luc: json.data.Ngay_hieu_luc || "",
                    Ngay_ket_thuc: json.data.Ngay_ket_thuc || "",
                    Ngay_cap: json.data.Ngay_cap || "",
                    Phi_bao_hiem_chua_VAT: json.data.Phi_bao_hiem_chua_VAT || "",
                    VAT: json.data.VAT || "",
                    Tong_phi_bao_hiem_da_VAT: json.data.Tong_phi_bao_hiem_da_VAT || "",
                    Trang_thai: json.data.Trang_thai || "",
                    Ghi_chu: json.data.Ghi_chu || "",
                    feeWarning: json.data.feeWarning,
                  }
                : r
            )
          );
        } else {
          throw new Error(json.error || "Unknown error");
        }
      } catch (error: any) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === item.id
              ? { ...r, status: "error", errorMessage: error.message }
              : r
          )
        );
      }

      const elapsed = Date.now() - startTime;
      const minInterval = 4500;
      if (elapsed < minInterval) {
        await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed));
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const startEditing = (r: InsuranceRecord) => {
    setEditingId(r.id);
    setEditForm({ ...r });
  };

  const saveEditing = () => {
    if (!editingId) return;
    setRecords((prev) =>
      prev.map((r) => (r.id === editingId ? ({ ...r, ...editForm } as InsuranceRecord) : r))
    );
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const deleteRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSaveColumns = (newCols: ColumnItem[]) => {
    setColumns(newCols);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCols));
    } catch (e) {}
  };

  const handleResetColumns = () => {
    setColumns(DEFAULT_COLUMNS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  };

  const exportExcel = () => {
    const completedRecords = records.filter(r => r.status === 'success' || r.status === 'error');
    if (completedRecords.length === 0) return;

    const enabledCols = columns.filter((c) => c.enabled);

    const parseCurrency = (val: string) => {
      if (!val) return val;
      const numString = val.replace(/[^0-9]/g, "");
      if (!numString) return val;
      return Number(numString);
    };

    const currencyKeys = new Set(["Phi_bao_hiem_chua_VAT", "VAT", "Tong_phi_bao_hiem_da_VAT"]);

    const dataRows = completedRecords.map((r, index) => {
      const rowObj: Record<string, any> = { STT: index + 1 };
      
      enabledCols.forEach((col) => {
        let val = r[col.key] || "";
        if (col.key === "Ghi_chu" && r.status === "error") {
          val = "Lỗi: " + (r.errorMessage || "Chưa xác định");
        }

        if (currencyKeys.has(col.key as string)) {
          rowObj[col.label] = parseCurrency(val as string);
        } else {
          rowObj[col.label] = val;
        }
      });

      return rowObj;
    });

    const worksheet = xlsx.utils.json_to_sheet(dataRows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "BaoHiem");

    const columnWidths = [{ wch: 5 }, ...enabledCols.map((c) => ({ wch: Math.max(c.label.length + 5, 16) }))];
    worksheet['!cols'] = columnWidths;

    xlsx.writeFile(workbook, "Bang_Ke_Thong_Tin_Bao_Hiem.xlsx");
  };

  const downloadAllPdfs = async () => {
    const validRecords = records.filter((r) => r.status === "success" || r.file || r.url);
    if (validRecords.length === 0) return;

    setIsDownloadingPdf(true);
    setDownloadProgress(0);

    try {
      const zip = new JSZip();
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");

      const folderName = `${dd}-${mm}-${yy} ${hh}-${min}-${ss}`;
      const zipFolder = zip.folder(folderName)!;

      const filenameCounts: Record<string, number> = {};

      for (let i = 0; i < validRecords.length; i++) {
        const r = validRecords[i];
        setDownloadProgress(i + 1);

        let pdfData: ArrayBuffer | null = null;

        if (r.file) {
          pdfData = await r.file.arrayBuffer();
        } else if (r.url) {
          try {
            let res = await fetch(r.url);
            if (!res.ok) {
              res = await fetch(`/api/download-proxy?url=${encodeURIComponent(r.url)}`);
            }
            if (res.ok) {
              pdfData = await res.arrayBuffer();
            }
          } catch (e) {
            try {
              const res = await fetch(`/api/download-proxy?url=${encodeURIComponent(r.url)}`);
              if (res.ok) {
                pdfData = await res.arrayBuffer();
              }
            } catch (err) {}
          }
        }

        if (pdfData) {
          let bks = (r.Bien_kiem_soat || "").trim();
          let ghiChu = (r.Ghi_chu || "").trim();

          let baseName = "";
          if (bks && ghiChu) {
            baseName = `${bks} ${ghiChu}`;
          } else if (bks) {
            baseName = bks;
          } else if (ghiChu) {
            baseName = ghiChu;
          } else {
            baseName = (r.originalFilename || "document").replace(/\.pdf$/i, "").trim();
          }

          // Clean invalid filename characters
          baseName = baseName.replace(/[\\/:*?"<>|]/g, "_").trim();

          let fileName: string;
          if (!filenameCounts[baseName]) {
            filenameCounts[baseName] = 1;
            fileName = `${baseName}.pdf`;
          } else {
            filenameCounts[baseName] += 1;
            fileName = `${baseName} (${filenameCounts[baseName]}).pdf`;
          }

          zipFolder.file(fileName, pdfData);
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (error: any) {
      alert("Có lỗi xảy ra khi tải toàn bộ PDF: " + (error.message || "Không xác định"));
    } finally {
      setIsDownloadingPdf(false);
      setDownloadProgress(0);
    }
  };

  const clearRecords = () => {
    setRecords([]);
  };

  const loadSampleUrl = () => {
    setUrlInput(
      `https://s3-han02.fptcloud.com/core-insurance-2/policy/certification/MOTOR_CERTIFICATE_TNDS_BB_FLAT/TNDS2609-795993-91621.pdf 65A76697 PHƯỚC TGBH\nhttps://s3-han02.fptcloud.com/core-insurance-2/policy/certification/MOTOR_CERTIFICATE_TNDS_BB_ENDORSEMENT_FLAT/TNDS2609-136681-71938.pdf 77E01141 YÊN GL\nhttps://s3-han02.fptcloud.com/core-insurance-2/policy/certification/MOTOR_CERTIFICATE_TNDS_BB_FLAT/TNDS2609-876951-62552.pdf 83H00097 PHƯỚC TGBH`
    );
  };

  const totalCount = records.length;
  const completedCount = records.filter(r => r.status === "success" || r.status === "error").length;
  const successCount = records.filter(r => r.status === "success").length;
  const errorCount = records.filter(r => r.status === "error").length;
  const warningCount = records.filter(r => r.feeWarning).length;
  const pendingCount = records.filter(r => r.status === "pending" || r.status === "processing").length;
  
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const estimatedSecondsLeft = pendingCount * 4.5;
  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return "Hoàn thành";
    if (seconds < 60) return `${Math.ceil(seconds)} giây`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins} phút ${secs} giây`;
  };

  const enabledColumns = columns.filter((c) => c.enabled);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">KÊ THẺ TASCO V5</h1>
            </div>
            <p className="inline-block mt-2 px-3 py-1.5 bg-blue-50 text-blue-700 font-bold border border-blue-200 rounded-lg text-sm shadow-sm">
              Kê nhanh thông tin thẻ bảo hiểm. Có thể có sai sót, vui lòng DOUBLE CHECK
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setIsConfigOpen(true)}
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Settings className="w-4 h-4 text-blue-600" />
              Cấu hình file xuất
            </button>
            <button
              onClick={clearRecords}
              disabled={records.length === 0 || isProcessing}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4 text-slate-400" />
              Xóa danh sách
            </button>
            <button
              onClick={exportExcel}
              disabled={records.length === 0 || isProcessing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Xuất Excel ({enabledColumns.length} cột)
            </button>
          </div>
        </header>

        {/* Input Selector Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex border-b border-slate-200 gap-6">
            <button
              onClick={() => setActiveTab("url")}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === "url"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              Nhập danh sách Link PDF
            </button>
            <button
              onClick={() => setActiveTab("file")}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === "file"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Upload className="w-4 h-4" />
              Tải file từ máy tính
            </button>
          </div>

          {/* TAB 1: URL Input (DEFAULT) */}
          {activeTab === "url" && (
            <div className="space-y-3">
              <div className="flex justify-end items-center text-xs text-slate-500">
                <button
                  onClick={loadSampleUrl}
                  className="text-blue-600 font-medium hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Nạp link mẫu
                </button>
              </div>

              <textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Dán danh sách các đường link PDF vào đây"
                rows={7}
                className="w-full p-3.5 font-mono text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y shadow-inner"
              />

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-1">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  Số lượng link hợp lệ phát hiện: <strong className="text-blue-600">{parsedUrlBlocks.length}</strong> link
                </span>
                <button
                  onClick={handleProcessUrls}
                  disabled={parsedUrlBlocks.length === 0 || isProcessing}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  Đọc thông tin tất cả link ({parsedUrlBlocks.length})
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: File Upload Zone */}
          {activeTab === "file" && (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-blue-500 transition-colors rounded-2xl p-10 text-center cursor-pointer group"
            >
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleInputChange}
                onClick={(e) => { e.currentTarget.value = ""; }}
                className="hidden"
                accept="image/*,application/pdf,text/plain"
              />
              <div className="mx-auto w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-slate-800">Kéo thả file hoặc ảnh vào đây</h3>
              <p className="text-xs text-slate-500 mt-1">
                Lưu tên file theo dạng [Biển số + NGƯỜI CẤP] để xuất ra ghi chú
              </p>
            </div>
          )}
        </div>

        {/* Status & Progress Bar */}
        {isProcessing && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  Đang tiến hành trích xuất dữ liệu, Vui lòng giữ tab này hoạt động...
                </h3>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-slate-800">{progressPercent}%</span>
                <p className="text-xs text-slate-500 mt-0.5">Dự kiến còn lại: {formatTimeRemaining(estimatedSecondsLeft)}</p>
              </div>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">Tổng số link / file</p>
                <p className="text-lg font-bold text-slate-800">{totalCount}</p>
              </div>
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                <p className="text-xs text-blue-600 font-medium">Đang xử lý</p>
                <p className="text-lg font-bold text-blue-700">{pendingCount}</p>
              </div>
              <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">
                <p className="text-xs text-emerald-600 font-medium">Thành công</p>
                <p className="text-lg font-bold text-emerald-700">{successCount}</p>
              </div>
              <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100/50">
                <p className="text-xs text-amber-600 font-medium">Cảnh báo tính phí</p>
                <p className="text-lg font-bold text-amber-700">{warningCount}</p>
              </div>
            </div>
          </div>
        )}

        {/* Data Review & Preview Table */}
        {records.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-4">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">Bảng kết quả trích xuất ({records.length})</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hiển thị các cột đang bật trong cấu hình ({enabledColumns.length} cột). Nhấp nút sửa để chỉnh sửa trước khi xuất Excel.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 font-medium">
                  Thành công: <span className="text-green-600 font-bold">{successCount}</span> | Lỗi: <span className="text-red-600 font-bold">{errorCount}</span>
                </span>
                <button
                  onClick={downloadAllPdfs}
                  disabled={isDownloadingPdf || completedCount === 0}
                  title="Chuyển toàn bộ link thành PDF"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5" />
                  )}
                  {isDownloadingPdf ? `Đang tải (${downloadProgress}/${completedCount})...` : "Tải PDF"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-4 py-3">STT</th>
                    {enabledColumns.map((col) => (
                      <th key={col.key} scope="col" className="px-4 py-3">
                        {col.label}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const isEditing = editingId === r.id;

                    return (
                      <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${r.feeWarning ? "bg-amber-50/40" : ""}`}>
                        <td className="px-4 py-3 font-medium text-slate-900" title={r.url || r.originalFilename}>
                          <div className="flex items-center gap-2">
                            {r.status === 'pending' && <AlertCircle className="w-4 h-4 text-slate-400" />}
                            {r.status === 'processing' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                            {r.status === 'success' && !r.feeWarning && <CheckCircle className="w-4 h-4 text-green-500" />}
                            {r.status === 'success' && r.feeWarning && <FileWarning className="w-4 h-4 text-amber-500" title={r.feeWarning} />}
                            {r.status === 'error' && <XCircle className="w-4 h-4 text-red-500" title={r.errorMessage} />}
                            <span>{i + 1}</span>
                          </div>
                        </td>

                        {/* Dynamic Enabled Columns */}
                        {enabledColumns.map((col) => {
                          const val = (isEditing ? editForm[col.key] : r[col.key]) || "";

                          return (
                            <td key={col.key} className="px-4 py-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={val as string}
                                  onChange={(e) => setEditForm({ ...editForm, [col.key]: e.target.value })}
                                  className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500 bg-white"
                                />
                              ) : col.key === "Trang_thai" ? (
                                r.Trang_thai && (
                                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                                    r.Trang_thai.includes("SỬA")
                                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                                      : "bg-rose-100 text-rose-700 border border-rose-300"
                                  }`}>
                                    {r.Trang_thai}
                                  </span>
                                )
                              ) : col.key === "Tong_phi_bao_hiem_da_VAT" ? (
                                <div>
                                  <span>{r.Tong_phi_bao_hiem_da_VAT}</span>
                                  {r.feeWarning && (
                                    <p className="text-[10px] text-amber-600 font-normal">{r.feeWarning}</p>
                                  )}
                                </div>
                              ) : col.key === "Ghi_chu" && r.status === "error" ? (
                                <span className="text-red-500 text-xs">Lỗi: {r.errorMessage}</span>
                              ) : (
                                (val as string)
                              )}
                            </td>
                          );
                        })}

                        {/* Actions */}
                        <td className="px-4 py-3 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={saveEditing} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Lưu">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={cancelEditing} className="p-1 text-slate-400 hover:bg-slate-100 rounded" title="Hủy">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => startEditing(r)} className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded" title="Sửa thông tin">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteRecord(r.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded" title="Xóa dòng này">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Config Modal Popup */}
        <ConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          columns={columns}
          onSave={handleSaveColumns}
          onReset={handleResetColumns}
        />

      </div>
    </div>
  );
}
