"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { FormatProvider } from "@/contexts/FormatContext";
import ActivityDialog from "@/components/dashboard-dialog";
import CreateAttendance from "@/components/CreateAttendance";
import CreateSalesAttendance from "@/components/CreateSalesAttenance";
import Camera from "@/components/camera";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ProtectedPageWrapper from "@/components/protected-page-wrapper";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { toast } from "sonner";
import { type DateRange } from "react-day-picker";
import {
  MapPin, X, CalendarCheck, ChevronLeft, ChevronRight,
  MapPinCheck, Building2, Home, BarChart3, User,
  LogIn, LogOut, TrendingUp, Plus, FileSpreadsheet, CalendarIcon, Clock,
  ChevronRight as ArrowRight, Power, Cloud, Sun, CloudRain, CloudLightning, Wind, Info
} from "lucide-react";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import OfflineBanner from "@/components/OfflineBanner";


// ── Weather Component ────────────────────────────────────────────────────────

function WeatherDisplay() {
  const [weather, setWeather] = useState<{ temp: number; icon: string; description: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        // Using OpenWeatherMap (You might need to replace with your API key if this is a real production app)
        // For now, I'll use a public-ish one or mock it slightly for safety, but let's try a real fetch.
        const API_KEY = "bd5e378503939ddaee76f12ad7a97608"; // Common public key for testing, or use a better one
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
        const data = await res.json();
        if (data.main) {
          setWeather({
            temp: Math.round(data.main.temp),
            icon: data.weather[0].icon,
            description: data.weather[0].description
          });
        }
      } catch (err) {
        console.error("Weather fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      () => setLoading(false)
    );
  }, []);

  if (loading || !weather) return null;

  const WeatherIcon = () => {
    const code = weather.icon;
    if (code.includes("01")) return <Sun size={14} className="text-yellow-400" />;
    if (code.includes("02") || code.includes("03") || code.includes("04")) return <Cloud size={14} className="text-gray-400" />;
    if (code.includes("09") || code.includes("10")) return <CloudRain size={14} className="text-blue-400" />;
    if (code.includes("11")) return <CloudLightning size={14} className="text-purple-400" />;
    return <Cloud size={14} className="text-gray-400" />;
  };

  return (
    <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md rounded-full px-2.5 py-1 border border-white/10 shadow-sm">
      <WeatherIcon />
      <span className="text-[11px] font-bold text-white">{weather.temp}°C</span>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

type ActiveTab = "home" | "calendar" | "reports" | "profile";

type TimelineItem = {
  id: string;
  title?: string | null;
  description: string;
  location: string;
  status: string;
  date?: string;
};

interface ActivityLog {
  ReferenceID: string;
  Email: string;
  Type: string;
  Status: string;
  Location: string;
  date_created: string;
  PhotoURL?: string;
  Remarks: string;
  TSM: string;
  SiteVisitAccount: string;
  _id?: string;
}

interface UserInfo {
  Firstname: string;
  Lastname: string;
  profilePicture?: string;
  faceDescriptors?: number[][];
  TSM: string;
  Directories: string[];
}

interface UserDetails {
  UserId: string;
  Firstname: string;
  Lastname: string;
  Email: string;
  Role: string;
  Department: string;
  Company?: string;
  ReferenceID: string;
  profilePicture?: string;
  faceDescriptors?: number[][];
  TSM: string;
  Directories?: string[];
}

interface FormData {
  ReferenceID: string;
  Email: string;
  Type: string;
  Status: string;
  PhotoURL: string;
  Remarks: string;
  TSM: string;
  SitePhotoURL?: string;
  SiteVisitAccount?: string;
  _id?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDateKey(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  // If before 8:00 AM, it belongs to the previous work day
  if (d.getHours() < 8) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateCalendarDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstWeekday = firstDayOfMonth.getDay();
  for (let i = firstWeekday - 1; i >= 0; i--) days.push(new Date(year, month, 1 - i - 1));
  for (let day = 1; day <= lastDayOfMonth.getDate(); day++) days.push(new Date(year, month, day));
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month, lastDayOfMonth.getDate() + (days.length - firstWeekday) + 1));
  }
  return days;
}

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// ── Live Clock ────────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{time}</span>;
}

// ── Timeline Item ─────────────────────────────────────────────────────────────

function TimelineItemComponent({ item, index }: { item: TimelineItem; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const isLogin = item.status === "Login";
  const iconColor = isLogin ? "#1A7A4A" : "#CC1318";
  const bgColor = isLogin ? "#EEF7F2" : "#FEF0F0";

  return (
    <div ref={ref} className="relative flex gap-3">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={inView ? { scale: 1, opacity: 1 } : undefined}
        transition={{ delay: index * 0.12, duration: 0.25 }}
        className="flex-shrink-0 flex flex-col items-center"
      >
        <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: bgColor }}>
          {isLogin ? <LogIn size={12} style={{ color: iconColor }} /> :
            item.status === "Logout" ? <LogOut size={12} style={{ color: iconColor }} /> :
              <Building2 size={12} style={{ color: "#A0611A" }} />}
        </div>
        <div className="w-px flex-1 mt-1 min-h-[12px]" style={{ background: "#EDE5E1" }} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={inView ? { opacity: 1, x: 0 } : undefined}
        transition={{ delay: index * 0.12 + 0.15, type: "spring", stiffness: 300, damping: 25 }}
        className="flex-1 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 mb-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: iconColor }}>
            {item.status}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">
            {item.date}
          </span>
        </div>
        {item.title && item.title.trim() !== "" && item.title !== "Unknown Client" && (
          <p className="mt-0.5 text-[12px] font-semibold text-gray-800">
            {item.status === "Login" || item.status === "Logout" ? item.status : `Visited: ${item.title}`}
          </p>
        )}
        <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">{item.location}</p>
        {item.description && item.description !== "No remarks" && (
          <p className="mt-0.5 text-[10px] text-gray-400 italic">"{item.description}"</p>
        )}
      </motion.div>
    </div>
  );
}

