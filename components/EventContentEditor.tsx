"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type EventContentEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  textareaClassName?: string;
  placeholder?: string;
};

const RICH_TEXT_PREFIX = "<!--richtext-v1-->";
const LEGACY_IMAGE_LINE = /^!\[(.*?)\]\((https:\/\/[^)]+)\)$/i;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function legacyToHtml(value: string) {
  if (!value.trim()) return "";

  return value
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<p><br></p>";

      const imageMatch = trimmed.match(LEGACY_IMAGE_LINE);
      if (imageMatch) {
        const caption = escapeHtml(imageMatch[1].trim());
        const url = escapeHtml(imageMatch[2].trim());
        return `<figure><img src="${url}" alt="${caption || "Ảnh minh họa sự kiện"}"><figcaption>${caption}</figcaption></figure><p><br></p>`;
      }

      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("");
}

function valueToEditorHtml(value: string) {
  if (value.startsWith(RICH_TEXT_PREFIX)) {
    return value.slice(RICH_TEXT_PREFIX.length);
  }
  return legacyToHtml(value);
}

function editorLooksEmpty(editor: HTMLDivElement) {
  const hasImage = Boolean(editor.querySelector("img"));
  const text = editor.textContent?.replace(/\u200B/g, "").trim() ?? "";
  return !hasImage && !text;
}

