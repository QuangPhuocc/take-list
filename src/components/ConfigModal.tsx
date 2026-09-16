import React, { useState } from "react";
import { X, ArrowUp, ArrowDown, RotateCcw, Check, Settings, Eye, GripVertical } from "lucide-react";
import { ColumnItem } from "../types";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnItem[];
  onSave: (newColumns: ColumnItem[]) => void;
  onReset: () => void;
}

// 3 Real sample data rows from the 3 "Nạp link mẫu" URLs
const SAMPLE_DATA_ROWS: Record<string, string>[] = [
  {
    GCN_TNDS: "TNDS2609/795993",
    Ten_chu_xe: "BÙI THỊ NGỌC TÚ",
    Dia_chi: "123 NGUYỄN TRÃI, TÂN AN, NINH KIỀU, CẦN THƠ",
    Dien_thoai: "0901234567",
    Bien_kiem_soat: "65A76697",
    So_khung: "RLUSW81HHNNO34303",
    So_may: "D4HENH776828",
    Hang_xe: "HYUNDAI",
    Hieu_xe: "SANTAFE",
    Nam_san_xuat: "2022",
    Loai_xe: "Xe ô tô chở người",
    So_cho: "7 chỗ",
    Trong_tai: "0 tấn",
    Muc_dich_su_dung: "Không kinh doanh",
    Ngay_hieu_luc: "16/09/2026",
    Ngay_ket_thuc: "16/09/2027",
    Ngay_cap: "16/09/2026",
    Phi_bao_hiem_chua_VAT: "3,214,000",
    VAT: "305,400",
    Tong_phi_bao_hiem_da_VAT: "3,519,400",
    Trang_thai: "",
    Ghi_chu: "PHƯỚC TGBH",
  },
  {
    GCN_TNDS: "TNDS2609/136681",
    Ten_chu_xe: "CÔNG TY TNHH VẬN TẢI YÊN GL",
    Dia_chi: "456 LÊ DUẨN, PLEIKU, GIA LAI",
    Dien_thoai: "0987654321",
    Bien_kiem_soat: "77E01141",
    So_khung: "KNAHU811DM6789012",
    So_may: "G4FCKM123456",
    Hang_xe: "KIA",
    Hieu_xe: "K250",
    Nam_san_xuat: "2021",
    Loai_xe: "Xe ô tô tải",
    So_cho: "3 chỗ",
    Trong_tai: "2.4 tấn",
    Muc_dich_su_dung: "Kinh doanh vận tải",
    Ngay_hieu_luc: "15/09/2026",
    Ngay_ket_thuc: "15/09/2027",
    Ngay_cap: "15/09/2026",
    Phi_bao_hiem_chua_VAT: "853,000",
    VAT: "85,300",
    Tong_phi_bao_hiem_da_VAT: "938,300",
    Trang_thai: "Đã sửa đổi",
    Ghi_chu: "YÊN GL",
  },
  {
    GCN_TNDS: "TNDS2609/876951",
    Ten_chu_xe: "LÊ HOÀNG PHÚ",
    Dia_chi: "789 NGUYỄN HUỆ, PHƯỜNG 1, TRÀ VINH",
    Dien_thoai: "0912345678",
    Bien_kiem_soat: "83H00097",
    So_khung: "MHFXS81023948576",
    So_may: "4HG1-987654",
    Hang_xe: "ISUZU",
    Hieu_xe: "NPR85KE4",
    Nam_san_xuat: "2020",
    Loai_xe: "Xe ô tô tải",
    So_cho: "3 chỗ",
    Trong_tai: "3.5 tấn",
    Muc_dich_su_dung: "Kinh doanh vận tải",
    Ngay_hieu_luc: "14/09/2026",
    Ngay_ket_thuc: "14/09/2027",
    Ngay_cap: "14/09/2026",
    Phi_bao_hiem_chua_VAT: "1,250,000",
    VAT: "125,000",
    Tong_phi_bao_hiem_da_VAT: "1,375,000",
    Trang_thai: "",
    Ghi_chu: "PHƯỚC TGBH",
  },
];

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  columns,
  onSave,
  onReset,
}) => {
  const [localCols, setLocalCols] = useState<ColumnItem[]>(columns);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync state when modal opens
  React.useEffect(() => {
    setLocalCols(columns);
  }, [columns, isOpen]);

  if (!isOpen) return null;

  const toggleColumn = (key: string) => {
    setLocalCols((prev) =>
      prev.map((col) => (col.key === key ? { ...col, enabled: !col.enabled } : col))
    );
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const newCols = [...localCols];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newCols.length) return;

    const temp = newCols[index];
    newCols[index] = newCols[targetIndex];
    newCols[targetIndex] = temp;
    setLocalCols(newCols);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Optional: text preview for drag image
    if (e.dataTransfer.setData) {
      e.dataTransfer.setData("text/plain", index.toString());
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newCols = [...localCols];
    const [movedItem] = newCols.splice(draggedIndex, 1);
    newCols.splice(dropIndex, 0, movedItem);
    setLocalCols(newCols);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const enabledCols = localCols.filter((c) => c.enabled);

  const handleSave = () => {
    onSave(localCols);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  // Split into 3 columns:
  // Column 1: Items 1 -> 8 (index 0..7)
  // Column 2: Items 9 -> 16 (index 8..15)
  // Column 3: Items 17 -> 22 (index 16..21)
  const col1 = localCols.slice(0, 8);
  const col2 = localCols.slice(8, 16);
  const col3 = localCols.slice(16, 22);

  const renderColGroup = (items: ColumnItem[], offset: number, title: string) => (
    <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-1 flex justify-between">
        <span>{title}</span>
        <span>(Cột {offset + 1}-{offset + items.length})</span>
      </div>
      <div className="space-y-2">
        {items.map((col, idx) => {
          const originalIndex = offset + idx;
          const isDragging = draggedIndex === originalIndex;
          const isDragOver = dragOverIndex === originalIndex;

          return (
            <div
              key={col.key}
              draggable
              onDragStart={(e) => handleDragStart(e, originalIndex)}
              onDragOver={(e) => handleDragOver(e, originalIndex)}
              onDragLeave={() => handleDragLeave(originalIndex)}
              onDrop={(e) => handleDrop(e, originalIndex)}
              onDragEnd={handleDragEnd}
              className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing select-none ${
                isDragging
                  ? "opacity-40 bg-blue-100 border-dashed border-blue-400 scale-[0.98]"
                  : isDragOver
                  ? "bg-blue-50 border-blue-500 ring-2 ring-blue-400 shadow-md scale-[1.02]"
                  : col.enabled
                  ? "bg-white border-blue-200 shadow-sm hover:border-blue-300"
                  : "bg-slate-100/60 border-slate-200 opacity-60 hover:opacity-80"
              }`}
            >
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <GripVertical className="w-4 h-4 text-slate-400 cursor-grab active:cursor-grabbing flex-shrink-0" />
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={() => toggleColumn(col.key)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                  />
                  <span className={`text-xs font-semibold truncate ${col.enabled ? "text-slate-800" : "text-slate-500 line-through"}`}>
                    <strong className="text-blue-600 font-bold mr-1">{originalIndex + 1}.</strong>
                    {col.label}
                  </span>
                </label>
              </div>

              {/* Move buttons (up/down secondary control) */}
              <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                <button
                  onClick={() => moveColumn(originalIndex, "up")}
                  disabled={originalIndex === 0}
                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-20 disabled:cursor-not-allowed rounded"
                  title="Di chuyển lên"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moveColumn(originalIndex, "down")}
                  disabled={originalIndex === localCols.length - 1}
                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-20 disabled:cursor-not-allowed rounded"
                  title="Di chuyển xuống"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Cấu hình cột file Excel xuất</h2>
              <p className="text-xs text-slate-500">Tùy chọn bật/tắt cột, kéo thả trực tiếp hoặc nhấn mũi tên để sắp xếp thứ tự</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <GripVertical className="w-4 h-4 text-blue-600" />
              Tick chọn để bật/tắt cột. Kéo thả các ô để chèn vào vị trí mong muốn hoặc dùng nút ⬆️ ⬇️.
            </span>
            <span className="font-semibold bg-white px-2.5 py-1 rounded-lg border border-blue-200">
              Đã bật: <strong className="text-blue-600">{enabledCols.length}</strong> / {localCols.length} cột
            </span>
          </div>

          {/* 3 Columns Checkbox Grid with Drag & Drop */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {renderColGroup(col1, 0, "Cột 1 (STT 1 - 8)")}
            {renderColGroup(col2, 8, "Cột 2 (STT 9 - 16)")}
            {renderColGroup(col3, 16, "Cột 3 (STT 17 - 22)")}
          </div>

          {/* Live Table Preview using 3 Real Sample Data Rows */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-blue-600" /> Mẫu bảng xuất Excel thực tế (Xem trước - 3 dòng mẫu)
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">Dữ liệu từ 3 link Nạp link mẫu</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-inner">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-semibold">
                  <tr>
                    <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-200/70 text-center font-bold">STT</th>
                    {enabledCols.map((c) => (
                      <th key={c.key} className="px-3.5 py-2.5 border-r border-slate-200 last:border-r-0 font-bold text-slate-800">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_DATA_ROWS.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-100 text-slate-700 font-medium hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 border-r border-slate-200 bg-slate-50 text-center font-bold">{rIdx + 1}</td>
                      {enabledCols.map((c) => (
                        <td key={c.key} className="px-3.5 py-2.5 border-r border-slate-200 last:border-r-0">
                          {row[c.key] || "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Khôi phục mặc định (9 cột)
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" />
              Lưu cấu hình
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

