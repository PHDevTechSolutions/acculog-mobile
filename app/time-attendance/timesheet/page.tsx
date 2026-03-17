"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { FormatProvider } from "@/contexts/FormatContext";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import ProtectedPageWrapper from "@/components/protected-page-wrapper";
import {
  Search, DownloadCloud, Info, Clock, AlertCircle,
  ArrowDownLeft, ArrowUpRight, ArrowLeft,
} from "lucide-react";
import type { DateRange } from "react-day-picker";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityLog {
  ReferenceID: string;
  Email: string;
  Type: string;
  Status: string;
  Location: string;
  date_created: string;
  Remarks: string;
  _id?: string;
}

interface UserInfo {
  Firstname: string;
  Lastname: string;
  profilePicture?: string;
}

interface DailyLog {
  dateStr: string;
  label: string;
}

interface WeeklyLog extends Record<string, number> {
  late: number;
  undertime: number;
  overtime: number;
}

// ── Inner Page (uses useUser hook) ────────────────────────────────────────────

function TimesheetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId, setUserId } = useUser();
  const queryUserId = searchParams?.get("id") ?? "";

  const [userDetails, setUserDetails] = useState({
    UserId: "", Firstname: "", Lastname: "", Email: "",
    Role: "", Department: "", Company: "", ReferenceID: "",
  });

  const [posts, setPosts] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, UserInfo>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [dateCreatedFilterRange, setDateCreatedFilterRange] = useState<DateRange | undefined>(undefined);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  // Back navigation — go back to activity planner with same userId
  function handleBack() {
    const url = `/activity-planner${queryUserId ? `?id=${encodeURIComponent(queryUserId)}` : ""}`;
    router.push(url);
  }

  // Sync URL user id
  useEffect(() => {
    if (queryUserId && queryUserId !== userId) setUserId(queryUserId);
  }, [queryUserId, userId, setUserId]);

  // Fetch current user
  useEffect(() => {
    if (!queryUserId) return;
    setLoading(true);
    fetch(`/api/user?id=${encodeURIComponent(queryUserId)}`)
      .then((r) => r.json())
      .then((data) => setUserDetails({
        UserId: data._id ?? "", Firstname: data.Firstname ?? "",
        Lastname: data.Lastname ?? "", Email: data.Email ?? "",
        Role: data.Role ?? "", Department: data.Department ?? "",
        Company: data.Company ?? "", ReferenceID: data.ReferenceID ?? "",
      }))
      .catch(() => toast.error("Failed to load user data."))
      .finally(() => setLoading(false));
  }, [queryUserId]);

  // Fetch logs
  useEffect(() => {
    const fetchAllActivityLogs = async () => {
      if (!userDetails.ReferenceID && userDetails.Role === "") return;
      setLoading(true);
      try {
        let allLogs: ActivityLog[] = [];
        let page = 1;
        const limit = 100;
        let totalPages = 1;
        do {
          const params = new URLSearchParams();
          params.append("page", page.toString());
          params.append("limit", limit.toString());
          params.append("role", userDetails.Role);
          if (userDetails.Role !== "Super Admin" && userDetails.Role !== "Human Resources") {
            params.append("referenceID", userDetails.ReferenceID);
          }
          if (dateCreatedFilterRange?.from) {
            params.append("startDate", dateCreatedFilterRange.from.toISOString());
            params.append("endDate", (dateCreatedFilterRange.to ?? dateCreatedFilterRange.from).toISOString());
          }
          const res = await fetch(`/api/ModuleSales/Activity/FetchLog?${params.toString()}`);
          if (!res.ok) throw new Error("Failed to fetch logs");
          const data = await res.json();
          allLogs = allLogs.concat(data.data ?? []);
          totalPages = data.pagination?.totalPages ?? 1;
          page++;
        } while (page <= totalPages);
        setPosts(allLogs);
      } catch {
        toast.error("Error fetching activity logs.");
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAllActivityLogs();
  }, [userDetails, dateCreatedFilterRange]);

  // Fetch usersMap
  useEffect(() => {
    if (posts.length === 0) return;
    const uniqueRefs = Array.from(new Set(posts.map((p) => p.ReferenceID)));
    fetch(`/api/users?referenceIDs=${uniqueRefs.join(",")}`)
      .then((r) => r.json())
      .then((usersData) => {
        const map: Record<string, UserInfo> = {};
        usersData.forEach((u: any) => {
          map[u.ReferenceID] = {
            Firstname: u.Firstname ?? "Unknown",
            Lastname: u.Lastname ?? "",
            profilePicture: u.profilePicture ?? "",
          };
        });
        setUsersMap(map);
      })
      .catch(() => {
        const fallback: Record<string, UserInfo> = {};
        posts.forEach((p) => { fallback[p.ReferenceID] = { Firstname: "Unknown", Lastname: "" }; });
        setUsersMap(fallback);
      });
  }, [posts]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function isDateInRange(dateStr: string, range?: DateRange) {
    if (!range) return true;
    const date = new Date(dateStr);
    const from = range.from ? new Date(range.from) : null;
    let to = range.to ? new Date(range.to) : null;
    if (to) to = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    if (from && to) return date >= from && date <= to;
    if (from) return date.toDateString() === from.toDateString();
    if (to) return date.toDateString() === to.toDateString();
    return true;
  }

  function formatDate(d: string | Date) {
    const date = new Date(d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDateLabel(date: Date) {
    return `${date.getDate()} | ${date.toLocaleDateString(undefined, { weekday: "long" })}`;
  }

  function formatShortDate(date: Date) {
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  }

  function calculateTimes(logs: ActivityLog[]) {
    const loginTimes = logs.filter((l) => l.Status.toLowerCase() === "login")
      .map((l) => new Date(l.date_created)).sort((a, b) => a.getTime() - b.getTime());
    const logoutTimes = logs.filter((l) => l.Status.toLowerCase() === "logout")
      .map((l) => new Date(l.date_created)).sort((a, b) => a.getTime() - b.getTime());

    const firstLogin = loginTimes[0] ?? null;
    const lastLogout = logoutTimes[logoutTimes.length - 1] ?? null;
    if (!firstLogin) return { hours: 0, late: 0, undertime: 0, overtime: 0 };

    const shiftStart = new Date(firstLogin); shiftStart.setHours(8, 0, 0, 0);
    const shiftEnd = new Date(firstLogin); shiftEnd.setHours(18, 31, 0, 0);
    const now = new Date();
    const endTime = lastLogout && lastLogout > firstLogin ? lastLogout : now < shiftEnd ? now : shiftEnd;

    let totalMs = endTime.getTime() - firstLogin.getTime();
    const lunchStart = new Date(firstLogin); lunchStart.setHours(12, 0, 0, 0);
    const lunchEnd = new Date(firstLogin); lunchEnd.setHours(13, 0, 0, 0);
    if (firstLogin < lunchEnd && endTime > lunchStart) {
      const overlapStart = firstLogin > lunchStart ? firstLogin : lunchStart;
      const overlapEnd = endTime < lunchEnd ? endTime : lunchEnd;
      const overlapMs = overlapEnd.getTime() - overlapStart.getTime();
      if (overlapMs > 0) totalMs -= overlapMs;
    }

    const late = firstLogin > shiftStart ? (firstLogin.getTime() - shiftStart.getTime()) / 3600000 : 0;
    const undertime = endTime < shiftEnd ? (shiftEnd.getTime() - endTime.getTime()) / 3600000 : 0;
    const overtime = endTime > shiftEnd ? (endTime.getTime() - shiftEnd.getTime()) / 3600000 : 0;

    return {
      hours: +((totalMs / 3600000) || 0).toFixed(2),
      late: +late.toFixed(2),
      undertime: +undertime.toFixed(2),
      overtime: +overtime.toFixed(2),
    };
  }

  // ── Derived Data ──────────────────────────────────────────────────────────────

  const filteredPosts = userDetails.Role === "Super Admin" || userDetails.Department === "Human Resources"
    ? posts
    : posts.filter((p) => p.ReferenceID === userDetails.ReferenceID);

  const searchedPosts = filteredPosts
    .filter((post) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const u = usersMap[post.ReferenceID];
      if (!u) return false;
      return u.Firstname.toLowerCase().includes(q) || u.Lastname.toLowerCase().includes(q);
    })
    .filter((post) => isDateInRange(post.date_created, dateCreatedFilterRange));

  const dayHeaders: DailyLog[] = [];
  if (dateCreatedFilterRange?.from && dateCreatedFilterRange?.to) {
    for (let d = new Date(dateCreatedFilterRange.from); d <= dateCreatedFilterRange.to; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) continue;
      dayHeaders.push({ dateStr: formatDate(new Date(d)), label: formatDateLabel(new Date(d)) });
    }
  } else {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dayHeaders.push({ dateStr: formatDate(d), label: formatDateLabel(d) });
    }
  }

  const groupedByRefDate: Record<string, ActivityLog[]> = {};
  searchedPosts.forEach((log) => {
    const key = `${log.ReferenceID}|${formatDate(log.date_created)}`;
    if (!groupedByRefDate[key]) groupedByRefDate[key] = [];
    groupedByRefDate[key].push(log);
  });

  const weeklyData: Record<string, WeeklyLog & Record<string, number>> = {};
  Object.entries(groupedByRefDate).forEach(([key, logs]) => {
    const [ref, dateKey] = key.split("|");
    if (!weeklyData[ref]) {
      weeklyData[ref] = { late: 0, undertime: 0, overtime: 0 };
      dayHeaders.forEach(({ dateStr }) => { weeklyData[ref][dateStr] = 0; });
    }
    const result = calculateTimes(logs);
    weeklyData[ref][dateKey] = result.hours;
    weeklyData[ref].late += result.late;
    weeklyData[ref].undertime += result.undertime;
    weeklyData[ref].overtime += result.overtime;
  });

  const visibleRows = Object.entries(weeklyData).filter(([_, week]) => {
    const totalHours = dayHeaders.reduce((s, { dateStr }) => s + (week[dateStr] ?? 0), 0);
    return totalHours > 0 || week.late + week.undertime + week.overtime > 0;
  });

  function getComputationDetails(ref: string) {
    const week = weeklyData[ref];
    if (!week) return null;
    const u = usersMap[ref];
    const name = u ? `${u.Firstname} ${u.Lastname}` : ref;
    return { name, week, dayHeaders };
  }

  async function exportToExcel() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Timesheet");
    sheet.addRow(["Name", ...dayHeaders.map((d) => d.label), "Total Hours", "Total Late", "Total Undertime", "Total Overtime"]);
    visibleRows.forEach(([ref, week]) => {
      const u = usersMap[ref];
      const name = u ? `${u.Firstname} ${u.Lastname}` : ref;
      const total = dayHeaders.reduce((s, { dateStr }) => s + (week[dateStr] ?? 0), 0);
      sheet.addRow([name, ...dayHeaders.map(({ dateStr }) => week[dateStr] ? week[dateStr].toFixed(2) : "-"), total.toFixed(2), week.late.toFixed(2), week.undertime.toFixed(2), week.overtime.toFixed(2)]);
    });
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "timesheet.xlsx");
  }

  const summaryStats = visibleRows.reduce((acc, [_, week]) => {
    acc.totalHours += dayHeaders.reduce((s, { dateStr }) => s + (week[dateStr] ?? 0), 0);
    acc.totalLate += week.late;
    acc.totalUndertime += week.undertime;
    acc.totalOvertime += week.overtime;
    return acc;
  }, { totalHours: 0, totalLate: 0, totalUndertime: 0, totalOvertime: 0 });

  const details = selectedRef ? getComputationDetails(selectedRef) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F9F6F4]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 flex items-center justify-between px-4 h-14 gap-3">
        <div className="flex items-center gap-3">

          {/* Back button */}
          <button
            onClick={handleBack}
            className="w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-[#CC1318] transition-all active:scale-95"
            title="Back to Activity Planner"
          >
            <ArrowLeft size={14} />
          </button>

          <div className="h-4 w-px bg-gray-200" />

          <div>
            <p className="text-xs font-semibold text-[#CC1318] uppercase tracking-wider">Timesheet</p>
            <p className="text-[11px] text-gray-400">
              {dateCreatedFilterRange?.from
                ? `${formatShortDate(new Date(dateCreatedFilterRange.from))}${dateCreatedFilterRange.to ? ` – ${formatShortDate(new Date(dateCreatedFilterRange.to))}` : ""}`
                : "Current Week"}
            </p>
          </div>
        </div>

        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 bg-[#CC1318] text-white px-4 py-2 rounded-2xl text-[12px] font-semibold hover:bg-[#A8100F] transition-all shadow-md shadow-red-100 active:scale-[0.97]"
        >
          <DownloadCloud size={14} />
          <span className="hidden sm:inline">Export</span>
        </button>
      </header>

      <main className="p-4">

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Hours", value: summaryStats.totalHours.toFixed(1), icon: <Clock size={15} />, color: "#185FA5", bg: "#E6F1FB" },
            { label: "Total Late", value: summaryStats.totalLate.toFixed(1) + "h", icon: <AlertCircle size={15} />, color: "#CC1318", bg: "#FEF0F0" },
            { label: "Undertime", value: summaryStats.totalUndertime.toFixed(1) + "h", icon: <ArrowDownLeft size={15} />, color: "#A0611A", bg: "#FDF4E7" },
            { label: "Overtime", value: summaryStats.totalOvertime.toFixed(1) + "h", icon: <ArrowUpRight size={15} />, color: "#1A7A4A", bg: "#EEF7F2" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="w-7 h-7 rounded-[9px] flex items-center justify-center mb-2.5 flex-shrink-0" style={{ background: s.bg, color: s.color }}>
                {s.icon}
              </div>
              <p className="text-[20px] font-semibold text-gray-900 leading-tight">{s.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Search ── */}
        <div className="mb-4 relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-[13px] outline-none focus:border-[#CC1318] focus:ring-2 focus:ring-[#CC1318]/10 transition-all"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-200 border-t-[#CC1318] rounded-full animate-spin" />
          )}
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-gray-800">Timesheet Summary</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {visibleRows.length} employee{visibleRows.length !== 1 ? "s" : ""} · {dayHeaders.length} day{dayHeaders.length !== 1 ? "s" : ""}
              </p>
            </div>
            <span className="text-[11px] font-semibold text-[#CC1318] bg-[#FEF0F0] rounded-full px-3 py-1">
              {dateCreatedFilterRange ? "Filtered" : "Current Week"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-white z-10 min-w-[160px]">
                    Employee
                  </th>
                  {dayHeaders.map(({ label, dateStr }) => (
                    <th key={dateStr} className="text-center px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap min-w-[80px]">
                      {label}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Total Hrs</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-[#CC1318] uppercase tracking-wider whitespace-nowrap">Late</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-[#A0611A] uppercase tracking-wider whitespace-nowrap">Undertime</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-[#1A7A4A] uppercase tracking-wider whitespace-nowrap">Overtime</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={7 + dayHeaders.length} className="text-center py-16 text-[12px] text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
                          <Clock size={18} className="text-gray-300" />
                        </div>
                        No timesheet records found.
                      </div>
                    </td>
                  </tr>
                )}

                {visibleRows.map(([ref, week], idx) => {
                  const u = usersMap[ref];
                  const name = u ? `${u.Firstname} ${u.Lastname}` : ref;
                  const total = dayHeaders.reduce((s, { dateStr }) => s + (week[dateStr] ?? 0), 0);
                  const initials = u ? `${u.Firstname[0]}${u.Lastname[0]}`.toUpperCase() : "?";

                  return (
                    <tr key={ref} className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                      {/* Name cell */}
                      <td className="px-5 py-3 whitespace-nowrap sticky left-0 bg-inherit z-10">
                        <div className="flex items-center gap-2.5">
                          {u?.profilePicture ? (
                            <img src={u.profilePicture} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[#FEF0F0] flex items-center justify-center text-[10px] font-bold text-[#CC1318] flex-shrink-0">
                              {initials}
                            </div>
                          )}
                          <span className="font-semibold text-gray-800 capitalize truncate max-w-[120px]">{name}</span>
                          <button
                            onClick={() => setSelectedRef(ref)}
                            className="flex-shrink-0 w-5 h-5 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-[#FEF0F0] hover:text-[#CC1318] transition-colors"
                            title="View breakdown"
                          >
                            <Info size={11} />
                          </button>
                        </div>
                      </td>

                      {/* Daily hours */}
                      {dayHeaders.map(({ dateStr }) => {
                        const hrs = week[dateStr];
                        return (
                          <td key={dateStr} className="text-center px-3 py-3 font-mono whitespace-nowrap">
                            {hrs > 0 ? (
                              <span className="inline-flex items-center justify-center w-12 h-6 rounded-lg bg-[#E6F1FB] text-[#185FA5] text-[11px] font-semibold">
                                {hrs.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Total */}
                      <td className="text-right px-4 py-3 whitespace-nowrap">
                        <span className="font-bold text-gray-900 font-mono">{total.toFixed(2)}</span>
                      </td>

                      {/* Late */}
                      <td className="text-right px-4 py-3 whitespace-nowrap">
                        {week.late > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-xl bg-[#FEF0F0] text-[#CC1318] px-2.5 py-0.5 text-[11px] font-semibold">
                            {week.late.toFixed(2)}h
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Undertime */}
                      <td className="text-right px-4 py-3 whitespace-nowrap">
                        {week.undertime > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-xl bg-[#FDF4E7] text-[#A0611A] px-2.5 py-0.5 text-[11px] font-semibold">
                            {week.undertime.toFixed(2)}h
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Overtime */}
                      <td className="text-right px-4 py-3 whitespace-nowrap">
                        {week.overtime > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-xl bg-[#EEF7F2] text-[#1A7A4A] px-2.5 py-0.5 text-[11px] font-semibold">
                            {week.overtime.toFixed(2)}h
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── Computation Details Dialog ── */}
      {selectedRef && details && (
        <Dialog open={true} onOpenChange={() => setSelectedRef(null)}>
          <DialogContent className="p-0 rounded-[28px] max-w-sm w-full border-0 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-[#CC1318] px-6 pt-5 pb-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-[14px]">
                  {details.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <DialogTitle className="text-white font-semibold text-[15px] leading-tight">{details.name}</DialogTitle>
                  <p className="text-white/65 text-[11px] mt-0.5">Computation Breakdown</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Late", value: details.week.late.toFixed(2) + "h", color: "text-red-200" },
                  { label: "Undertime", value: details.week.undertime.toFixed(2) + "h", color: "text-amber-200" },
                  { label: "Overtime", value: details.week.overtime.toFixed(2) + "h", color: "text-green-200" },
                ].map((s) => (
                  <div key={s.label} className="bg-white/15 rounded-2xl px-3 py-2.5 text-center">
                    <p className={`text-[14px] font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-white/60 text-[10px] mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily breakdown */}
            <div className="bg-[#F9F6F4] px-5 py-4 max-h-80 overflow-y-auto">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Daily Hours</p>
              <div className="flex flex-col gap-2">
                {details.dayHeaders.map(({ dateStr, label }: DailyLog) => {
                  const hrs = details.week[dateStr] ?? 0;
                  return (
                    <div key={dateStr} className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3">
                      <span className="text-[12px] text-gray-600 font-medium">{label}</span>
                      {hrs > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-xl bg-[#E6F1FB] text-[#185FA5] px-3 py-1 text-[12px] font-bold">
                          {hrs.toFixed(2)}h
                        </span>
                      ) : (
                        <span className="text-[12px] text-gray-300 font-medium">No data</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Close */}
            <div className="bg-white px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setSelectedRef(null)}
                className="w-full rounded-2xl py-3 bg-[#CC1318] text-white font-semibold text-[14px] hover:bg-[#A8100F] transition-colors active:scale-[0.98]"
              >
                Close
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Root Export ───────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <ProtectedPageWrapper>
      <UserProvider>
        <FormatProvider>
          <TimesheetPage />
        </FormatProvider>
      </UserProvider>
    </ProtectedPageWrapper>
  );
}