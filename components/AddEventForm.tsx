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

function canonicalRelationPair(firstId: string, secondId: string) {
  return firstId < secondId
    ? [firstId, secondId] as const
    : [secondId, firstId] as const;
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
  const [relatedLevel1Ids, setRelatedLevel1Ids] = useState<string[]>([]);
  const [relationQuery, setRelationQuery] = useState("");
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

  const relationCandidates = useMemo(() => {
    if (importanceLevel !== 1) return [];

    const query = relationQuery.trim().toLowerCase();

    return parentCandidates
      .filter((event) => eventLevel(event) === 1)
      .filter((event) =>
        query ? event.title.toLowerCase().includes(query) : true
      );
  }, [importanceLevel, relationQuery, parentCandidates]);

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

    const result = await supabase
      .from("nodes")
      .insert({
        type: "event",
        title: title.trim(),
        day,
        month,
        year: yearNumber,
        content: content.trim() || null,
        category: null,
        importance_level: importanceLevel,
        parent_id: finalParentId,
      })
      .select("id")
      .single();

    if (result.error || !result.data?.id) {
      setSaving(false);
      setErrorMessage(
        result.error?.message ?? "Không lấy được ID của sự kiện mới."
      );
      return;
    }

    if (importanceLevel === 1 && relatedLevel1Ids.length > 0) {
      const validRelatedIds = relatedLevel1Ids.filter((relatedId) =>
        parentCandidates.some(
          (candidate) =>
            candidate.id === relatedId &&
            eventLevel(candidate) === 1
        )
      );

      const relationRows = validRelatedIds.map((relatedId) => {
        const [sourceId, targetId] = canonicalRelationPair(
          result.data.id,
          relatedId
        );

        return {
          source_id: sourceId,
          target_id: targetId,
          relation_type: "related",
        };
      });

      if (relationRows.length > 0) {
        const relationResult = await supabase
          .from("event_relations")
          .insert(relationRows);

        if (relationResult.error) {
          // Roll back the new node so the user does not end up with
          // a half-created event whose selected relations were lost.
          await supabase
            .from("nodes")
            .delete()
            .eq("id", result.data.id);

          setSaving(false);
          setErrorMessage(
            `Không thể tạo liên kết C1: ${relationResult.error.message}`
          );
          return;
        }
      }
    }

    setSaving(false);

    setTitle("");
    setDay(1);
    setMonth(1);
    setYear("");
    setContent("");
    setImportanceLevel(1);
    setParentId("");
    setRelatedLevel1Ids([]);
    setRelationQuery("");
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
                  const nextLevel = Number(event.target.value);
                  setImportanceLevel(nextLevel);
                  setParentId("");

                  if (nextLevel !== 1) {
                    setRelatedLevel1Ids([]);
                    setRelationQuery("");
                  }
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

          {importanceLevel === 1 && (
            <div className="c1-relation-editor">
              <div className="c1-relation-heading">
                <label>Liên kết C1 ↔ C1</label>
                <span>{relatedLevel1Ids.length} liên kết</span>
              </div>

              <div className="c1-relation-help">
                Tùy chọn. Chọn các sự kiện cấp 1 có liên quan; đây không phải quan hệ cha–con.
              </div>

              <input
                className="c1-relation-search"
                value={relationQuery}
                onChange={(event) => setRelationQuery(event.target.value)}
                placeholder="Tìm sự kiện cấp 1..."
                disabled={parentLoading}
              />

              <div className="c1-relation-list">
                {relationCandidates.length === 0 ? (
                  <div className="c1-relation-empty">
                    {parentLoading
                      ? "Đang tải..."
                      : "Chưa có sự kiện cấp 1 phù hợp."}
                  </div>
                ) : (
                  relationCandidates.map((candidate) => {
                    const checked = relatedLevel1Ids.includes(candidate.id);

                    return (
                      <label
                        className={`c1-relation-option${checked ? " selected" : ""}`}
                        key={candidate.id}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setRelatedLevel1Ids((current) =>
                              checked
                                ? current.filter((id) => id !== candidate.id)
                                : [...current, candidate.id]
                            );
                          }}
                        />
                        <span className="c1-relation-option-title">
                          {candidate.title}
                        </span>
                        <small>{formatYear(candidate.year)}</small>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

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
