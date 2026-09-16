import React, { useState } from "react";
import { X, ArrowUp, ArrowDown, RotateCcw, Check, Settings, Eye } from "lucide-react";
import { ColumnItem } from "../types";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnItem[];
  onSave: (newColumns: ColumnItem[]) => void;
  onReset: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  columns,
  onSave,
  onReset,
}) => {
  const [localCols, setLocalCols] = useState<ColumnItem[]>(columns);

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

  const enabledCols = localCols.filter((c) => c.enabled);

  const handleSave = () => {
    onSave(localCols);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Cấu hình cột file Excel xuất</h2>
              <p className="text-xs text-slate-500">Tùy chọn trường thông tin và sắp xếp vị trí cột theo ý bạn</p>
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
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 text-xs text-blue-800 flex items-center justify-between">
            <span>Tick chọn để bật/tắt cột. Dùng nút mũi tên ⬆️ ⬇️ để thay đổi thứ tự xuất Excel.</span>
            <span className="font-semibold bg-white px-2 py-1 rounded border border-blue-200">
              Đã chọn: {enabledCols.length} / {localCols.length} cột
            </span>
          </div>

          {/* Column List Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
            {localCols.map((col, idx) => (
              <div
                key={col.key}
                className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                  col.enabled
                    ? "bg-white border-blue-200 shadow-sm"
                    : "bg-slate-100/60 border-slate-200 opacity-60"
                }`}
              >
                <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={() => toggleColumn(col.key)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className={`text-xs font-semibold ${col.enabled ? "text-slate-800" : "text-slate-500 line-through"}`}>
                    {col.label}
                  </span>
                </label>

                {/* Move buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveColumn(idx, "up")}
                    disabled={idx === 0}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                    title="Di chuyển lên"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveColumn(idx, "down")}
                    disabled={idx === localCols.length - 1}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                    title="Di chuyển xuống"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Live Table Preview */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-blue-600" /> Xem trước thứ tự cột trong file Excel
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-inner">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-semibold">
                  <tr>
                    <th className="px-3 py-2 border-r border-slate-200 bg-slate-200/60">STT</th>
                    {enabledCols.map((c) => (
                      <th key={c.key} className="px-3 py-2 border-r border-slate-200 last:border-r-0">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100 text-slate-500 italic">
                    <td className="px-3 py-2 border-r border-slate-200 bg-slate-50">1</td>
                    {enabledCols.map((c) => (
                      <td key={c.key} className="px-3 py-2 border-r border-slate-200 last:border-r-0">
                        [Dữ liệu {c.label}]
                      </td>
                    ))}
                  </tr>
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
