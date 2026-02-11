"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { FormatProvider } from "@/contexts/FormatContext";
import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import ActivityDialog from "@/components/dashboard-dialog";
import CreateAttendance from "@/components/CreateAttendance";
import { type DateRange } from "react-day-picker";
import CreateSalesAttendance from "@/components/CreateSalesAttenance";
import { MapPin, X } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { CalendarCheckIcon, MapPinCheck, ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import ProtectedPageWrapper from "@/components/protected-page-wrapper";
// ---------------- Interfaces ----------------
type TimelineItem = {
  id: string;
  title?: string | null;
  description: string;
  location: string;
  status: string;
  date?: string;
};

type InteractiveTimelineProps = {
  items?: TimelineItem[];
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
  TSM: string;
  Directories?: string[]
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

// ---------------- Helpers ----------------
function toLocalDateKey(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function generateCalendarDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstWeekday = firstDayOfMonth.getDay();

  for (let i = firstWeekday - 1; i >= 0; i--) {
    days.push(new Date(year, month, 1 - i - 1));
  }
  for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
    days.push(new Date(year, month, day));
  }
  while (days.length % 7 !== 0) {
    const nextDay = new Date(year, month, lastDayOfMonth.getDate() + (days.length - firstWeekday) + 1);
    days.push(nextDay);
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

// ---------------- Timeline Components ----------------

function TimelineItemComponent({
  item,
  index,
}: {
  item: TimelineItem;
  index: number;
}) {
  const itemRef = useRef(null);
  const itemInView = useInView(itemRef, {
    once: true,
    margin: "-100px",
  });

  return (
    <div ref={itemRef} className="relative flex gap-6">
      {/* Timeline dot */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={itemInView ? { scale: 1, opacity: 1 } : undefined}
        transition={{ delay: index * 0.2, duration: 0.3 }}
        className="absolute left-4 top-2 h-4 w-4"
      ><MapPinCheck /></motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={itemInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={{
          delay: index * 0.2 + 0.3,
          type: "spring",
          stiffness: 300,
          damping: 25,
        }}
        className="ml-12 flex-1 rounded-lg border border-border bg-card p-4"
      >
        {item.date && (
          <span className="text-xs text-muted-foreground">{item.date} - {item.status}</span>
        )}

        {item.title && item.title.trim() !== "" && item.title !== "Unknown Client" ? (
          <h3 className="mt-1 text-sm font-semibold">Visited On: {item.title}</h3>
        ) : null}

        <h3 className="mt-1 text-xs font-semibold">Address: {item.location}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Remarks / Feedback: {item.description}
        </p>
      </motion.div>
    </div>
  );

}

function InteractiveTimeline({
  items = [
    { id: "1", title: "Started", description: "Project began", location: "", status: "", date: "2024" },
    {
      id: "2",
      title: "Development",
      description: "Active development phase",
      location: "",
      status: "",
      date: "2024",
    },
    { id: "3", title: "Launch", description: "Project launched", location: "", status: "", date: "2024" },
  ],
}: InteractiveTimelineProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <div ref={ref} className="relative w-full max-w-2xl">
      {/* Timeline line */}
      <motion.div
        initial={{ scaleY: 0 }}
        animate={isInView ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="absolute left-6 top-0 h-full border-l-2 border-dashed border-border origin-top"
      />

      <div className="space-y-8 text-xs">
        {items.map((item, index) => (
          <TimelineItemComponent key={item.id} item={item} index={index} />
        ))}
      </div>
    </div>
  );
}

// ---------------- Page Component ----------------
export default function Page() {
  const searchParams = useSearchParams();
  const { userId, setUserId } = useUser();
  const queryUserId = searchParams?.get("id") ?? "";
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [createSalesAttendanceOpen, setCreateSalesAttendanceOpen] = useState(false);
  const [dateCreatedFilterRange, setDateCreatedFilterRange] = useState<DateRange | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, UserInfo>>({});
  const [selectedEvent, setSelectedEvent] = useState<ActivityLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [createAttendanceOpen, setCreateAttendanceOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    ReferenceID: "",
    Email: "",
    Type: "",
    Status: "",
    PhotoURL: "",
    Remarks: "",
    TSM: "",
  });

  const [isPanelOpen, setIsPanelOpen] = useState(true);

  useEffect(() => {
    if (queryUserId && queryUserId !== userId) {
      setUserId(queryUserId);
    }
  }, [queryUserId, userId, setUserId]);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (dateCreatedFilterRange?.from) return new Date(dateCreatedFilterRange.from);
    return new Date();
  });

  const onChangeAction = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ---------------- Fetch Functions ----------------
  // Move this outside of useEffect
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
          params.append(
            "endDate",
            (dateCreatedFilterRange.to ?? dateCreatedFilterRange.from).toISOString()
          );
        }

        const res = await fetch(`/api/ModuleSales/Activity/FetchLog?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch logs");

        const data = await res.json();
        allLogs = allLogs.concat(data.data ?? []);
        totalPages = data.pagination?.totalPages ?? 1;
        page++;
      } while (page <= totalPages);

      setPosts(allLogs);
    } catch (err) {
      console.error("Error fetching activity logs:", err);
      toast.error("Error fetching activity logs.");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  // Then call it inside useEffect
  useEffect(() => {
    fetchAccountAction();
  }, [userDetails, dateCreatedFilterRange]);

  useEffect(() => {
    if (!queryUserId) {
      setError("User ID is missing.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/user?id=${encodeURIComponent(queryUserId)}`);
        if (!res.ok) throw new Error("Failed to fetch user data");
        const data = await res.json();
        setUserDetails({
          UserId: data._id ?? "",
          Firstname: data.Firstname ?? "",
          Lastname: data.Lastname ?? "",
          Email: data.Email ?? "",
          Role: data.Role ?? "",
          Department: data.Department ?? "",
          Company: data.Company ?? "",
          ReferenceID: data.ReferenceID ?? "",
          profilePicture: data.profilePicture ?? "",
          TSM: data.TSM ?? "",
          Directories: data.Directories ?? [],
        });
        setError(null);
      } catch (err) {
        console.error("Error fetching user data:", err);
        setError("Failed to load user data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [queryUserId]);

  useEffect(() => {
    if (userDetails) {
      setFormData((prev) => ({
        ...prev,
        ReferenceID: userDetails.ReferenceID,
        Email: userDetails.Email,
        TSM: userDetails.TSM,
      }));
    }
  }, [userDetails]);

  useEffect(() => {
    if (posts.length === 0) return;

    (async () => {
      const uniqueRefs = Array.from(new Set(posts.map((p) => p.ReferenceID)));
      try {
        const res = await fetch(`/api/users?referenceIDs=${uniqueRefs.join(",")}`);
        if (!res.ok) throw new Error("Failed to fetch users");
        const usersData = await res.json();

        const map: Record<string, UserInfo> = {};
        usersData.forEach((user: any) => {
          map[user.ReferenceID] = {
            Firstname: user.Firstname,
            Lastname: user.Lastname,
            profilePicture: user.profilePicture,
            TSM: user.TSM,
            Directories: user.Directories ?? [],
          };
        });
        setUsersMap(map);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    })();
  }, [posts]);

  // ---------------- Filtering ----------------
  // ---------------- Filtering ----------------
  const filteredPosts = useMemo(() => {
    let visiblePosts = posts;

    // Helper to compare only year, month, day (ignore time)
    const isWithinRange = (date: string | Date, from: Date, to: Date) => {
      const d = new Date(date);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()); // midnight local
      const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
      return day >= start && day <= end;
    };

    // Filter by date range
    if (dateCreatedFilterRange?.from) {
      const fromDate = new Date(dateCreatedFilterRange.from);
      const toDate = new Date(dateCreatedFilterRange.to ?? dateCreatedFilterRange.from);

      visiblePosts = visiblePosts.filter((post) =>
        isWithinRange(post.date_created, fromDate, toDate)
      );
    }

    // Filter by search text
    if (searchText.trim()) {
      const lowerSearch = searchText.trim().toLowerCase();
      visiblePosts = visiblePosts.filter((post) => {
        const user = usersMap[post.ReferenceID];
        const first = user?.Firstname.toLowerCase() ?? "";
        const last = user?.Lastname.toLowerCase() ?? "";
        const email = post.Email.toLowerCase();
        return first.includes(lowerSearch) || last.includes(lowerSearch) || email.includes(lowerSearch);
      });
    }

    // Sort newest first
    visiblePosts.sort(
      (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
    );

    return visiblePosts;
  }, [posts, dateCreatedFilterRange, searchText, usersMap]);

  const filteredByReference = useMemo(() => {
    if (!userDetails?.ReferenceID) return [];
    return filteredPosts.filter((post) => post.ReferenceID === userDetails.ReferenceID);
  }, [filteredPosts, userDetails]);

  const allVisibleAccounts = useMemo(() => {
    if (!userDetails) return [];
    return userDetails.Role === "Super Admin" || userDetails.Department === "Human Resources"
      ? filteredPosts
      : filteredByReference;
  }, [userDetails, filteredPosts, filteredByReference]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, ActivityLog[]> = {};
    allVisibleAccounts.forEach((post) => {
      const dateKey = toLocalDateKey(post.date_created);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(post);
    });
    return groups;
  }, [allVisibleAccounts]);

  const calendarDays = useMemo(() => generateCalendarDays(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth]);

  const today = new Date();
  const goToPrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const onEventClick = (event: ActivityLog) => {
    setSelectedEvent(event);
    setDialogOpen(true);
  };

  const todayVisits = useMemo(() => {
    return allVisibleAccounts.filter(
      (post) =>
        (post.Status.toLowerCase() === "login" || post.Status.toLowerCase() === "logout") &&
        isSameDay(new Date(post.date_created), new Date())
    );
  }, [allVisibleAccounts]);

  const timelineItems: TimelineItem[] = todayVisits.map((post) => ({
    id: post._id ?? post.date_created,
    title: post.SiteVisitAccount || "Unknown Client",
    description: post.Remarks || "No remarks",
    location: post.Location || "",
    status: post.Status || "",
    date: new Date(post.date_created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  // ---------------- Render ----------------
  return (
    <ProtectedPageWrapper>
      <UserProvider>
        <FormatProvider>
          <SidebarProvider>
            <AppSidebar
              userId={userId ?? undefined}
              dateCreatedFilterRange={dateCreatedFilterRange}
              setDateCreatedFilterRangeAction={setDateCreatedFilterRange}
            />
            <SidebarInset>
              <header className="bg-background sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        Activity Calendar —{" "}
                        {currentMonth.toLocaleDateString(undefined, { year: "numeric", month: "long" })}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <div className="ml-auto flex gap-2">
                  <Button onClick={goToPrevMonth} >
                    <ArrowLeftIcon /> Prev
                  </Button>
                  <Button onClick={goToNextMonth}>
                    Next <ArrowRightIcon />
                  </Button>
                </div>
              </header>

              <main className="p-4 overflow-auto max-h-[calc(100vh-64px)]">
                {/* Search bar */}
                <div className="mb-4 flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search by first name, last name or email..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="flex-grow rounded border px-3 py-2 text-sm"
                    aria-label="Search events"
                  />

                  <div className="flex gap-2">
                    {userDetails?.Directories?.includes("Acculog:Button - Client Visit") && (
                      <Button
                        onClick={() => setCreateAttendanceOpen(true)}
                        className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#d11a2a] transition-all shadow-lg shadow-gray-200"
                      >
                        <CalendarCheckIcon />Create
                      </Button>
                    )}

                    {userDetails?.Directories?.includes("Acculog:Button - Site Visit") && (
                      <Button
                        onClick={() => setCreateSalesAttendanceOpen(true)}
                        className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#d11a2a] transition-all shadow-lg shadow-gray-200"
                      >
                        <CalendarCheckIcon />Create
                      </Button>
                    )}
                  </div>
                </div>

                {loading && <p>Loading...</p>}
                {error && <p className="text-red-600 mb-4">Error: {error}</p>}

                {!loading && !error && (
                  <div className="grid grid-cols-1 sm:grid-cols-7 gap-1 text-center select-none">
                    {/* Days grid */}
                    {calendarDays.map((date, idx) => {
                      const dateKey = toLocalDateKey(date);
                      const logs = groupedByDate[dateKey] || [];
                      const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                      const isToday = isSameDay(date, today);
                      const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];

                      return (
                        <div
                          key={idx}
                          className={`min-h-[110px] p-2 rounded border flex flex-col text-left
            ${isCurrentMonth ? "bg-white border-gray-300" : "bg-gray-50 text-gray-400 border-gray-200"}
            ${isToday ? "border-blue-500 border-2" : ""}
          `}
                        >
                          {/* Always show day number + name */}
                          <div className="text-sm font-semibold mb-1">
                            {date.getDate()} - {dayName}
                          </div>

                          <ul className="text-xs overflow-auto flex-1 space-y-1 max-h-[90px]">
                            {logs.length === 0 && <li className="text-gray-400 italic">No events</li>}
                            {logs.map((log) => {
                              const user = usersMap[log.ReferenceID];
                              return (
                                <li
                                  key={log._id ?? log.date_created}
                                  className="truncate flex items-center space-x-2 cursor-pointer hover:bg-blue-200"
                                  title={`${log.Type} - ${log.Status} @ ${new Date(log.date_created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                                  onClick={() => onEventClick(log)}
                                >
                                  {user?.profilePicture ? (
                                    <img
                                      src={user.profilePicture}
                                      alt={`${user.Firstname} ${user.Lastname}`}
                                      className="w-5 h-5 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-600">?</div>
                                  )}
                                  <span className="flex-1 text-[10px]">
                                    <strong>{user ? `${user.Firstname} ${user.Lastname}` : "Unknown User"}</strong> - <strong className="bg-blue-100 text-blue-800 rounded px-1">{log.Type}</strong>: {log.Status}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Floating panel for today's Site Visits */}
                {isPanelOpen ? (
                  <div
                    className="fixed bottom-4 right-4 max-w-sm w-96 max-h-96 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50 flex flex-col"
                    aria-label="Today's Client Visits"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold text-lg">Today's Visits</h3>
                      <button
                        onClick={() => setIsPanelOpen(false)}
                        aria-label="Close panel"
                        className="p-1 rounded hover:bg-gray-200"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {timelineItems.length === 0 ? (
                      <p className="text-xs text-gray-500">No login status today.</p>
                    ) : (
                      <InteractiveTimeline items={timelineItems} />
                    )}
                  </div>
                ) : (
                  // Floating Map Icon button when panel closed
                  <button
                    onClick={() => setIsPanelOpen(true)}
                    aria-label="Open login status panel"
                    className="fixed bottom-4 right-4 z-50 rounded-full bg-white p-3 shadow-lg border border-gray-300 hover:bg-gray-100"
                  >
                    <MapPin size={28} />
                    {todayVisits.length > 0 && (
                      <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                        {todayVisits.length}
                      </span>
                    )}
                  </button>
                )}

                {/* Create Attendance Dialog */}
                <CreateAttendance
                  open={createAttendanceOpen}
                  onOpenChangeAction={setCreateAttendanceOpen}
                  formData={formData}
                  onChangeAction={onChangeAction}
                  userDetails={{
                    ReferenceID: userDetails?.ReferenceID ?? "",
                    Email: userDetails?.Email ?? "",
                    TSM: userDetails?.TSM ?? ""
                  }}
                  fetchAccountAction={fetchAccountAction}
                  setFormAction={setFormData}
                />

                {/* Create TSA Attendance Dialog */}
                <CreateSalesAttendance
                  open={createSalesAttendanceOpen}
                  onOpenChangeAction={setCreateSalesAttendanceOpen}
                  formData={formData}
                  onChangeAction={onChangeAction}
                  userDetails={{
                    ReferenceID: userDetails?.ReferenceID ?? "",
                    Email: userDetails?.Email ?? "",
                    TSM: userDetails?.TSM ?? "",
                    Role: userDetails?.Role ?? ""
                  }}
                  fetchAccountAction={fetchAccountAction}
                  setFormAction={setFormData}
                />

                {/* Activity Dialog */}
                <ActivityDialog
                  open={dialogOpen}
                  onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setSelectedEvent(null);
                  }}
                  selectedEvent={selectedEvent}
                  usersMap={usersMap}
                />
              </main>
            </SidebarInset>
          </SidebarProvider>
        </FormatProvider>
      </UserProvider>
    </ProtectedPageWrapper>
  );
}
