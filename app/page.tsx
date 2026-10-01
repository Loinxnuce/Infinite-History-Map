"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AddEventForm from "@/components/AddEventForm";
import { findEventGallery, type GalleryImage } from "@/lib/findEventGallery";

type HistoryNode = {
  id: string;
  type: string;
  title: string;
  year: number | null;
  month: number | null;
  day: number | null;
  content: string | null;
  category: string | null;
  importance_level: number | null;
  parent_id: string | null;
};

const MAIN_RANGE_MIN = -10000;
const MAIN_RANGE_MAX = 2030;

function formatYear(year: number | null) {
  if (year === null) return "Không rõ năm";
  return year < 0 ? `${Math.abs(year)} TCN` : String(year);
}

function formatHistoricalDate(day: number | null, month: number | null, year: number | null) {
  const d = day === null ? "--" : String(day).padStart(2, "0");
  const m = month === null ? "--" : String(month).padStart(2, "0");
  return `${d}/${m}/${formatYear(year)}`;
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

function eventLevel(event: HistoryNode | null | undefined) {
  return event?.importance_level ?? 1;
}

function buildStarPoints(cx: number, cy: number, outerRadius = 8, innerRadius = 3.8) {
  const points: string[] = [];

  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    points.push(`${x},${y}`);
  }

  return points.join(" ");
}

function buildArcPath(x1: number, y1: number, x2: number, y2: number, extraLift: number) {
  const span = Math.abs(x2 - x1);
  const midX = (x1 + x2) / 2;
  const controlY =
    Math.min(y1, y2) -
    extraLift -
    Math.min(110, span * 0.08);

  if (span < 1) {
    return `M ${x1} ${y1} Q ${x1 + 16} ${controlY} ${x2} ${y2}`;
  }

  return `M ${x1} ${y1} Q ${midX} ${controlY} ${x2} ${y2}`;
}

