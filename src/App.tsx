import React, { useState, useCallback, useRef } from "react";
import { Copy, Upload, FileType, CheckCircle, XCircle, Loader2, Download, AlertCircle, FileWarning } from "lucide-react";
import * as xlsx from "xlsx";
import { type InsuranceRecord } from "./types";

export default function App() {
  const [records, setRecords] = useState<InsuranceRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = records.some(r => r.status === "pending" || r.status === "processing");

  const handleFiles = useCallback((files: File[]) => {
    // Generate initial records for the UI
    const newRecords = files.map((file) => ({
      id: crypto.randomUUID(),
      GCN_TNDS: "",
      Ten_chu_xe: "",
      Bien_kiem_soat: "",
      Ngay_cap: "",
      Phi_bao_hiem_chua_VAT: "",
      VAT: "",
      Tong_phi_bao_hiem_da_VAT: "",
      Trang_thai: "",
      Ghi_chu: "",
      originalFilename: file.name,
      status: "pending" as const,
      file,
    }));

    setRecords((prev) => [...prev, ...newRecords]);

    // Process each file one by one or in parallel chunks.
    // To avoid too many concurrent requests to Gemini, let's process them sequentially or with a strict concurrency limit.
    processQueue(newRecords);
  }, []);

  const processQueue = async (items: InsuranceRecord[]) => {
    const concurrencyLimit = 3;
    
    // Process in chunks
    for (let i = 0; i < items.length; i += concurrencyLimit) {
      const chunk = items.slice(i, i + concurrencyLimit);
      
      const promises = chunk.map(async (item) => {
        if (!item.file) return;

        setRecords((prev) =>
          prev.map((r) => (r.id === item.id ? { ...r, status: "processing" } : r))
        );

        try {
          const formData = new FormData();
          formData.append("file", item.file as Blob);

          const response = await fetch("/api/parse-insurance", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            let errMsg = "Failed to process file on server";
            try {
              const errJson = await response.json();
              if (errJson.error) errMsg = errJson.error;
            } catch (e) {}
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
                      Bien_kiem_soat: json.data.Bien_kiem_soat || "",
                      Ngay_cap: json.data.Ngay_cap || "",
                      Phi_bao_hiem_chua_VAT: json.data.Phi_bao_hiem_chua_VAT || "",
                      VAT: json.data.VAT || "",
                      Tong_phi_bao_hiem_da_VAT: json.data.Tong_phi_bao_hiem_da_VAT || "",
                      Trang_thai: json.data.Trang_thai || "",
                      Ghi_chu: json.data.Ghi_chu || "",
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
      });
      
      await Promise.all(promises);
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

  const exportExcel = () => {
    // Filter only successful records for exports or export all? The user probably wants everything that succeeded, or maybe everything so they can fix it.
    // Let's export everything that isn't pending/processing.
    const completedRecords = records.filter(r => r.status === 'success' || r.status === 'error');
    if (completedRecords.length === 0) {
      return;
    }

    const parseCurrency = (val: string) => {
      if (!val) return val;
      const numString = val.replace(/[^0-9]/g, "");
      if (!numString) return val;
      return Number(numString);
    };

    const dataRows = completedRecords.map((r, index) => ({
      STT: index + 1,
      GCN_TNDS: r.GCN_TNDS,
      "Tên chủ xe": r.Ten_chu_xe,
      "Biển kiểm soát": r.Bien_kiem_soat,
      "Ngày cấp": r.Ngay_cap,
      "Phí bảo hiểm chưa VAT": parseCurrency(r.Phi_bao_hiem_chua_VAT),
      VAT: parseCurrency(r.VAT),
      "Tổng phí bảo hiểm đã VAT": parseCurrency(r.Tong_phi_bao_hiem_da_VAT),
      "Trạng thái": r.Trang_thai,
      "Ghi chú": r.status === 'error' ? "Lỗi: " + r.errorMessage : r.Ghi_chu,
    }));

    const worksheet = xlsx.utils.json_to_sheet(dataRows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "BaoHiem");
    
    // Attempt auto scaling columns (basic)
    const columnWidths = [
      { wch: 5 },  // STT
      { wch: 20 }, // GCN_TNDS
      { wch: 25 }, // Tên chủ xe
      { wch: 15 }, // Biển kiểm soát
      { wch: 15 }, // Ngày cấp
      { wch: 20 }, // Phí bảo hiểm chưa VAT
      { wch: 15 }, // VAT
      { wch: 20 }, // Tổng phí bảo hiểm đã VAT
      { wch: 15 }, // Trạng thái
      { wch: 30 }, // Ghi chú
    ];
    worksheet['!cols'] = columnWidths;

    xlsx.writeFile(workbook, "Bang_Ke_Thong_Tin_Bao_Hiem.xlsx");
  };

  const clearRecords = () => {
    setRecords([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <header className="flex flex-col xl:flex-row items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">KÊ THẺ TASCO</h1>
            <p className="text-sm text-slate-500 mt-1">
              Tải lên hình ảnh hoặc PDF thẻ bảo hiểm để tự động trích xuất thông tin
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
             <button
              onClick={clearRecords}
              disabled={records.length === 0 || isProcessing}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Xóa danh sách
            </button>
            <button
              onClick={exportExcel}
              disabled={records.length === 0 || isProcessing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Xuất Excel
            </button>
          </div>
        </header>

        {/* Upload Zone */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 hover:border-blue-500 transition-colors rounded-2xl p-12 text-center cursor-pointer group"
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
          <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">Kéo thả file vào đây</h3>
          <p className="text-sm text-slate-500 mt-2">
            hoặc click để chọn file (Hỗ trợ PDF, hình ảnh, văn bản)
          </p>
        </div>

        {/* Status Indicator */}
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm font-medium text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-200">
            <Loader2 className="w-4 h-4 animate-spin" />
            Đang xử lý dữ liệu... Vui lòng không đóng trang.
          </div>
        )}

        {/* Data Table */}
        {records.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-6 py-4">STT</th>
                    <th scope="col" className="px-6 py-4">Tên file</th>
                    <th scope="col" className="px-6 py-4">GCN_TNDS</th>
                    <th scope="col" className="px-6 py-4">Tên chủ xe</th>
                    <th scope="col" className="px-6 py-4">Biển kiểm soát</th>
                    <th scope="col" className="px-6 py-4">Ngày cấp</th>
                    <th scope="col" className="px-6 py-4">Phí BH Chưa VAT</th>
                    <th scope="col" className="px-6 py-4">VAT</th>
                    <th scope="col" className="px-6 py-4">Tổng phí đã VAT</th>
                    <th scope="col" className="px-6 py-4">Trạng thái</th>
                    <th scope="col" className="px-6 py-4">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 last:border-0 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{i + 1}</td>
                      <td className="px-6 py-4 max-w-[200px] truncate" title={r.originalFilename}>
                         <div className="flex items-center gap-2">
                            {r.status === 'pending' && <AlertCircle className="w-4 h-4 text-slate-400" />}
                            {r.status === 'processing' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                            {r.status === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                            {r.status === 'error' && <XCircle className="w-4 h-4 text-red-500" title={r.errorMessage} />}
                            <span className="truncate">{r.originalFilename}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4">{r.GCN_TNDS}</td>
                      <td className="px-6 py-4">{r.Ten_chu_xe}</td>
                      <td className="px-6 py-4 font-mono font-medium">{r.Bien_kiem_soat}</td>
                      <td className="px-6 py-4">{r.Ngay_cap}</td>
                      <td className="px-6 py-4">{r.Phi_bao_hiem_chua_VAT}</td>
                      <td className="px-6 py-4">{r.VAT}</td>
                      <td className="px-6 py-4 font-medium">{r.Tong_phi_bao_hiem_da_VAT}</td>
                      <td className="px-6 py-4">
                         {r.Trang_thai && (
                           <span className="px-2.5 py-1 text-xs font-semibold tracking-wide rounded-md bg-rose-100 text-rose-700">
                             {r.Trang_thai}
                           </span>
                         )}
                      </td>
                      <td className="px-6 py-4 max-w-[250px] truncate" title={r.status === 'error' ? r.errorMessage : r.Ghi_chu}>
                         {r.status === 'error' ? (
                             <span className="text-red-500">Lỗi trích xuất</span>
                         ) : (
                             r.Ghi_chu
                         )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