export default function EventContentEditor({
  value,
  onChange,
  disabled = false,
  textareaClassName,
  placeholder = "Viết nội dung về sự kiện ở đây...",
}: EventContentEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastEmittedValueRef = useRef(value);
  const savedRangeRef = useRef<Range | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastEmittedValueRef.current) return;

    editor.innerHTML = valueToEditorHtml(value);
    lastEmittedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.innerHTML && value) {
      editor.innerHTML = valueToEditorHtml(value);
    }
  }, []);

  function emitCurrentValue() {
    const editor = editorRef.current;
    if (!editor) return;

    const nextValue = editorLooksEmpty(editor)
      ? ""
      : `${RICH_TEXT_PREFIX}${editor.innerHTML}`;

    lastEmittedValueRef.current = nextValue;
    onChange(nextValue);
  }

  function selectionInsideEditor(selection: Selection | null) {
    const editor = editorRef.current;
    if (!editor || !selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer);
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (!selectionInsideEditor(selection) || !selection) return;
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const editor = editorRef.current;
    editor?.focus();

    const range = savedRangeRef.current;
    if (!range) return;

    const selection = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function currentBlockFromSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selectionInsideEditor(selection) || !selection) return null;

    let node: Node | null = selection.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;

    const element = node instanceof Element ? node : node?.parentElement ?? null;
    const block = element?.closest("p, h2, li, blockquote, figcaption");
    return block && editor.contains(block) ? block : null;
  }

  function selectCurrentBlockIfCollapsed() {
    const selection = window.getSelection();
    if (!selectionInsideEditor(selection) || !selection || !selection.isCollapsed) return;

    const block = currentBlockFromSelection();
    if (!block) return;

    const range = document.createRange();
    range.selectNodeContents(block);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function runInlineCommand(command: "bold" | "italic" | "underline") {
    restoreSelection();
    selectCurrentBlockIfCollapsed();
    document.execCommand(command, false);
    rememberSelection();
    emitCurrentValue();
  }

  function runBlockCommand(tagName: "h2" | "blockquote") {
    restoreSelection();

    const current = currentBlockFromSelection();
    const alreadySame = current?.tagName.toLowerCase() === tagName;

    document.execCommand("formatBlock", false, alreadySame ? "p" : tagName);
    rememberSelection();
    emitCurrentValue();
  }

  function toggleBulletList() {
    restoreSelection();
    document.execCommand("insertUnorderedList", false);
    rememberSelection();
    emitCurrentValue();
  }

  function addLink() {
    restoreSelection();

    const selection = window.getSelection();
    if (!selectionInsideEditor(selection) || !selection || selection.isCollapsed) {
      setLinkError("Hãy bôi đen phần chữ cần gắn liên kết trước.");
      return;
    }

    setLinkError("");
    const rawUrl = window.prompt("Nhập liên kết https://...");
    if (!rawUrl) return;

    const url = rawUrl.trim();
    if (!/^https:\/\//i.test(url)) {
      setLinkError("Liên kết phải bắt đầu bằng https://");
      return;
    }

    document.execCommand("createLink", false, url);
    editorRef.current?.querySelectorAll("a").forEach((anchor) => {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    });

    rememberSelection();
    emitCurrentValue();
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    emitCurrentValue();
  }

  function openImagePicker() {
    rememberSelection();
    fileInputRef.current?.click();
  }

  async function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
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

      if (uploadResult.error) throw uploadResult.error;

      const publicUrl = supabase.storage
        .from("event-images")
        .getPublicUrl(objectPath).data.publicUrl;

      const caption = defaultCaption(file) || "Ảnh minh họa";

      restoreSelection();
      document.execCommand(
        "insertHTML",
        false,
        `<figure><img src="${escapeHtml(publicUrl)}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure><p><br></p>`
      );

      rememberSelection();
      emitCurrentValue();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Không thể upload ảnh.");
    } finally {
      setUploading(false);
    }
  }

  const toolbarPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div className="event-content-editor rich-editor-shell">
      <div className="rich-editor-toolbar" aria-label="Định dạng nội dung">
        <button type="button" className="rich-tool-button rich-tool-bold" title="Đậm" aria-label="Đậm" onPointerDown={toolbarPointerDown} onClick={() => runInlineCommand("bold")} disabled={disabled}>B</button>
        <button type="button" className="rich-tool-button rich-tool-italic" title="Nghiêng" aria-label="Nghiêng" onPointerDown={toolbarPointerDown} onClick={() => runInlineCommand("italic")} disabled={disabled}>I</button>
        <button type="button" className="rich-tool-button rich-tool-underline" title="Gạch chân" aria-label="Gạch chân" onPointerDown={toolbarPointerDown} onClick={() => runInlineCommand("underline")} disabled={disabled}>U</button>

        <span className="rich-toolbar-divider" />

        <button type="button" className="rich-tool-button rich-tool-text" title="Tiêu đề" onPointerDown={toolbarPointerDown} onClick={() => runBlockCommand("h2")} disabled={disabled}>H2</button>
        <button type="button" className="rich-tool-button rich-tool-text" title="Danh sách" onPointerDown={toolbarPointerDown} onClick={toggleBulletList} disabled={disabled}>• List</button>
        <button type="button" className="rich-tool-button rich-tool-text" title="Trích dẫn" onPointerDown={toolbarPointerDown} onClick={() => runBlockCommand("blockquote")} disabled={disabled}>“ Quote</button>
        <button type="button" className="rich-tool-button rich-tool-text" title="Gắn liên kết" onPointerDown={toolbarPointerDown} onClick={addLink} disabled={disabled}>Link</button>

        <span className="rich-toolbar-divider" />

        <button
          type="button"
          className="rich-tool-button rich-tool-image"
          title="Thêm ảnh"
          onPointerDown={(event) => {
            toolbarPointerDown(event);
            rememberSelection();
          }}
          onClick={openImagePicker}
          disabled={disabled || uploading}
        >
          {uploading ? "Đang tải..." : "+ Ảnh"}
        </button>

        <input ref={fileInputRef} className="content-image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelected} tabIndex={-1} />
      </div>

      <div
        ref={editorRef}
        className={`rich-editor-surface ${textareaClassName ?? ""}`}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => {
          rememberSelection();
          emitCurrentValue();
        }}
        onKeyUp={rememberSelection}
        onPointerUp={rememberSelection}
        onFocus={rememberSelection}
        onBlur={rememberSelection}
        onPaste={handlePaste}
      />

      <div className="rich-editor-note">
        B / I / U: nếu không bôi đen chữ, nút sẽ áp dụng cho cả đoạn đang đặt con trỏ.
      </div>

      {linkError && <div className="content-upload-error">{linkError}</div>}
      {uploadError && <div className="content-upload-error">{uploadError}</div>}
    </div>
  );
}
