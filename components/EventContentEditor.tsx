"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type EventContentEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  textareaClassName?: string;
  placeholder?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function fileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();

  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

function defaultCaption(file: File) {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

export default function EventContentEditor({
  value,
  onChange,
  disabled = false,
  textareaClassName,
  placeholder = "Viết nội dung về sự kiện ở đây...",
}: EventContentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function insertAtCursor(markdown: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;

    const before = value.slice(0, start);
    const after = value.slice(end);

    const prefix =
      before.length > 0 && !before.endsWith("\n")
        ? "\n\n"
        : before.endsWith("\n\n") || before.length === 0
        ? ""
        : "\n";

    const suffix =
      after.length > 0 && !after.startsWith("\n")
        ? "\n\n"
        : after.startsWith("\n\n") || after.length === 0
        ? ""
        : "\n";

    const inserted = `${prefix}${markdown}${suffix}`;
    const nextValue = `${before}${inserted}${after}`;
    const nextCursor = before.length + inserted.length;

    onChange(nextValue);

    requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function handleImageSelected(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;

    setUploadError("");

    if (!ALLOWED_TYPES.has(file.type)) {
      setUploadError("Chỉ hỗ trợ JPG, PNG, WEBP hoặc GIF.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("Ảnh phải nhỏ hơn 8 MB.");
      return;
    }

    setUploading(true);

    try {
      const extension = fileExtension(file);
      const objectName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const objectPath = `events/${objectName}`;

      const uploadResult = await supabase.storage
        .from("event-images")
        .upload(objectPath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });

      if (uploadResult.error) {
        throw uploadResult.error;
      }

      const publicUrlResult = supabase.storage
        .from("event-images")
        .getPublicUrl(objectPath);

      const publicUrl = publicUrlResult.data.publicUrl;
      const caption = defaultCaption(file) || "Ảnh minh họa";

      insertAtCursor(`![${caption}](${publicUrl})`);
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Không thể upload ảnh."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="event-content-editor">
      <div className="content-editor-toolbar">
        <button
          type="button"
          className="content-image-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? "Đang tải ảnh..." : "+ Thêm ảnh"}
        </button>

        <span className="content-editor-help">
          Ảnh sẽ được chèn tại vị trí con trỏ. Có thể sửa chữ trong [ ] để đổi chú thích.
        </span>

        <input
          ref={fileInputRef}
          className="content-image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleImageSelected}
          tabIndex={-1}
        />
      </div>

      <textarea
        ref={textareaRef}
        className={textareaClassName}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />

      {uploadError && (
        <div className="content-upload-error">{uploadError}</div>
      )}
    </div>
  );
}
