import React, { useState, useCallback, useRef } from "react";
import { Copy, Upload, FileType, CheckCircle, XCircle, Loader2, Download, AlertCircle, Link as LinkIcon, Sparkles, RefreshCw, Trash2, Edit3, Check, FileWarning } from "lucide-react";
import * as xlsx from "xlsx";
import { type InsuranceRecord } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"url" | "file">("url");
  const [urlInput, setUrlInput] = useState<string>("");
  const [records, setRecords] = useState<InsuranceRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<InsuranceRecord>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = records.some(r => r.status === "pending" || r.status === "processing");

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

    const newRecords: InsuranceRecord[] = parsedUrlBlocks.map((block) => {
      return {
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
        originalFilename: block.filename,
        url: block.url,
        inputLine: block.combinedLine,
        status: "pending" as const,
      };
    });

    setRecords((prev) => [...prev, ...newRecords]);
    setUrlInput("");
    processQueue(newRecords);
  };

  // Process batch of local files
  const handleFiles = useCallback((files: File[]) => {
    const newRecords: InsuranceRecord[] = files.map((file) => ({
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
          // Send request to URL endpoint
          response = await fetch("/api/parse-insurance-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inputLine: item.inputLine || item.url }),
          });
        } else if (item.file) {
          // Send request to File upload endpoint
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
                    Bien_kiem_soat: json.data.Bien_kiem_soat || "",
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

      // Enforce 4.5s delay between requests to stay safely below 15 RPM
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

  // Inline editing functions
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

  const exportExcel = () => {
    const completedRecords = records.filter(r => r.status === 'success' || r.status === 'error');
    if (completedRecords.length === 0) return;

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

  // Sample data button for instant testing
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">KÊ THẺ TASCO V3</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">
                Hỗ trợ URL PDF hàng loạt (100+ link)
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Trích xuất chính xác thông tin Giấy chứng nhận bảo hiểm từ đường link PDF hoặc file ảnh
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
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
              Xuất Excel
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
              <h3 className="text-base font-semibold text-slate-800">Kéo thả file vào đây</h3>
              <p className="text-xs text-slate-500 mt-1">
                hoặc click để chọn file từ máy tính (PDF, JPG, PNG)
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
                <p className="text-xs text-slate-500 mt-0.5">Rà soát dữ liệu đọc được. Nhấp biểu tượng sửa để chỉnh sửa trước khi xuất Excel.</p>
              </div>
              <span className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 font-medium">
                Thành công: <span className="text-green-600 font-bold">{successCount}</span> | Lỗi: <span className="text-red-600 font-bold">{errorCount}</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-4 py-3">STT</th>
                    <th scope="col" className="px-4 py-3">Tên file / Link</th>
                    <th scope="col" className="px-4 py-3">GCN_TNDS</th>
                    <th scope="col" className="px-4 py-3">Tên chủ xe</th>
                    <th scope="col" className="px-4 py-3">Biển kiểm soát</th>
                    <th scope="col" className="px-4 py-3">Ngày cấp</th>
                    <th scope="col" className="px-4 py-3">Phí chưa VAT</th>
                    <th scope="col" className="px-4 py-3">VAT</th>
                    <th scope="col" className="px-4 py-3">Tổng phí đã VAT</th>
                    <th scope="col" className="px-4 py-3">Trạng thái</th>
                    <th scope="col" className="px-4 py-3">Ghi chú</th>
                    <th scope="col" className="px-4 py-3 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const isEditing = editingId === r.id;

                    return (
                      <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${r.feeWarning ? "bg-amber-50/40" : ""}`}>
                        <td className="px-4 py-3 font-medium text-slate-900">{i + 1}</td>
                        
                        {/* Filename / URL */}
                        <td className="px-4 py-3 max-w-[200px] truncate" title={r.url || r.originalFilename}>
                          <div className="flex items-center gap-2">
                            {r.status === 'pending' && <AlertCircle className="w-4 h-4 text-slate-400" />}
                            {r.status === 'processing' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                            {r.status === 'success' && !r.feeWarning && <CheckCircle className="w-4 h-4 text-green-500" />}
                            {r.status === 'success' && r.feeWarning && <FileWarning className="w-4 h-4 text-amber-500" title={r.feeWarning} />}
                            {r.status === 'error' && <XCircle className="w-4 h-4 text-red-500" title={r.errorMessage} />}
                            <span className="truncate">{r.originalFilename}</span>
                          </div>
                        </td>

                        {/* GCN_TNDS */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.GCN_TNDS || ""}
                              onChange={(e) => setEditForm({ ...editForm, GCN_TNDS: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : (
                            r.GCN_TNDS
                          )}
                        </td>

                        {/* Ten_chu_xe */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.Ten_chu_xe || ""}
                              onChange={(e) => setEditForm({ ...editForm, Ten_chu_xe: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : (
                            r.Ten_chu_xe
                          )}
                        </td>

                        {/* Bien_kiem_soat */}
                        <td className="px-4 py-3 font-mono font-medium">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.Bien_kiem_soat || ""}
                              onChange={(e) => setEditForm({ ...editForm, Bien_kiem_soat: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : (
                            r.Bien_kiem_soat
                          )}
                        </td>

                        {/* Ngay_cap */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.Ngay_cap || ""}
                              onChange={(e) => setEditForm({ ...editForm, Ngay_cap: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : (
                            r.Ngay_cap
                          )}
                        </td>

                        {/* Phi_bao_hiem_chua_VAT */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.Phi_bao_hiem_chua_VAT || ""}
                              onChange={(e) => setEditForm({ ...editForm, Phi_bao_hiem_chua_VAT: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : (
                            r.Phi_bao_hiem_chua_VAT
                          )}
                        </td>

                        {/* VAT */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.VAT || ""}
                              onChange={(e) => setEditForm({ ...editForm, VAT: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : (
                            r.VAT
                          )}
                        </td>

                        {/* Tong_phi_bao_hiem_da_VAT */}
                        <td className="px-4 py-3 font-medium">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.Tong_phi_bao_hiem_da_VAT || ""}
                              onChange={(e) => setEditForm({ ...editForm, Tong_phi_bao_hiem_da_VAT: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : (
                            <div>
                              <span>{r.Tong_phi_bao_hiem_da_VAT}</span>
                              {r.feeWarning && (
                                <p className="text-[10px] text-amber-600 font-normal">{r.feeWarning}</p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Trang_thai */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.Trang_thai || ""}
                              onChange={(e) => setEditForm({ ...editForm, Trang_thai: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : (
                            r.Trang_thai && (
                              <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                                r.Trang_thai.includes("SỬA")
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : "bg-rose-100 text-rose-700 border border-rose-300"
                              }`}>
                                {r.Trang_thai}
                              </span>
                            )
                          )}
                        </td>

                        {/* Ghi_chu */}
                        <td className="px-4 py-3 max-w-[200px] truncate" title={r.status === 'error' ? r.errorMessage : r.Ghi_chu}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.Ghi_chu || ""}
                              onChange={(e) => setEditForm({ ...editForm, Ghi_chu: e.target.value })}
                              className="w-full px-2 py-1 text-xs border rounded outline-none border-blue-500"
                            />
                          ) : r.status === 'error' ? (
                            <span className="text-red-500 text-xs">Lỗi: {r.errorMessage}</span>
                          ) : (
                            r.Ghi_chu
                          )}
                        </td>

                        {/* Thao tac */}
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
      </div>
    </div>
  );
}