export default function Home() {
  const [nodes, setNodes] = useState<HistoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");

  const [selectedDecadeStart, setSelectedDecadeStart] = useState<number | null>(null);
  const [selectedYearFocus, setSelectedYearFocus] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [jumpYearInput, setJumpYearInput] = useState("");
  const [jumpYearError, setJumpYearError] = useState("");

  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Admin authentication
  const [authOpen, setAuthOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDay, setEditDay] = useState(1);
  const [editMonth, setEditMonth] = useState(1);
  const [editYear, setEditYear] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editLevel, setEditLevel] = useState(1);
  const [editParentId, setEditParentId] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [centerYear, setCenterYear] = useState(1900);
  const [scale, setScale] = useState(5);
  const [draggingTimeline, setDraggingTimeline] = useState(false);
  const [lastPointerX, setLastPointerX] = useState(0);

  const timelineWidth = 1600;
  const timelineHeight = 200;
  const timelineY = 90;

  async function loadNodes() {
    setLoading(true);
    setDatabaseError("");

    const result = await supabase
      .from("nodes")
      .select("*")
      .eq("type", "event")
      .order("year", { ascending: true, nullsFirst: false })
      .order("month", { ascending: true, nullsFirst: false })
      .order("day", { ascending: true, nullsFirst: false });

    if (result.error) {
      setDatabaseError(result.error.message);
      setLoading(false);
      return;
    }

    setNodes(result.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadNodes();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const result = await supabase.auth.getUser();
      if (!active) return;

      const user = result.data.user ?? null;
      setAuthUserId(user?.id ?? null);
      setAuthUserEmail(user?.email ?? null);
      setAuthReady(true);
    }

    loadCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      const user = session?.user ?? null;
      setAuthUserId(user?.id ?? null);
      setAuthUserEmail(user?.email ?? null);
      setAuthReady(true);

      if (!user) {
        setIsAdmin(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function checkAdmin() {
      if (!authUserId) {
        setIsAdmin(false);
        return;
      }

      const result = await supabase.rpc("is_site_admin");

      if (!active) return;

      if (result.error) {
        setIsAdmin(false);
        setAuthError(
          "Không thể kiểm tra quyền quản trị. Hãy chắc rằng bạn đã chạy file SQL bảo mật của V2.19."
        );
        return;
      }

      setIsAdmin(result.data === true);
    }

    checkAdmin();

    return () => {
      active = false;
    };
  }, [authUserId]);

  const timelineEvents = useMemo(
    () =>
      nodes
        .filter((node) => node.year !== null)
        .sort((a, b) => {
          if ((a.year ?? 0) !== (b.year ?? 0)) return (a.year ?? 0) - (b.year ?? 0);
          if ((a.month ?? 1) !== (b.month ?? 1)) return (a.month ?? 1) - (b.month ?? 1);
          return (a.day ?? 1) - (b.day ?? 1);
        }),
    [nodes]
  );

  const selectedEvent =
    selectedEventId === null
      ? null
      : timelineEvents.find((event) => event.id === selectedEventId) ?? null;

  const nodeById = useMemo(() => {
    return new Map(timelineEvents.map((event) => [event.id, event]));
  }, [timelineEvents]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, HistoryNode[]>();
    for (const event of timelineEvents) {
      if (!event.parent_id) continue;
      const list = map.get(event.parent_id) ?? [];
      list.push(event);
      map.set(event.parent_id, list);
    }
    return map;
  }, [timelineEvents]);

  const selectedLevel = selectedEvent ? eventLevel(selectedEvent) : null;
  const selectedParent =
    selectedEvent?.parent_id ? nodeById.get(selectedEvent.parent_id) ?? null : null;
  const selectedRoot =
    selectedLevel === 1
      ? selectedEvent
      : selectedLevel === 2
      ? selectedParent
      : selectedParent?.parent_id
      ? nodeById.get(selectedParent.parent_id) ?? null
      : null;

  const selectedChildren =
    selectedEvent ? childrenByParent.get(selectedEvent.id) ?? [] : [];

  const editParentOptions = useMemo(() => {
    if (editLevel <= 1) return [];
    return timelineEvents.filter(
      (event) => event.id !== selectedEventId && eventLevel(event) === editLevel - 1
    );
  }, [editLevel, timelineEvents, selectedEventId]);

  const decadeEvents = useMemo(() => {
    if (selectedDecadeStart === null) return [];

    if (selectedYearFocus !== null) {
      return timelineEvents.filter(
        (event) => event.year === selectedYearFocus
      );
    }

    const end = selectedDecadeStart + 9;
    return timelineEvents.filter(
      (event) => event.year !== null && event.year >= selectedDecadeStart && event.year <= end
    );
  }, [selectedDecadeStart, selectedYearFocus, timelineEvents]);

  const eventYearSummaries = useMemo(() => {
    const summaries = new Map<
      number,
      {
        count: number;
        hasLevel1: boolean;
        hasLevel2: boolean;
        hasLevel3: boolean;
      }
    >();

    for (const event of timelineEvents) {
      if (event.year === null) continue;

      const current = summaries.get(event.year) ?? {
        count: 0,
        hasLevel1: false,
        hasLevel2: false,
        hasLevel3: false,
      };

      const level = eventLevel(event);
      current.count += 1;
      if (level === 1) current.hasLevel1 = true;
      if (level === 2) current.hasLevel2 = true;
      if (level === 3) current.hasLevel3 = true;

      summaries.set(event.year, current);
    }

    return Array.from(summaries.entries())
      .map(([year, summary]) => ({ year, ...summary }))
      .sort((a, b) => a.year - b.year);
  }, [timelineEvents]);

  const level1Markers = useMemo(() => {
    const grouped = new Map<number, HistoryNode[]>();

    for (const event of timelineEvents) {
      if (event.year === null || eventLevel(event) !== 1) continue;
      const list = grouped.get(event.year) ?? [];
      list.push(event);
      grouped.set(event.year, list);
    }

    const markers: {
      event: HistoryNode;
      year: number;
      y: number;
      stackIndex: number;
      stackCount: number;
    }[] = [];

    const sortedYears = Array.from(grouped.keys()).sort((a, b) => a - b);

    for (const year of sortedYears) {
      const events = grouped.get(year) ?? [];
      events.sort((a, b) => {
        if ((a.month ?? 1) !== (b.month ?? 1)) return (a.month ?? 1) - (b.month ?? 1);
        if ((a.day ?? 1) !== (b.day ?? 1)) return (a.day ?? 1) - (b.day ?? 1);
        return a.title.localeCompare(b.title);
      });

      events.forEach((event, index) => {
        markers.push({
          event,
          year,
          y: timelineY - 58,
          stackIndex: index,
          stackCount: events.length,
        });
      });
    }

    return markers;
  }, [timelineEvents]);

  const level1MarkerById = useMemo(() => {
    return new Map(level1Markers.map((marker) => [marker.event.id, marker]));
  }, [level1Markers]);

  const hierarchyLinks = useMemo(() => {
    const level1To2: { parent: HistoryNode; child: HistoryNode }[] = [];

    for (const event of timelineEvents) {
      if (!event.parent_id || event.year === null) continue;

      const parent = nodeById.get(event.parent_id);
      if (!parent || parent.year === null) continue;

      if (eventLevel(parent) === 1 && eventLevel(event) === 2) {
        level1To2.push({ parent, child: event });
      }
    }

    return { level1To2 };
  }, [timelineEvents, nodeById]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return timelineEvents
      .filter((event) => event.title.toLowerCase().includes(query))
      .sort((a, b) => {
        const aa = a.title.toLowerCase();
        const bb = b.title.toLowerCase();
        const aStarts = aa.startsWith(query) ? 0 : 1;
        const bStarts = bb.startsWith(query) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return aa.localeCompare(bb);
      })
      .slice(0, 12);
  }, [searchQuery, timelineEvents]);

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      if (!selectedEvent) {
        setGalleryImages([]);
        setGalleryError("");
        setGalleryLoading(false);
        return;
      }

      setGalleryLoading(true);
      setGalleryError("");
      setGalleryImages([]);

      try {
        const images = await findEventGallery(selectedEvent.title, selectedEvent.year);
        if (!cancelled) setGalleryImages(images);
      } catch (error) {
        if (!cancelled) {
          setGalleryError(error instanceof Error ? error.message : "Không thể tải gallery.");
        }
      } finally {
        if (!cancelled) setGalleryLoading(false);
      }
    }

    loadGallery();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.id, selectedEvent?.title, selectedEvent?.year]);

  function yearToX(year: number) {
    return timelineWidth / 2 + (year - centerYear) * scale;
  }

  function xToYear(x: number) {
    return centerYear + (x - timelineWidth / 2) / scale;
  }

  function openDecade(start: number) {
    setSelectedDecadeStart(start);
    setSelectedYearFocus(null);
    setSelectedEventId(null);
    setEditOpen(false);
    setDeleteError("");
    setGalleryImages([]);
    setGalleryError("");
    setCenterYear(start + 4.5);
  }

  function openDecadeForYear(year: number) {
    openDecade(year);
  }

  function openYearEvents(year: number) {
    setSelectedDecadeStart(year);
    setSelectedYearFocus(year);
    setSelectedEventId(null);
    setEditOpen(false);
    setDeleteError("");
    setGalleryImages([]);
    setGalleryError("");
    setCenterYear(year);
  }

  function selectEvent(event: HistoryNode, preserveListContext = false) {
    if (event.year !== null) {
      if (!preserveListContext) {
        setSelectedDecadeStart(event.year);
        setSelectedYearFocus(event.year);
      }
      setCenterYear(event.year);
    }
    setSelectedEventId(event.id);
    setDeleteError("");
    setEditOpen(false);
  }

  function returnToDecadeList() {
    setSelectedEventId(null);
    setEditOpen(false);
    setDeleteError("");
    setGalleryImages([]);
    setGalleryError("");
  }

  function clearSelection() {
    setSelectedDecadeStart(null);
    setSelectedYearFocus(null);
    setSelectedEventId(null);
    setEditOpen(false);
    setDeleteError("");
    setGalleryImages([]);
    setGalleryError("");
  }

  function selectSearchResult(event: HistoryNode) {
    selectEvent(event);
    setSearchQuery("");
    setSearchOpen(false);
  }

  function openEdit() {
    if (!selectedEvent || !isAdmin) return;
    setEditTitle(selectedEvent.title);
    setEditDay(selectedEvent.day ?? 1);
    setEditMonth(selectedEvent.month ?? 1);
    setEditYear(selectedEvent.year === null ? "" : String(selectedEvent.year));
    setEditContent(selectedEvent.content ?? "");
    setEditLevel(eventLevel(selectedEvent));
    setEditParentId(selectedEvent.parent_id ?? "");
    setEditError("");
    setEditOpen(true);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEvent) return;

    if (!isAdmin) {
      setEditError("Bạn cần đăng nhập bằng tài khoản quản trị để chỉnh sửa.");
      return;
    }

    setEditError("");
    const yearNumber = Number(editYear);

    if (!editTitle.trim()) {
      setEditError("Hãy nhập tên sự kiện.");
      return;
    }
    if (!Number.isInteger(yearNumber)) {
      setEditError("Năm phải là một số nguyên.");
      return;
    }
    if (editMonth < 1 || editMonth > 12) {
      setEditError("Tháng phải từ 1 đến 12.");
      return;
    }

    const maxDay = daysInMonth(yearNumber, editMonth);
    if (!Number.isInteger(editDay) || editDay < 1 || editDay > maxDay) {
      setEditError(`Ngày không hợp lệ. Tháng ${editMonth} năm ${formatYear(yearNumber)} có tối đa ${maxDay} ngày.`);
      return;
    }

    if (![1, 2, 3].includes(editLevel)) {
      setEditError("Cấp sự kiện không hợp lệ.");
      return;
    }

    const existingChildren = childrenByParent.get(selectedEvent.id) ?? [];
    if (existingChildren.length > 0 && editLevel !== eventLevel(selectedEvent)) {
      setEditError("Không thể đổi cấp vì sự kiện này đang có sự kiện con.");
      return;
    }

    let parentId: string | null = null;
    if (editLevel > 1) {
      if (!editParentId) {
        setEditError(`Sự kiện cấp ${editLevel} bắt buộc phải chọn sự kiện cấp ${editLevel - 1}.`);
        return;
      }

      const parent = nodeById.get(editParentId);
      if (!parent || eventLevel(parent) !== editLevel - 1) {
        setEditError("Sự kiện cha không đúng cấp.");
        return;
      }
      parentId = parent.id;
    }

    setEditSaving(true);
    const updatedValues = {
      title: editTitle.trim(),
      day: editDay,
      month: editMonth,
      year: yearNumber,
      content: editContent.trim() || null,
      importance_level: editLevel,
      parent_id: parentId,
    };

    const result = await supabase.from("nodes").update(updatedValues).eq("id", selectedEvent.id);
    setEditSaving(false);

    if (result.error) {
      setEditError(result.error.message);
      return;
    }

    setNodes((current) =>
      current.map((node) => (node.id === selectedEvent.id ? { ...node, ...updatedValues } : node))
    );
    setSelectedDecadeStart(yearNumber);
    setSelectedYearFocus(yearNumber);
    setCenterYear(yearNumber);
    setEditOpen(false);
  }

  async function deleteSelectedEvent() {
    if (!selectedEvent) return;

    if (!isAdmin) {
      setDeleteError("Bạn cần đăng nhập bằng tài khoản quản trị để xóa sự kiện.");
      return;
    }

    const children = childrenByParent.get(selectedEvent.id) ?? [];
    if (children.length > 0) {
      setDeleteError("Sự kiện này đang có sự kiện con. Hãy xóa hoặc chuyển các sự kiện con trước.");
      return;
    }

    const confirmed = window.confirm(`Bạn có chắc muốn xóa sự kiện "${selectedEvent.title}" không?`);
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");

    const deleteConnections = await supabase
      .from("connections")
      .delete()
      .or(`source_id.eq.${selectedEvent.id},target_id.eq.${selectedEvent.id}`);

    if (
      deleteConnections.error &&
      !deleteConnections.error.message.toLowerCase().includes("does not exist")
    ) {
      setDeleting(false);
      setDeleteError(deleteConnections.error.message);
      return;
    }

    const deleteNode = await supabase.from("nodes").delete().eq("id", selectedEvent.id);
    setDeleting(false);

    if (deleteNode.error) {
      setDeleteError(deleteNode.error.message);
      return;
    }

    setNodes((current) => current.filter((item) => item.id !== selectedEvent.id));
    returnToDecadeList();
  }

  async function handleAdminLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    if (!authEmail.trim() || !authPassword) {
      setAuthError("Hãy nhập email và mật khẩu.");
      return;
    }

    setAuthLoading(true);

    const result = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });

    setAuthLoading(false);

    if (result.error) {
      setAuthError("Email hoặc mật khẩu không đúng.");
      return;
    }

    setAuthPassword("");
  }

  async function handleAdminLogout() {
    setAuthLoading(true);
    setAuthError("");

    const result = await supabase.auth.signOut();

    setAuthLoading(false);

    if (result.error) {
      setAuthError(result.error.message);
      return;
    }

    setIsAdmin(false);
    setAuthOpen(false);
    setEditOpen(false);
  }

  function handleJumpToYear(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJumpYearError("");

    const targetYear = Number(jumpYearInput);
    if (!Number.isInteger(targetYear)) {
      setJumpYearError("Hãy nhập một năm nguyên hợp lệ.");
      return;
    }

    openDecadeForYear(targetYear);
  }

  function handleTimelineWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * timelineWidth;
    const yearAtMouse = xToYear(mouseX);
    const factor = event.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.min(80, Math.max(0.08, scale * factor));
    const newCenter = yearAtMouse - (mouseX - timelineWidth / 2) / newScale;

    setScale(newScale);
    setCenterYear(newCenter);
  }

  function handleTimelinePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    setDraggingTimeline(true);
    setLastPointerX(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTimelinePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!draggingTimeline) return;
    const dx = event.clientX - lastPointerX;
    setCenterYear((year) => year - dx / scale);
    setLastPointerX(event.clientX);
  }

  function handleTimelinePointerUp() {
    setDraggingTimeline(false);
  }

  // Smallest interval = 10 years.
  const tickStep =
    scale >= 4 ? 10 : scale >= 1.5 ? 20 : scale >= 0.6 ? 50 : scale >= 0.25 ? 100 : 500;

  const minYear = centerYear - timelineWidth / 2 / scale;
  const maxYear = centerYear + timelineWidth / 2 / scale;
  const firstTick = Math.floor(minYear / tickStep) * tickStep;

  const visibleTicks: number[] = [];
  for (let year = firstTick; year <= maxYear; year += tickStep) visibleTicks.push(year);

  const visibleEventYears = eventYearSummaries.filter(
    ({ year }) => year >= minYear && year <= maxYear
  );

  return (
    <main className={`history-app${selectedEvent ? " event-open" : selectedDecadeStart !== null ? " decade-open" : ""}`}>
      <header className="app-header">
        <div>
          <div className="app-title">Infinite History</div>
          <div className="app-subtitle">Timeline 10 năm · ★ = cấp 1 · màu chấm thể hiện cấp cao nhất trong năm</div>
        </div>
        <div className="header-status">
          {loading ? "Đang tải dữ liệu..." : `${timelineEvents.length} sự kiện`}
        </div>
      </header>

      <div className="top-actions">
        <div className="search-panel">
          <button
            type="button"
            className="search-open-button"
            onClick={() => {
              setSearchOpen((value) => !value);
              setSearchQuery("");
            }}
          >
            Tìm sự kiện
          </button>

          {searchOpen && (
            <div className="search-popover">
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Nhập tên sự kiện..."
              />

              <div className="search-results">
                {!searchQuery.trim() && <div className="search-empty">Nhập một phần tên sự kiện.</div>}
                {searchQuery.trim() && searchResults.length === 0 && (
                  <div className="search-empty">Không tìm thấy sự kiện.</div>
                )}
                {searchResults.map((event) => (
                  <button
                    type="button"
                    className="search-result"
                    key={event.id}
                    onClick={() => selectSearchResult(event)}
                  >
                    <span className="search-result-title">{event.title}</span>
                    <span className="search-result-date">
                      {formatHistoricalDate(event.day, event.month, event.year)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {isAdmin && <AddEventForm />}

        <div className="auth-panel">
          <button
            type="button"
            className={`auth-open-button${isAdmin ? " admin-active" : ""}`}
            onClick={() => {
              setAuthOpen((value) => !value);
              setAuthError("");
            }}
          >
            {!authReady
              ? "..."
              : isAdmin
              ? "Admin"
              : authUserId
              ? "Tài khoản"
              : "Đăng nhập"}
          </button>

          {authOpen && (
            <div className="auth-popover">
              {!authUserId ? (
                <form onSubmit={handleAdminLogin}>
                  <div className="auth-title">Đăng nhập quản trị</div>
                  <div className="auth-help">
                    Khách truy cập chỉ có quyền xem. Add / Edit / Delete chỉ hiện sau khi đăng nhập quản trị.
                  </div>

                  <label>Email</label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                  />

                  <label>Mật khẩu</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />

                  {authError && <div className="auth-error">{authError}</div>}

                  <button
                    type="submit"
                    className="auth-login-button"
                    disabled={authLoading}
                  >
                    {authLoading ? "Đang đăng nhập..." : "Đăng nhập"}
                  </button>
                </form>
              ) : (
                <div>
                  <div className="auth-title">
                    {isAdmin ? "Quản trị viên" : "Tài khoản đã đăng nhập"}
                  </div>

                  <div className="auth-user-email">{authUserEmail}</div>

                  <div className={`auth-status ${isAdmin ? "is-admin" : "not-admin"}`}>
                    {isAdmin
                      ? "Có quyền Add / Edit / Delete."
                      : "Tài khoản này chưa được cấp quyền quản trị."}
                  </div>

                  {authError && <div className="auth-error">{authError}</div>}

                  <button
                    type="button"
                    className="auth-logout-button"
                    onClick={handleAdminLogout}
                    disabled={authLoading}
                  >
                    {authLoading ? "Đang đăng xuất..." : "Đăng xuất"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <section className="reading-area">
        {databaseError && <div className="database-error">Database error: {databaseError}</div>}

        {selectedEvent ? (
          <article className="event-article">
            <div className="article-header">
              <div className="article-heading-block">
                <button type="button" className="back-to-list-button" onClick={returnToDecadeList}>
                  ← Danh sách {selectedYearFocus !== null
                    ? formatYear(selectedYearFocus)
                    : selectedDecadeStart !== null
                    ? `${formatYear(selectedDecadeStart)} – ${formatYear(selectedDecadeStart + 9)}`
                    : ""}
                </button>

                <div className="event-meta-line">
                  <div className="content-date">
                    {formatHistoricalDate(selectedEvent.day, selectedEvent.month, selectedEvent.year)}
                  </div>
                  <span className={`importance-badge level-${selectedLevel ?? 1}`}>
                    Cấp {selectedLevel ?? 1}
                  </span>
                </div>

                <div className="article-title-row">
                  <h1>{selectedEvent.title}</h1>

                  {isAdmin && (
                    <div className="article-toolbar">
                      <button type="button" className="edit-event-button" onClick={openEdit}>
                        Chỉnh sửa
                      </button>
                      <button
                        type="button"
                        className="delete-event-button"
                        onClick={deleteSelectedEvent}
                        disabled={deleting}
                      >
                        {deleting ? "Đang xóa..." : "Xóa sự kiện"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="close-content-button"
                onClick={clearSelection}
                aria-label="Đóng nội dung"
              >
                ×
              </button>
            </div>

            {deleteError && <div className="panel-error">{deleteError}</div>}

            <div className="article-scroll">
              <section className="hierarchy-section">
                <div className="hierarchy-heading">
                  <strong>Liên kết sự kiện</strong>
                  <span>Cấp 1 → Cấp 2 → Cấp 3</span>
                </div>

                {selectedLevel === 1 && selectedEvent && (
                  <div className="hierarchy-tree">
                    <div className="hierarchy-root-row">
                      <span className="tree-level-label">C1</span>
                      <span className="tree-current-title">{selectedEvent.title}</span>
                    </div>

                    {(childrenByParent.get(selectedEvent.id) ?? []).length === 0 ? (
                      <div className="hierarchy-empty">Chưa có sự kiện cấp 2 thuộc sự kiện gốc này.</div>
                    ) : (
                      (childrenByParent.get(selectedEvent.id) ?? []).map((level2) => (
                        <div className="tree-level2-group" key={level2.id}>
                          <button type="button" className="tree-event-link level2" onClick={() => selectEvent(level2)}>
                            <span className="tree-level-label">C2</span>
                            <span>{level2.title}</span>
                            <small>{formatHistoricalDate(level2.day, level2.month, level2.year)}</small>
                          </button>

                          {(childrenByParent.get(level2.id) ?? []).map((level3) => (
                            <button type="button" className="tree-event-link level3" key={level3.id} onClick={() => selectEvent(level3)}>
                              <span className="tree-level-label">C3</span>
                              <span>{level3.title}</span>
                              <small>{formatHistoricalDate(level3.day, level3.month, level3.year)}</small>
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {selectedLevel === 2 && selectedEvent && (
                  <div className="hierarchy-branch">
                    <div className="hierarchy-path">
                      {selectedRoot && (
                        <button type="button" onClick={() => selectEvent(selectedRoot)}>
                          <span className="tree-level-label">C1</span> {selectedRoot.title}
                        </button>
                      )}
                      <span className="path-arrow">→</span>
                      <span className="path-current"><span className="tree-level-label">C2</span> {selectedEvent.title}</span>
                    </div>

                    {selectedChildren.length > 0 && (
                      <div className="branch-children">
                        {selectedChildren.map((child) => (
                          <button type="button" key={child.id} onClick={() => selectEvent(child)}>
                            <span className="tree-level-label">C3</span>
                            <span>{child.title}</span>
                            <small>{formatHistoricalDate(child.day, child.month, child.year)}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedLevel === 3 && selectedEvent && (
                  <div className="hierarchy-path">
                    {selectedRoot && (
                      <button type="button" onClick={() => selectEvent(selectedRoot)}>
                        <span className="tree-level-label">C1</span> {selectedRoot.title}
                      </button>
                    )}
                    <span className="path-arrow">→</span>
                    {selectedParent && (
                      <button type="button" onClick={() => selectEvent(selectedParent)}>
                        <span className="tree-level-label">C2</span> {selectedParent.title}
                      </button>
                    )}
                    <span className="path-arrow">→</span>
                    <span className="path-current"><span className="tree-level-label">C3</span> {selectedEvent.title}</span>
                  </div>
                )}
              </section>

              <section className="event-text">
                {selectedEvent.content?.trim() ? (
                  selectedEvent.content.split("\n").map((paragraph, index) =>
                    paragraph.trim() ? <p key={index}>{paragraph}</p> : <div key={index} className="content-space" />
                  )
                ) : (
                  <p className="empty-content">Sự kiện này chưa có nội dung.</p>
                )}
              </section>

              <section className="gallery-section">
                <div className="gallery-heading-row">
                  <h2>Gallery</h2>
                  <span>Wikimedia Commons</span>
                </div>

                {galleryLoading && <div className="gallery-status">Đang tìm 10 hình ảnh đại diện...</div>}
                {galleryError && <div className="gallery-status gallery-error">{galleryError}</div>}
                {!galleryLoading && !galleryError && galleryImages.length === 0 && (
                  <div className="gallery-status">Chưa tìm được hình phù hợp.</div>
                )}
                {!galleryLoading && galleryImages.length > 0 && (
                  <div className="gallery-grid">
                    {galleryImages.map((image, index) => (
                      <a
                        key={`${image.pageUrl}-${index}`}
                        href={image.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="gallery-card"
                        title={image.title}
                      >
                        <img src={image.imageUrl} alt={image.title} loading="lazy" />
                        <div className="gallery-caption">{image.title}</div>
                      </a>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </article>
        ) : selectedDecadeStart !== null ? (
          <section className="decade-view">
            <div className="decade-view-header">
              <div>
                <div className="decade-eyebrow">
                  {selectedYearFocus !== null ? "Sự kiện trong năm" : "Khoảng 10 năm"}
                </div>
                <h1>
                  {selectedYearFocus !== null
                    ? formatYear(selectedYearFocus)
                    : `${formatYear(selectedDecadeStart)} – ${formatYear(selectedDecadeStart + 9)}`}
                </h1>
                <p>{decadeEvents.length} sự kiện</p>
              </div>
              <button type="button" className="close-content-button" onClick={clearSelection}>×</button>
            </div>

            <div className="decade-list">
              {decadeEvents.length === 0 ? (
                <div className="decade-empty">
                  {selectedYearFocus !== null
                    ? "Chưa có sự kiện nào trong năm này."
                    : "Chưa có sự kiện nào trong khoảng 10 năm này."}
                </div>
              ) : (
                decadeEvents.map((event) => (
                  <button key={event.id} type="button" className={`decade-event-row level-${eventLevel(event)}`} onClick={() => selectEvent(event, true)}>
                    <div className="decade-event-date">{formatHistoricalDate(event.day, event.month, event.year)}</div>
                    <div className="decade-event-title">
                      <span className={`list-level-badge level-${eventLevel(event)}`}>C{eventLevel(event)}</span>
                      {event.title}
                    </div>
                    <div className="decade-event-arrow">→</div>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : (
          <div className="empty-reading-state">
            <div className="empty-reading-icon">◌</div>
            <h2>Chào mừng tới dòng chảy lịch sử của tui</h2>
<h2>Ai đó muốn đóng góp thì liên hệ tui cấp account cho tham gia dự án nha =))</h2>
<p>Tui tạo website này để ghi lại mọi kiến thức về dòng chảy lịch sử mà mình học được, bởi vì cái đầu cá vàng không thể nhớ được mọi thứ nhất là khi sắp vô tuổi 30. </p>
          </div>
        )}
      </section>

      <section className="timeline-section">
        <div className="timeline-header">
          <div>
            <strong>Timeline</strong>
            <span>Phía trên: click năm có sự kiện → xem đúng 1 năm · phía dưới: click mốc → xem 10 năm</span>
          </div>

          <div className="timeline-tools">
            <form className="jump-to-year-form" onSubmit={handleJumpToYear}>
              <input
                value={jumpYearInput}
                onChange={(event) => setJumpYearInput(event.target.value)}
                placeholder="Nhập năm..."
                inputMode="numeric"
              />
              <button type="submit">Đi</button>
            </form>
            {jumpYearError && <div className="jump-year-error">{jumpYearError}</div>}
          </div>
        </div>

        <svg
          className="timeline-canvas"
          viewBox={`0 0 ${timelineWidth} ${timelineHeight}`}
          onWheel={handleTimelineWheel}
          onPointerDown={handleTimelinePointerDown}
          onPointerMove={handleTimelinePointerMove}
          onPointerUp={handleTimelinePointerUp}
          onPointerLeave={handleTimelinePointerUp}
        >
          <rect width={timelineWidth} height={timelineHeight} fill="#ffffff" />
          <line x1="0" y1={timelineY} x2={timelineWidth} y2={timelineY} stroke="#9ca3af" strokeWidth="2" />

          {hierarchyLinks.level1To2.map(({ parent, child }) => {
            if (parent.year === null || child.year === null) return null;
            if (parent.year < minYear || parent.year > maxYear) return null;
            if (child.year < minYear || child.year > maxYear) return null;

            const parentMarker = level1MarkerById.get(parent.id);
            const starOffset = parentMarker
              ? (parentMarker.stackIndex - (parentMarker.stackCount - 1) / 2) * 38
              : 0;
            const x1 = yearToX(parent.year) + starOffset;
            const x2 = yearToX(child.year);
            const y1 = (parentMarker?.y ?? timelineY - 58) + 17;
            const y2 = timelineY - 24;
            const path = buildArcPath(x1, y1, x2, y2, 22);

            return (
              <path
                key={`l12-${parent.id}-${child.id}`}
                d={path}
                className="timeline-link-level1"
                fill="none"
                stroke="#d4a72c"
                strokeWidth="1.25"
                strokeDasharray="4 5"
                strokeLinecap="round"
                opacity="0.7"
              />
            );
          })}

          {visibleTicks.map((year) => {
            const x = yearToX(year);
            const outsideMainRange = year < MAIN_RANGE_MIN || year > MAIN_RANGE_MAX;
            const active = selectedDecadeStart === year;

            return (
              <g
                key={year}
                className="decade-tick"
                opacity={outsideMainRange ? 0.3 : 1}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  openDecade(year);
                }}
              >
                <line
                  x1={x}
                  y1={timelineY - 17}
                  x2={x}
                  y2={timelineY + 17}
                  stroke={active ? "#2563eb" : "#6b7280"}
                  strokeWidth={active ? 2 : 1.4}
                />
                <rect
                  x={x - 42}
                  y={timelineY + 27}
                  width="84"
                  height="32"
                  rx="8"
                  fill={active ? "#eff6ff" : "#ffffff"}
                  stroke={active ? "#2563eb" : "#e5e7eb"}
                />
                <text x={x} y={timelineY + 48} fill="#374151" textAnchor="middle" fontSize="12" fontWeight="650">
                  {formatYear(year)}
                </text>
              </g>
            );
          })}

          {visibleEventYears.map(({ year, count, hasLevel1, hasLevel2 }) => {
            const x = yearToX(year);
            const outsideMainRange = year < MAIN_RANGE_MIN || year > MAIN_RANGE_MAX;

            const markerStyle = hasLevel1
              ? {
                  fill: "#dc2626",
                  textFill: "#dc2626",
                  radius: count > 1 ? 7 : 6,
                  className: "event-year-marker marker-level1",
                }
              : hasLevel2
              ? {
                  fill: "#fca5a5",
                  textFill: "#ef7777",
                  radius: 4.5,
                  className: "event-year-marker marker-level2",
                }
              : {
                  fill: "#9ca3af",
                  textFill: "#7b8490",
                  radius: 4.5,
                  className: "event-year-marker marker-level3",
                };

            return (
              <g
                key={`event-year-${year}`}
                className={markerStyle.className}
                opacity={outsideMainRange ? 0.45 : 1}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  openYearEvents(year);
                }}
              >
                <circle
                  cx={x}
                  cy={timelineY}
                  r={markerStyle.radius}
                  fill={markerStyle.fill}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={timelineY - 20}
                  fill={markerStyle.textFill}
                  textAnchor="middle"
                  fontSize={hasLevel1 ? "11" : "10.5"}
                  fontWeight={hasLevel1 ? "800" : "700"}
                >
                  {formatYear(year)}{count > 1 ? ` · ${count}` : ""}
                </text>
              </g>
            );
          })}

          {level1Markers.map((marker) => {
            if (marker.year < minYear || marker.year > maxYear) return null;

            const starOffset =
              (marker.stackIndex - (marker.stackCount - 1) / 2) * 38;
            const x = yearToX(marker.year) + starOffset;
            const outsideMainRange = marker.year < MAIN_RANGE_MIN || marker.year > MAIN_RANGE_MAX;

            return (
              <g
                key={`level1-star-${marker.event.id}`}
                className="level1-star-marker"
                opacity={outsideMainRange ? 0.45 : 1}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  selectEvent(marker.event);
                }}
              >
                <title>{marker.event.title}</title>
                <polygon
                  points={buildStarPoints(x, marker.y, 17, 7.8)}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              </g>
            );
          })}

          <line
            x1={yearToX(MAIN_RANGE_MIN)}
            y1="0"
            x2={yearToX(MAIN_RANGE_MIN)}
            y2={timelineHeight}
            stroke="#667085"
            strokeWidth="2"
            strokeDasharray="7 7"
            opacity="0.5"
          />
          <line
            x1={yearToX(MAIN_RANGE_MAX)}
            y1="0"
            x2={yearToX(MAIN_RANGE_MAX)}
            y2={timelineHeight}
            stroke="#d92d20"
            strokeWidth="2"
            strokeDasharray="7 7"
            opacity="0.5"
          />
        </svg>
      </section>

      {editOpen && selectedEvent && isAdmin && (
        <div
          className="edit-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditOpen(false);
          }}
        >
          <form className="edit-card" onSubmit={saveEdit}>
            <div className="edit-card-header">
              <div>
                <div className="edit-eyebrow">Chỉnh sửa sự kiện</div>
                <h2>{selectedEvent.title}</h2>
              </div>
              <button type="button" className="edit-close-button" onClick={() => setEditOpen(false)}>×</button>
            </div>

            <label>Tên sự kiện</label>
            <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />

            <div className="edit-date-row-three">
              <div>
                <label>Ngày</label>
                <input type="number" min="1" max="31" value={editDay} onChange={(event) => setEditDay(Number(event.target.value))} />
              </div>
              <div>
                <label>Tháng</label>
                <select value={editMonth} onChange={(event) => setEditMonth(Number(event.target.value))}>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <option key={month} value={month}>Tháng {month}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Năm</label>
                <input value={editYear} onChange={(event) => setEditYear(event.target.value)} placeholder="1979 hoặc -3200" inputMode="numeric" />
              </div>
            </div>

            <div className="edit-hierarchy-row">
              <div>
                <label>Độ quan trọng</label>
                <select
                  value={editLevel}
                  onChange={(event) => {
                    const nextLevel = Number(event.target.value);
                    setEditLevel(nextLevel);
                    setEditParentId("");
                  }}
                >
                  <option value={1}>Cấp 1 · Sự kiện gốc</option>
                  <option value={2}>Cấp 2 · Thuộc sự kiện cấp 1</option>
                  <option value={3}>Cấp 3 · Thuộc sự kiện cấp 2</option>
                </select>
              </div>

              {editLevel > 1 && (
                <div>
                  <label>Sự kiện cấp {editLevel - 1} cha</label>
                  <select
                    value={editParentId}
                    onChange={(event) => setEditParentId(event.target.value)}
                    required
                  >
                    <option value="">-- Chọn sự kiện cha --</option>
                    {editParentOptions.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.title} · {formatYear(parent.year)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <label>Nội dung</label>
            <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} />

            {editError && <div className="edit-error">{editError}</div>}

            <div className="edit-buttons">
              <button type="button" className="edit-cancel-button" onClick={() => setEditOpen(false)} disabled={editSaving}>Hủy</button>
              <button type="submit" className="edit-save-button" disabled={editSaving}>
                {editSaving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