// ── Timesheet Nav Card ────────────────────────────────────────────────────────

function TimesheetNavCard({ userId }: { userId: string | null | undefined }) {
  const router = useRouter();
  const href = `/time-attendance/timesheet${userId ? `?id=${encodeURIComponent(userId)}` : ""}`;
  return (
    <button
      onClick={() => router.push(href)}
      className="w-full flex items-center gap-4 bg-white rounded-2xl border border-gray-100 px-4 py-4 text-left hover:border-[#CC1318]/30 hover:bg-[#FFF8F8] active:scale-[0.98] transition-all group shadow-sm"
    >
      <div className="w-11 h-11 rounded-[14px] bg-[#FEF0F0] flex items-center justify-center flex-shrink-0 group-hover:bg-[#CC1318] transition-colors">
        <FileSpreadsheet size={20} className="text-[#CC1318] group-hover:text-white transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-800">Timesheet</p>
        <p className="text-[11px] text-gray-400 mt-0.5">View hours, late, undertime & overtime</p>
      </div>
      <div className="w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#CC1318] transition-colors">
        <ArrowRight size={13} className="text-gray-400 group-hover:text-white transition-colors" />
      </div>
    </button>
  );
}

// ── Home Tab ──────────────────────────────────────────────────────────────────

function HomeTab({
  userDetails, todayLogs, monthlyStats, onCreateAttendance, onCreateSiteVisit, onSetTab,
}: {
  userDetails: UserDetails | null;
  todayLogs: ActivityLog[];
  monthlyStats: { present: number; absent: number; visits: number; total: number };
  onCreateAttendance: () => void;
  onCreateSiteVisit: () => void;
  onSetTab: (tab: ActiveTab) => void;
}) {
  const today = new Date();
  const greeting = today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening";
  const presentRate = monthlyStats.total > 0 ? Math.round((monthlyStats.present / monthlyStats.total) * 100) : 0;
  const initials = userDetails ? `${userDetails.Firstname[0] ?? ""}${userDetails.Lastname[0] ?? ""}`.toUpperCase() : "?";

  return (
    <div className="flex flex-col min-h-full">
      <div className="relative px-5 pt-12 pb-8 overflow-hidden flex-shrink-0" style={{ background: "linear-gradient(145deg,#CC1318 0%,#8B0E12 100%)" }}>
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-16 -left-6 w-52 h-52 rounded-full bg-white/[0.03] pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="8" width="14" height="2" rx="1" fill="white" />
                  <rect x="2" y="4" width="9" height="2" rx="1" fill="white" />
                  <rect x="2" y="12" width="11" height="2" rx="1" fill="white" />
                </svg>
              </div>
              <span className="text-white text-[14px] font-black tracking-[0.1em]">ACCULOG</span>
            </div>
            <div className="flex items-center gap-3">
              <WeatherDisplay />
              {userDetails?.profilePicture ? (
                <img src={userDetails.profilePicture} alt="" className="w-9 h-9 rounded-full border-2 border-white/30 object-cover shadow-sm" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-white text-sm font-bold backdrop-blur-sm">{initials}</div>
              )}
            </div>
          </div>
          <p className="text-white/70 text-xs mb-1">{greeting} 👋</p>
          <h1 className="text-white uppercase text-xl font-semibold mb-0.5">{userDetails ? `${userDetails.Firstname} ${userDetails.Lastname}` : "Loading..."}</h1>
          <p className="text-white/60 text-[12px] uppercase">{userDetails?.Role ?? "—"} · {userDetails?.Department ?? "—"}</p>
        </div>
      </div>

      <div className="mx-4 -mt-5 relative z-20 flex-shrink-0">
        <div className="bg-white rounded-[22px] shadow-lg shadow-gray-200/80 border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Current Status</span>
            <span className="flex items-center gap-1.5 bg-[#EEF7F2] rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A7A4A] animate-pulse" />
              <span className="text-[11px] font-semibold text-[#1A7A4A]">Active</span>
            </span>
          </div>
          <div className="flex items-end justify-between">
            <div className="flex flex-col">
              <div className="text-[32px] font-bold text-gray-900 tracking-tighter leading-none tabular-nums flex items-center gap-2">
                <LiveClock />
              </div>
              <p className="text-[11px] font-medium text-gray-400 mt-1 flex items-center gap-1.5">
                <CalendarIcon size={12} />
                {today.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <div className="h-12 w-px bg-gray-100" />
            <div className="text-right">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Work Shift</p>
              <div className="flex items-center gap-1.5 justify-end">
                <Clock size={14} className="text-[#CC1318]" />
                <p className="text-[15px] font-bold text-gray-800">08:00 – 17:00</p>
              </div>
              <span className="inline-flex items-center gap-1.5 mt-2 bg-[#EEF7F2] border border-green-100 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1A7A4A] animate-pulse" />
                <span className="text-[10px] font-bold text-[#1A7A4A] uppercase tracking-wider">On Schedule</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 scroll-smooth">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {userDetails?.Directories?.includes("Acculog:Button - Client Visit") && (
            <button onClick={onCreateAttendance} className="bg-[#CC1318] rounded-[18px] p-4 text-left hover:bg-[#A8100F] active:scale-[0.97] transition-all shadow-md shadow-red-200">
              <div className="w-9 h-9 rounded-[10px] bg-white/20 flex items-center justify-center mb-3"><CalendarCheck size={18} className="text-white" /></div>
              <p className="text-white text-[13px] font-semibold">Time In/Out</p>
              <p className="text-white/65 text-[11px] mt-0.5">Log field attendance</p>
            </button>
          )}
          {userDetails?.Directories?.includes("Acculog:Button - Site Visit") && (
            <button onClick={onCreateSiteVisit} className="bg-white rounded-[18px] p-4 text-left border border-gray-100 hover:border-gray-200 hover:bg-gray-50 active:scale-[0.97] transition-all">
              <div className="w-9 h-9 rounded-[10px] bg-[#FFF0F0] flex items-center justify-center mb-3 border border-gray-100"><Building2 size={18} className="text-[#CC1318]" /></div>
              <p className="text-gray-800 text-[13px] font-semibold">Site Visit</p>
              <p className="text-gray-400 text-[11px] mt-0.5">Record client visit</p>
            </button>
          )}
          <button onClick={() => onSetTab("calendar")} className="bg-white rounded-[18px] p-4 text-left border border-gray-100 hover:border-gray-200 hover:bg-gray-50 active:scale-[0.97] transition-all">
            <div className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center mb-3 border border-gray-100"><CalendarCheck size={18} className="text-gray-500" /></div>
            <p className="text-gray-800 text-[13px] font-semibold">Calendar</p>
            <p className="text-gray-400 text-[11px] mt-0.5">View monthly logs</p>
          </button>
          <button onClick={() => onSetTab("reports")} className="bg-white rounded-[18px] p-4 text-left border border-gray-100 hover:border-gray-200 hover:bg-gray-50 active:scale-[0.97] transition-all">
            <div className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center mb-3 border border-gray-100"><BarChart3 size={18} className="text-gray-500" /></div>
            <p className="text-gray-800 text-[13px] font-semibold">Reports</p>
            <p className="text-gray-400 text-[11px] mt-0.5">Attendance summary</p>
          </button>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-gray-500">Monthly Attendance</p>
            <p className="text-[11px] font-bold text-gray-800">{monthlyStats.present} / {monthlyStats.total} days</p>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${presentRate}%`, background: "linear-gradient(90deg,#CC1318,#C8A96E)" }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{presentRate}% attendance rate this month</p>
        </div>

        {/*<div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Today's Log</p>
          {todayLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-6 text-center">
              <p className="text-[12px] text-gray-400">No activity recorded today.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              {todayLogs.map((log) => {
                const isLogin = log.Status === "Login";
                return (
                  <div key={log._id ?? log.date_created} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                    <div className={`w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0 ${isLogin ? "bg-[#EEF7F2]" : log.Type === "Client Visit" ? "bg-[#FDF4E7]" : "bg-[#FEF0F0]"}`}>
                      {isLogin ? <LogIn size={15} className="text-[#1A7A4A]" /> : log.Type === "Client Visit" ? <Building2 size={15} className="text-[#A0611A]" /> : <LogOut size={15} className="text-[#CC1318]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800 truncate">{log.Status} – {log.Type}</p>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{log.Location || "—"}</p>
                    </div>
                    <p className="text-[11px] font-semibold text-gray-500 flex-shrink-0">
                      {new Date(log.date_created).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>*/}
      </div>
    </div>
  );
}

// ── Calendar Tab ──────────────────────────────────────────────────────────────

function CalendarTab({ currentMonth, calendarDays, groupedByDate, usersMap, monthlyStats, allLogs, onEventClick, goToPrevMonth, goToNextMonth }: {
  currentMonth: Date; calendarDays: Date[];
  groupedByDate: Record<string, ActivityLog[]>; usersMap: Record<string, UserInfo>;
  monthlyStats: { present: number; absent: number; visits: number; total: number };
  allLogs: ActivityLog[]; onEventClick: (log: ActivityLog) => void;
  goToPrevMonth: () => void; goToNextMonth: () => void;
}) {
  const today = new Date();
  const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];
  const [activeFilter, setActiveFilter] = useState<"All" | "Login" | "Logout" | "Site Visit">("All");
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateKey(today));

  const filteredLogs = useMemo(() => {
    let logs = allLogs;

    // Filter by selected date
    if (selectedDate) {
      logs = logs.filter(l => toLocalDateKey(l.date_created) === selectedDate);
    }

    if (activeFilter === "All") return logs;
    if (activeFilter === "Login") return logs.filter((l) => l.Status === "Login");
    if (activeFilter === "Logout") return logs.filter((l) => l.Status === "Logout");
    return logs.filter((l) => l.Type === "Client Visit");
  }, [allLogs, activeFilter, selectedDate]);

  const presentRate = monthlyStats.total > 0 ? Math.round((monthlyStats.present / monthlyStats.total) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 pt-12 pb-5 flex-shrink-0" style={{ background: "linear-gradient(145deg,#CC1318 0%,#8B0E12 100%)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white text-[17px] font-semibold">{currentMonth.toLocaleDateString("en-PH", { month: "long" })}</p>
            <p className="text-white/60 text-[12px]">Activity Calendar · {currentMonth.getFullYear()}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goToPrevMonth} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"><ChevronLeft size={14} /></button>
            <button onClick={goToNextMonth} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="flex gap-4">
          {[{ label: "Present", value: monthlyStats.present }, { label: "Absent", value: monthlyStats.absent }, { label: "Visits", value: monthlyStats.visits }, { label: "Rate", value: `${presentRate}%` }].map((s) => (
            <div key={s.label} className="flex-1 text-center">
              <p className="text-white text-[20px] font-semibold leading-tight">{s.value}</p>
              <p className="text-white/60 text-[9px] uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pt-4 pb-28">
        <div className="bg-white mx-4 rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAY_NAMES.map((d, i) => <div key={i} className="text-center py-2.5 text-[10px] font-semibold text-gray-400 uppercase">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((date, idx) => {
              const dateKey = toLocalDateKey(date);
              const logs = groupedByDate[dateKey] || [];
              const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
              const isToday = isSameDay(date, today);
              const isSelected = selectedDate === dateKey;
              const hasLogin = logs.some((l) => l.Status === "Login");
              const hasLogout = logs.some((l) => l.Status === "Logout");

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(dateKey)}
                  className={[
                    "aspect-square flex flex-col items-center justify-start pt-1.5 pb-1 transition-all active:scale-95",
                    isToday ? "ring-2 ring-inset ring-[#CC1318]" : "",
                    isSelected ? "bg-[#FFF0F0]" : "",
                    isCurrentMonth ? "" : "opacity-30"
                  ].join(" ")}
                >
                  <span className={[
                    "text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-lg transition-colors",
                    isToday ? "bg-[#CC1318] text-white" : isSelected ? "text-[#CC1318]" : "text-gray-700"
                  ].join(" ")}>{date.getDate()}</span>
                  {(hasLogin || hasLogout) && (
                    <div className="flex gap-0.5 mt-0.5">
                      {hasLogin && <span className="w-1 h-1 rounded-full bg-[#1A7A4A]" />}
                      {hasLogout && <span className="w-1 h-1 rounded-full bg-[#CC1318]" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-4 px-5 mt-3 mb-4">
          {[{ color: "#1A7A4A", label: "Login" }, { color: "#CC1318", label: "Logout" }, { color: "#CC1318", label: "Selected", rounded: true }].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 flex-shrink-0 ${l.rounded ? "rounded-sm" : "rounded-full"}`} style={{ background: l.color }} />
              <span className="text-[11px] text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="px-5 mb-3 flex items-center justify-between">
          <p className="text-[13px] font-bold text-gray-800">
            Activities for {new Date(selectedDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          {filteredLogs.length > 0 && (
            <span className="text-[10px] font-semibold text-[#CC1318] bg-[#FEF0F0] px-2 py-0.5 rounded-full">
              {filteredLogs.length} record{filteredLogs.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex gap-2 px-4 mb-4 overflow-x-auto">
          {(["All", "Login", "Logout", "Site Visit"] as const).map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)} className={["flex-shrink-0 px-4 py-2 rounded-full text-[12px] font-semibold transition-all border", activeFilter === f ? "bg-[#CC1318] text-white border-[#CC1318] shadow-md shadow-red-100" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"].join(" ")}>{f}</button>
          ))}
        </div>
        <div className="px-4 flex flex-col gap-3">
          {filteredLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-8 text-center flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
                <CalendarCheck size={20} />
              </div>
              <p className="text-[12px] text-gray-400">No activity recorded for this date.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const user = usersMap[log.ReferenceID];
              const isLogin = log.Status === "Login";
              return (
                <button key={log._id ?? log.date_created} onClick={() => onEventClick(log)} className="w-full bg-white rounded-2xl border border-gray-100 p-4 text-left hover:border-gray-200 hover:bg-gray-50 transition-all active:scale-[0.98] shadow-sm flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0 ${isLogin ? "bg-[#EEF7F2]" : log.Type === "Client Visit" ? "bg-[#FDF4E7]" : "bg-[#FEF0F0]"}`}>
                      {isLogin ? <LogIn size={18} className="text-[#1A7A4A]" /> : log.Type === "Client Visit" ? <Building2 size={18} className="text-[#A0611A]" /> : <LogOut size={18} className="text-[#CC1318]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-gray-800">{log.Status} – {log.Type}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{user ? `${user.Firstname} ${user.Lastname}` : log.Email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[13px] font-bold text-gray-700 tabular-nums">{new Date(log.date_created).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-gray-50 pt-3">
                    <div className="flex items-start gap-2">
                      <MapPin size={12} className="text-gray-400 mt-0.5" />
                      <p className="text-[11px] text-gray-500 leading-snug">{log.Location || "No location captured"}</p>
                    </div>

                    {log.Type === "Client Visit" && log.SiteVisitAccount && (
                      <div className="flex items-start gap-2">
                        <Building2 size={12} className="text-gray-400 mt-0.5" />
                        <p className="text-[11px] text-gray-600 font-semibold italic">Client: {log.SiteVisitAccount}</p>
                      </div>
                    )}

                    <div className="flex items-start gap-2">
                      <Info size={12} className="text-gray-400 mt-0.5" />
                      <p className="text-[11px] text-gray-400 italic">
                        {log.Remarks && log.Remarks !== "No remarks" ? `"${log.Remarks}"` : "No remarks added"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

function ReportsTab({ monthlyStats, allLogs, userId }: {
  monthlyStats: { present: number; absent: number; visits: number; total: number };
  allLogs: ActivityLog[];
  userId: string | null | undefined;
}) {
  const presentRate = monthlyStats.total > 0 ? Math.round((monthlyStats.present / monthlyStats.total) * 100) : 0;
  const loginCount = allLogs.filter((l) => l.Status === "Login").length;
  const logoutCount = allLogs.filter((l) => l.Status === "Logout").length;
  const visitCount = allLogs.filter((l) => l.Type === "Client Visit").length;

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 pt-12 pb-6 flex-shrink-0" style={{ background: "linear-gradient(145deg,#CC1318 0%,#8B0E12 100%)" }}>
        <p className="text-white/65 text-[12px] mb-1">Monthly Overview</p>
        <h2 className="text-white text-[20px] font-semibold">Attendance Reports</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-28">
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { label: "Present Days", value: monthlyStats.present, icon: <CalendarCheck size={16} />, color: "#1A7A4A", bg: "#EEF7F2" },
            { label: "Absent Days", value: monthlyStats.absent, icon: <X size={16} />, color: "#CC1318", bg: "#FEF0F0" },
            { label: "Site Visits", value: monthlyStats.visits, icon: <Building2 size={16} />, color: "#A0611A", bg: "#FDF4E7" },
            { label: "Attendance Rate", value: `${presentRate}%`, icon: <TrendingUp size={16} />, color: "#185FA5", bg: "#E6F1FB" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center mb-3" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
              <p className="text-[22px] font-semibold text-gray-900">{s.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Activity Breakdown</p>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5">
          {[
            { label: "Login Records", value: loginCount, color: "#1A7A4A" },
            { label: "Logout Records", value: logoutCount, color: "#CC1318" },
            { label: "Client Visits", value: visitCount, color: "#A0611A" },
          ].map((row, i) => (
            <div key={row.label} className={`flex items-center justify-between px-4 py-3 ${i < 2 ? "border-b border-gray-50" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                <span className="text-[13px] text-gray-700 font-medium">{row.label}</span>
              </div>
              <span className="text-[13px] font-bold" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Tools</p>
        <TimesheetNavCard userId={userId} />
      </div>
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({
  userDetails,
  userId,
  onLogout,
  onFaceRegister,
}: {
  userDetails: UserDetails | null;
  userId: string | null | undefined;
  onLogout: () => void;
  onFaceRegister: () => void;
}) {
  const initials = userDetails
    ? `${userDetails.Firstname[0] ?? ""}${userDetails.Lastname[0] ?? ""}`.toUpperCase()
    : "?";

  const fields = userDetails ? [
    { label: "Email", value: userDetails.Email },
    { label: "Role", value: userDetails.Role },
    { label: "Department", value: userDetails.Department },
    { label: "Company", value: userDetails.Company ?? "—" },
    { label: "Reference ID", value: userDetails.ReferenceID },
    { label: "Biometrics", value: userDetails.faceDescriptors ? "Registered" : "Not Registered" },
  ] : [];

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div
        className="px-5 pt-12 pb-10 flex-shrink-0 flex flex-col items-center"
        style={{ background: "linear-gradient(145deg,#CC1318 0%,#8B0E12 100%)" }}
      >
        {userDetails?.profilePicture ? (
          <img src={userDetails.profilePicture} alt="" className="w-20 h-20 rounded-full border-4 border-white/30 object-cover mb-3" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/30 flex items-center justify-center text-white text-2xl font-bold mb-3">
            {initials}
          </div>
        )}
        <h2 className="text-white text-[18px] font-semibold">
          {userDetails ? `${userDetails.Firstname} ${userDetails.Lastname}` : "Loading..."}
        </h2>
        <p className="text-white/65 text-[12px] mt-1">{userDetails?.Role ?? "—"}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-28">
        {/* User info */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5">
          {fields.map((f, i) => (
            <div key={f.label} className={`flex items-center justify-between px-4 py-3.5 ${i < fields.length - 1 ? "border-b border-gray-50" : ""}`}>
              <span className="text-[12px] font-semibold text-gray-400">{f.label}</span>
              <span className={`text-[13px] font-medium text-right max-w-[60%] truncate ${f.label === "Biometrics" && f.value === "Not Registered" ? "text-red-500" : "text-gray-800"}`}>{f.value}</span>
            </div>
          ))}
        </div>

        {/* Quick Links */}
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Settings & Security</p>
        <div className="flex flex-col gap-3 mb-5">
          <button
            onClick={onFaceRegister}
            className="w-full flex items-center gap-4 bg-white rounded-2xl border border-gray-100 px-4 py-4 text-left hover:border-[#CC1318]/30 hover:bg-[#FFF8F8] active:scale-[0.98] transition-all group shadow-sm"
          >
            <div className="w-11 h-11 rounded-[14px] bg-[#FEF0F0] flex items-center justify-center flex-shrink-0 group-hover:bg-[#CC1318] transition-colors">
              <User size={20} className="text-[#CC1318] group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-800">Face Registration</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{userDetails?.faceDescriptors ? "Update your biometric data" : "Register your face for verification"}</p>
            </div>
            <div className="w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#CC1318] transition-colors">
              <ArrowRight size={13} className="text-gray-400 group-hover:text-white transition-colors" />
            </div>
          </button>

          <TimesheetNavCard userId={userId} />
        </div>

        {/* ── Logout ── */}
        <div className="mt-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Account</p>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-4 bg-white rounded-2xl border border-gray-100 px-4 py-4 text-left hover:border-red-200 hover:bg-[#FFF8F8] active:scale-[0.98] transition-all group"
          >
            <div className="w-11 h-11 rounded-[14px] bg-[#FEF0F0] flex items-center justify-center flex-shrink-0 group-hover:bg-[#CC1318] transition-colors">
              <Power size={18} className="text-[#CC1318] group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#CC1318]">Log Out</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Sign out of your account</p>
            </div>
            <div className="w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#CC1318] transition-colors">
              <ArrowRight size={13} className="text-gray-400 group-hover:text-white transition-colors" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ActivityPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userId, setUserId } = useUser();
  const queryUserId = searchParams?.get("id") ?? "";

  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [posts, setPosts] = useState<ActivityLog[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateCreatedFilterRange] = useState<DateRange | undefined>(undefined);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [selectedEvent, setSelectedEvent] = useState<ActivityLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createAttendanceOpen, setCreateAttendanceOpen] = useState(false);
  const [createSalesAttendanceOpen, setCreateSalesAttendanceOpen] = useState(false);
  const [faceRegisterOpen, setFaceRegisterOpen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);


  const [formData, setFormData] = useState<FormData>({
    ReferenceID: "", Email: "", Type: "", Status: "", PhotoURL: "", Remarks: "", TSM: "",
  });



  const today = new Date();

  // ── Logout ── matches nav-user.tsx logic exactly
  const handleLogout = () => {
    localStorage.removeItem("userId");
    router.replace("/Login");
  };

  useEffect(() => {
    if (queryUserId && queryUserId !== userId) setUserId(queryUserId);
  }, [queryUserId, userId, setUserId]);

  useEffect(() => {
    if (!queryUserId) { setError("User ID is missing."); setLoading(false); return; }
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/user?id=${encodeURIComponent(queryUserId)}`);
        if (!res.ok) throw new Error("Failed to fetch user data");
        const data = await res.json();
        setUserDetails({
          UserId: data._id ?? "", Firstname: data.Firstname ?? "", Lastname: data.Lastname ?? "",
          Email: data.Email ?? "", Role: data.Role ?? "", Department: data.Department ?? "",
          Company: data.Company ?? "", ReferenceID: data.ReferenceID ?? "",
          profilePicture: data.profilePicture ?? "", faceDescriptors: data.faceDescriptors ?? null,
          TSM: data.TSM ?? "",
          Directories: data.Directories ?? [],
        });
        setError(null);
      } catch { setError("Failed to load user data."); }
      finally { setLoading(false); }
    })();
  }, [queryUserId]);

  useEffect(() => {
    if (userDetails) setFormData((prev) => ({ ...prev, ReferenceID: userDetails.ReferenceID, Email: userDetails.Email, TSM: userDetails.TSM }));
  }, [userDetails]);


  const fetchAccountAction = async () => {
    if (!userDetails) return;
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
    } catch { setPosts([]); }
    finally { setLoading(false); }
  };

  const { pendingCount, isOnline, isSyncing, syncNow } = useOfflineSync(fetchAccountAction);

  useEffect(() => { fetchAccountAction(); }, [userDetails, dateCreatedFilterRange]);

  useEffect(() => {
    if (posts.length === 0) return;
    (async () => {
      const uniqueRefs = Array.from(new Set(posts.map((p) => p.ReferenceID)));
      try {
        const res = await fetch(`/api/users?referenceIDs=${uniqueRefs.join(",")}`);
        if (!res.ok) return;
        const usersData = await res.json();
        const map: Record<string, UserInfo> = {};
        usersData.forEach((u: any) => { map[u.ReferenceID] = { Firstname: u.Firstname, Lastname: u.Lastname, profilePicture: u.profilePicture, TSM: u.TSM, Directories: u.Directories ?? [] }; });
        setUsersMap(map);
      } catch { /* silent */ }
    })();
  }, [posts]);

  const allVisibleAccounts = useMemo(() => {
    if (!userDetails) return [];
    const byRef = posts.filter((p) => p.ReferenceID === userDetails.ReferenceID);
    return userDetails.Role === "Super Admin" || userDetails.Department === "Human Resources" ? posts : byRef;
  }, [posts, userDetails]);

  const groupedByDate = useMemo(() => {
    const g: Record<string, ActivityLog[]> = {};
    allVisibleAccounts.forEach((p) => {
      const k = toLocalDateKey(p.date_created);
      if (!g[k]) g[k] = [];
      g[k].push(p);
    });
    return g;
  }, [allVisibleAccounts]);

  const calendarDays = useMemo(() => generateCalendarDays(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth]);
  const todayKey = toLocalDateKey(today);
  const todayLogs = groupedByDate[todayKey] || [];

  const todayVisits = useMemo(() => allVisibleAccounts.filter(
    (p) => (p.Status.toLowerCase() === "login" || p.Status.toLowerCase() === "logout" || p.Type.toLowerCase() === "client visit") && toLocalDateKey(p.date_created) === todayKey
  ), [allVisibleAccounts, todayKey]);

  const timelineItems: TimelineItem[] = todayVisits.map((p) => ({
    id: p._id ?? p.date_created,
    title: p.Type === "Client Visit" ? p.SiteVisitAccount : p.Status,
    description: p.Remarks || "No remarks",
    location: p.Location || "",
    status: p.Status || "",
    date: new Date(p.date_created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  })).sort((a, b) => new Date(b.id).getTime() - new Date(a.id).getTime());

  const monthlyStats = useMemo(() => {
    const thisMonthLogs = allVisibleAccounts.filter((p) => {
      const d = new Date(p.date_created);
      return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth();
    });
    const loginDays = new Set(thisMonthLogs.filter((l) => l.Status === "Login").map((l) => toLocalDateKey(l.date_created)));
    const visits = thisMonthLogs.filter((l) => l.Type === "Client Visit").length;
    const workDays = calendarDays.filter((d) => d.getMonth() === currentMonth.getMonth() && d.getDay() !== 0 && d.getDay() !== 6).length;
    const present = loginDays.size;
    return { present, absent: Math.max(0, workDays - present), visits, total: workDays };
  }, [allVisibleAccounts, currentMonth, calendarDays]);

  const onChangeAction = (field: keyof FormData, value: any) => setFormData((prev) => ({ ...prev, [field]: value }));
  const onEventClick = (event: ActivityLog) => { setSelectedEvent(event); setDialogOpen(true); };
  const goToPrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const NAV = [
    { id: "home" as const, icon: Home, label: "Home" },
    { id: "calendar" as const, icon: CalendarCheck, label: "Calendar" },
    { id: "reports" as const, icon: BarChart3, label: "Reports" },
    { id: "profile" as const, icon: User, label: "Profile" },
  ];

  const handleFaceRegister = async (descriptors: number[][]) => {
    if (!userId) return;
    try {
      const res = await fetch("/api/profile-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, faceDescriptors: descriptors }),
      });
      if (!res.ok) throw new Error("Failed to register face");
      toast.success("Biometrics registered successfully!");
      setFaceRegisterOpen(false);
      // Refresh user details
      const userRes = await fetch(`/api/user?id=${encodeURIComponent(userId)}`);
      const userData = await userRes.json();
      setUserDetails(prev => prev ? { ...prev, faceDescriptors: userData.faceDescriptors } : null);
    } catch (err) {
      console.error(err);
      toast.error("Error saving face data.");
    }
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "home":
        return <HomeTab userDetails={userDetails} todayLogs={todayLogs} monthlyStats={monthlyStats} onCreateAttendance={() => setCreateAttendanceOpen(true)} onCreateSiteVisit={() => setCreateSalesAttendanceOpen(true)} onSetTab={setActiveTab} />;
      case "calendar":
        return <CalendarTab currentMonth={currentMonth} calendarDays={calendarDays} groupedByDate={groupedByDate} usersMap={usersMap} monthlyStats={monthlyStats} allLogs={allVisibleAccounts} onEventClick={onEventClick} goToPrevMonth={goToPrevMonth} goToNextMonth={goToNextMonth} />;
      case "reports":
        return <ReportsTab monthlyStats={monthlyStats} allLogs={allVisibleAccounts} userId={userId} />;
      case "profile":
        return <ProfileTab userDetails={userDetails} userId={userId} onLogout={handleLogout} onFaceRegister={() => setFaceRegisterOpen(true)} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#F9F6F4] overflow-hidden">
      <OfflineBanner isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingCount} />
      {loading && posts.length === 0 && (
        <div className="absolute inset-0 z-50 bg-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-[#CC1318] rounded-full animate-spin" />
            <p className="text-[12px] text-gray-400">Loading...</p>
          </div>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 z-50 bg-white flex items-center justify-center p-6">
          <div className="bg-[#FEF0F0] border border-red-200 rounded-2xl px-4 py-3 text-sm text-[#CC1318] text-center">{error}</div>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full"
          >
            {renderActiveTab()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating Today's Activity Panel */}
      {activeTab === "home" && (
        <>
          {isPanelOpen ? (
            <div className="absolute bottom-20 right-4 w-72 max-h-80 bg-white rounded-3xl border border-gray-100 shadow-2xl z-40 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div>
                  <p className="font-semibold text-[13px] text-gray-800">Today's Activity</p>
                  <p className="text-[10px] text-gray-400">{todayVisits.length} record{todayVisits.length !== 1 ? "s" : ""}</p>
                </div>
                <button onClick={() => setIsPanelOpen(false)} className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors"><X size={11} /></button>
              </div>
              <div className="overflow-y-auto flex-1 p-3">
                {timelineItems.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center py-4">No activity today.</p>
                ) : (
                  timelineItems.map((item, i) => <TimelineItemComponent key={item.id} item={item} index={i} />)
                )}
              </div>
            </div>
          ) : (
            <button onClick={() => setIsPanelOpen(true)} className="absolute bottom-20 right-4 z-40 w-11 h-11 rounded-2xl bg-[#CC1318] flex items-center justify-center shadow-lg shadow-red-200 hover:bg-[#A8100F] transition-all active:scale-95">
              <MapPin size={18} className="text-white" />
              {todayVisits.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full border-2 border-[#CC1318] flex items-center justify-center text-[8px] font-bold text-[#CC1318]">{todayVisits.length}</span>
              )}
            </button>
          )}
        </>
      )}

      {/* Bottom Navigation */}
      <div className="flex-shrink-0 bg-white border-t border-gray-100 flex items-center" style={{ paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
        {NAV.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className="flex-1 flex flex-col items-center gap-1 py-3 relative transition-all">
              <item.icon size={20} className={isActive ? "text-[#CC1318]" : "text-gray-400"} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={`text-[10px] font-semibold ${isActive ? "text-[#CC1318]" : "text-gray-400"}`}>{item.label}</span>
              {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#CC1318]" />}
            </button>
          );
        })}
        {activeTab === "home" && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
            {userDetails?.Directories?.includes("Acculog:Button - Client Visit") && (
              <button onClick={() => setCreateAttendanceOpen(true)} className="w-14 h-14 rounded-2xl bg-[#CC1318] flex items-center justify-center shadow-xl shadow-red-300 hover:bg-[#A8100F] active:scale-95 transition-all">
                <Plus size={24} className="text-white" />
              </button>
            )}
          </div>
        )}

        {activeTab === "home" && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
            {userDetails?.Directories?.includes("Acculog:Button - Site Visit") && (
              <button onClick={() => setCreateSalesAttendanceOpen(true)} className="w-14 h-14 rounded-2xl bg-[#CC1318] flex items-center justify-center shadow-xl shadow-red-300 hover:bg-[#A8100F] active:scale-95 transition-all">
                <Plus size={24} className="text-white" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateAttendance
        open={createAttendanceOpen}
        onOpenChangeAction={setCreateAttendanceOpen}
        formData={formData}
        onChangeAction={onChangeAction}
        userDetails={{
          ReferenceID: userDetails?.ReferenceID ?? "",
          Email: userDetails?.Email ?? "",
          TSM: userDetails?.TSM ?? "",
          faceDescriptors: userDetails?.faceDescriptors
        } as any}
        fetchAccountAction={fetchAccountAction}
        setFormAction={setFormData}
      />
      <CreateSalesAttendance
        open={createSalesAttendanceOpen}
        onOpenChangeAction={setCreateSalesAttendanceOpen}
        formData={formData}
        onChangeAction={onChangeAction}
        userDetails={{
          ReferenceID: userDetails?.ReferenceID ?? "",
          Email: userDetails?.Email ?? "",
          TSM: userDetails?.TSM ?? "",
          Role: userDetails?.Role ?? "",
          faceDescriptors: userDetails?.faceDescriptors
        } as any}
        fetchAccountAction={fetchAccountAction}
        setFormAction={setFormData}
      />

      {/* ── Face Registration Dialog ── */}
      <Dialog open={faceRegisterOpen} onOpenChange={setFaceRegisterOpen}>
        <DialogContent className="p-0 rounded-[28px] max-w-sm w-full mx-auto overflow-hidden border-0 shadow-2xl max-h-[92vh] flex flex-col">
          <div className="bg-[#CC1318] px-6 pt-5 pb-6 flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setFaceRegisterOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <X size={15} />
              </button>
              <div className="flex-1">
                <h2 className="text-white font-semibold text-base leading-tight">Face Registration</h2>
                <p className="text-white/65 text-[11px] mt-0.5">Biometric Setup</p>
              </div>
            </div>
          </div>
          <div className="p-5 bg-[#F9F6F4]">
            <p className="text-[13px] text-gray-600 mb-4 leading-relaxed">
              Please look at the camera and take 3 clear photos of your face from different angles to complete the registration.
            </p>
            <Camera
              mode="register"
              onRegisterAction={handleFaceRegister}
              onCaptureAction={() => { }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ActivityDialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setSelectedEvent(null); }} selectedEvent={selectedEvent} usersMap={usersMap} />
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedPageWrapper>
      <UserProvider>
        <FormatProvider>
          <ActivityPage />
        </FormatProvider>
      </UserProvider>
    </ProtectedPageWrapper>
  );
}