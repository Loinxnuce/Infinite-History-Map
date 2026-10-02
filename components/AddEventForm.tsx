"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import EventContentEditor from "@/components/EventContentEditor";

type ParentCandidate = {
  id: string;
  title: string;
  year: number | null;
  importance_level: number | null;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: `Tháng ${index + 1}`,
}));

function eventLevel(event: ParentCandidate) {
  return event.importance_level ?? 1;
}

function formatYear(year: number | null) {
  if (year === null) return "Không rõ năm";
  return year < 0 ? `${Math.abs(year)} TCN` : String(year);
}

function isLeapYear(year: number) {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

export default function AddEventForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(1);
  const [month, setMonth] = useState(1);
  const [year, setYear] = useState("");
  const [content, setContent] = useState("");
  const [importanceLevel, setImportanceLevel] = useState(1);
  const [parentId, setParentId] = useState("");
  const [parentCandidates, setParentCandidates] = useState<ParentCandidate[]>([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadParents() {
      setParentLoading(true);

      const result = await supabase
        .from("nodes")
        .select("id,title,year,importance_level")
        .eq("type", "event")
        .order("year", { ascending: true, nullsFirst: false })
        .order("title", { ascending: true });

      if (!cancelled) {
        if (result.error) {
          setErrorMessage(result.error.message);
        } else {
          setParentCandidates(result.data ?? []);
        }
        setParentLoading(false);
      }
    }

    loadParents();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const availableParents = useMemo(() => {
    if (importanceLevel <= 1) return [];
    return parentCandidates.filter(
      (event) => eventLevel(event) === importanceLevel - 1
    );
  }, [importanceLevel, parentCandidates]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const yearNumber = Number(year);

    if (!title.trim()) {
      setErrorMessage("Hãy nhập tên sự kiện.");
      return;
    }

    if (!Number.isInteger(yearNumber)) {
      setErrorMessage("Năm phải là một số nguyên.");
      return;
    }

    if (month < 1 || month > 12) {
      setErrorMessage("Tháng phải từ 1 đến 12.");
      return;
    }

    const maxDay = daysInMonth(yearNumber, month);
    if (!Number.isInteger(day) || day < 1 || day > maxDay) {
      setErrorMessage(
        `Ngày không hợp lệ. Tháng ${month} năm ${formatYear(yearNumber)} có tối đa ${maxDay} ngày.`
      );
      return;
    }

    if (![1, 2, 3].includes(importanceLevel)) {
      setErrorMessage("Cấp sự kiện không hợp lệ.");
      return;
    }

    let finalParentId: string | null = null;
    if (importanceLevel > 1) {
      if (!parentId) {
        setErrorMessage(
          `Sự kiện cấp ${importanceLevel} bắt buộc phải chọn sự kiện cấp ${importanceLevel - 1}.`
        );
        return;
      }

      const parent = availableParents.find((event) => event.id === parentId);
      if (!parent) {
        setErrorMessage("Sự kiện cha không hợp lệ.");
        return;
      }
      finalParentId = parent.id;
    }

    setSaving(true);

    const result = await supabase.from("nodes").insert({
      type: "event",
      title: title.trim(),
      day,
      month,
      year: yearNumber,
      content: content.trim() || null,
      category: null,
      importance_level: importanceLevel,
      parent_id: finalParentId,
    });

    setSaving(false);

    if (result.error) {
      setErrorMessage(result.error.message);
      return;
    }

    setTitle("");
    setDay(1);
    setMonth(1);
    setYear("");
    setContent("");
    setImportanceLevel(1);
    setParentId("");
    setOpen(false);

    window.location.reload();
  }

  return (
    <div className="add-event-panel">
      <button
        type="button"
        className="add-event-open"
        onClick={() => setOpen((value) => !value)}
      >
        + Add event
      </button>

      {open && (
        <form className="add-event-card" onSubmit={handleSubmit}>
          <div className="add-event-title">Thêm sự kiện</div>

          <label>Tên sự kiện</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ví dụ: Trận Verdun"
            autoFocus
          />

          <div className="add-event-date-row add-event-date-row-three">
            <div>
              <label>Ngày</label>
              <input
                type="number"
                min="1"
                max="31"
                value={day}
                onChange={(event) => setDay(Number(event.target.value))}
              />
            </div>

            <div>
              <label>Tháng</label>
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {MONTHS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Năm</label>
              <input
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder="1916 hoặc -3200"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="edit-hierarchy-row">
            <div>
              <label>Độ quan trọng</label>
              <select
                value={importanceLevel}
                onChange={(event) => {
                  setImportanceLevel(Number(event.target.value));
                  setParentId("");
                }}
              >
                <option value={1}>Cấp 1 · Sự kiện gốc</option>
                <option value={2}>Cấp 2 · Thuộc sự kiện cấp 1</option>
                <option value={3}>Cấp 3 · Thuộc sự kiện cấp 2</option>
              </select>
            </div>

            {importanceLevel > 1 && (
              <div>
                <label>Sự kiện cấp {importanceLevel - 1} cha</label>
                <select
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                  required
                  disabled={parentLoading}
                >
                  <option value="">
                    {parentLoading ? "Đang tải..." : "-- Chọn sự kiện cha --"}
                  </option>
                  {availableParents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.title} · {formatYear(parent.year)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="add-event-hierarchy-help">
            Cấp 1 là sự kiện gốc. Cấp 2 bắt buộc thuộc một sự kiện cấp 1; cấp 3 bắt buộc thuộc một sự kiện cấp 2.
          </div>

          <label>Nội dung</label>
          <EventContentEditor
            value={content}
            onChange={setContent}
            disabled={saving}
            textareaClassName="add-event-content-textarea"
            placeholder="Viết nội dung về sự kiện ở đây..."
          />

          {errorMessage && <div className="add-event-error">{errorMessage}</div>}

          <div className="add-event-buttons">
            <button
              type="button"
              className="add-event-cancel"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Hủy
            </button>

            <button type="submit" className="add-event-save" disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu sự kiện"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
