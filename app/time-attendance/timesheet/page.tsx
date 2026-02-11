"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { FormatProvider } from "@/contexts/FormatContext";
import { AppSidebar } from "@/components/app-sidebar";
import { InfoIcon } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Search, DownloadCloud } from "lucide-react";
import { Button } from "@/components/ui/button"
import type { DateRange } from "react-day-picker";

import ProtectedPageWrapper from "@/components/protected-page-wrapper";

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
  dateStr: string; // "YYYY-MM-DD"
  label: string; // e.g. "15 | Saturday"
}

interface WeeklyLog extends Record<string, number> {
  late: number;
  undertime: number;
  overtime: number;
}

/**
 * Default rules:
 * - Shift: 8:00 - 17:00
 * - Lunch deduction: 12:00 - 13:00 (1 hour)
 * - Required daily hours: 8
 * - Rounding: 2 decimals
 */

export default function Page() {
  const searchParams = useSearchParams();
  const { userId, setUserId } = useUser();
  const queryUserId = searchParams?.get("id") ?? "";

  const [userDetails, setUserDetails] = useState({
    UserId: "",
    Firstname: "",
    Lastname: "",
    Email: "",
    Role: "",
    Department: "",
    Company: "",
    ReferenceID: "",
  });

  const [posts, setPosts] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);

  const [usersMap, setUsersMap] = useState<Record<string, UserInfo>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [dateCreatedFilterRange, setDateCreatedFilterRange] =
    useState<DateRange | undefined>(undefined);

  // Sync URL user id
  useEffect(() => {
    if (queryUserId && queryUserId !== userId) setUserId(queryUserId);
  }, [queryUserId, userId, setUserId]);

  // Fetch current user
  useEffect(() => {
    if (!queryUserId) return;
    setLoading(true);
    fetch(`/api/user?id=${encodeURIComponent(queryUserId)}`)
      .then((res) => res.json())
      .then((data) =>
        setUserDetails({
          UserId: data._id ?? "",
          Firstname: data.Firstname ?? "",
          Lastname: data.Lastname ?? "",
          Email: data.Email ?? "",
          Role: data.Role ?? "",
          Department: data.Department ?? "",
          Company: data.Company ?? "",
          ReferenceID: data.ReferenceID ?? "",
        })
      )
      .catch(() => toast.error("Failed to load user data."))
      .finally(() => setLoading(false));
  }, [queryUserId]);

  // Fetch logs
  useEffect(() => {
    const fetchAllActivityLogs = async () => {
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

          if (
            userDetails.Role !== "Super Admin" &&
            userDetails.Role !== "Human Resources"
          ) {
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

    fetchAllActivityLogs();
  }, [userDetails, dateCreatedFilterRange]);

  // Fetch users map (for names)
  useEffect(() => {
    const fetchUsersForPosts = async () => {
      if (posts.length === 0) return;

      const uniqueRefs = Array.from(new Set(posts.map((p) => p.ReferenceID)));

      try {
        const res = await fetch(`/api/users?referenceIDs=${uniqueRefs.join(",")}`);
        const usersData = await res.json();

        const map: Record<string, UserInfo> = {};
        usersData.forEach((u: any) => {
          map[u.ReferenceID] = {
            Firstname: u.Firstname ?? "Unknown",
            Lastname: u.Lastname ?? "",
            profilePicture: u.profilePicture ?? "",
          };
        });

        setUsersMap(map);
      } catch (err) {
        console.error("Error fetching users:", err);
        const fallback: Record<string, UserInfo> = {};
        posts.forEach((p) => {
          fallback[p.ReferenceID] = { Firstname: "Unknown", Lastname: "" };
        });
        setUsersMap(fallback);
      }
    };

    fetchUsersForPosts();
  }, [posts]);
  // Helpers
  function isDateInRange(dateStr: string, range?: DateRange) {
    if (!range) return true;
    const date = new Date(dateStr);
    const from = range.from ? new Date(range.from) : null;

    let to = range.to ? new Date(range.to) : null;
    if (to) {
      // Set 'to' to end of the day to include entire day
      to = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    }

    if (from && to) return date >= from && date <= to;
    if (from) return date.toDateString() === from.toDateString();
    if (to) return date.toDateString() === to.toDateString();
    return true;
  }

  function formatDate(d: string | Date) {
    const date = new Date(d);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateLabel(date: Date) {
    return `${date.getDate()} | ${date.toLocaleDateString(undefined, {
      weekday: "long",
    })}`;
  }

  function calculateTimes(logs: ActivityLog[]) {
    const loginTimes = logs
      .filter((log) => log.Status.toLowerCase() === "login")
      .map((log) => new Date(log.date_created))
      .sort((a, b) => a.getTime() - b.getTime());

    const logoutTimes = logs
      .filter((log) => log.Status.toLowerCase() === "logout")
      .map((log) => new Date(log.date_created))
      .sort((a, b) => a.getTime() - b.getTime());

    const firstLogin = loginTimes[0] ?? null;
    const lastLogout = logoutTimes[logoutTimes.length - 1] ?? null;

    if (!firstLogin) {
      return {
        hours: 0,
        late: 0,
        undertime: 0,
        overtime: 0,
      };
    }

    const shiftStart = new Date(firstLogin);
    shiftStart.setHours(8, 0, 0, 0);
    const shiftEnd = new Date(firstLogin);
    shiftEnd.setHours(18, 31, 0, 0); // 6:31 PM

    const now = new Date();
    let endTime: Date;

    if (lastLogout && lastLogout > firstLogin) {
      endTime = lastLogout;
    } else {
      endTime = now < shiftEnd ? now : shiftEnd;
    }

    let totalMs = endTime.getTime() - firstLogin.getTime();

    const lunchStart = new Date(firstLogin);
    lunchStart.setHours(12, 0, 0, 0);
    const lunchEnd = new Date(firstLogin);
    lunchEnd.setHours(13, 0, 0, 0);

    if (firstLogin < lunchEnd && endTime > lunchStart) {
      const lunchOverlapStart = firstLogin > lunchStart ? firstLogin : lunchStart;
      const lunchOverlapEnd = endTime < lunchEnd ? endTime : lunchEnd;
      const lunchOverlapMs = lunchOverlapEnd.getTime() - lunchOverlapStart.getTime();
      if (lunchOverlapMs > 0) totalMs -= lunchOverlapMs;
    }

    let late = 0,
      undertime = 0,
      overtime = 0;

    if (firstLogin > shiftStart) {
      late = (firstLogin.getTime() - shiftStart.getTime()) / 3600000;
    }
    if (endTime < shiftEnd) {
      undertime = (shiftEnd.getTime() - endTime.getTime()) / 3600000;
    }
    if (endTime > shiftEnd) {
      overtime = (endTime.getTime() - shiftEnd.getTime()) / 3600000;
    }

    return {
      hours: +((totalMs / 3600000) || 0).toFixed(2),
      late: +late.toFixed(2),
      undertime: +undertime.toFixed(2),
      overtime: +overtime.toFixed(2),
    };
  }

  const filteredPosts =
    userDetails.Role === "Super Admin" ||
      userDetails.Department === "Human Resources"
      ? posts
      : posts.filter((p) => p.ReferenceID === userDetails.ReferenceID);

  const searchedPosts = filteredPosts
    .filter((post) => {
      const q = searchQuery.toLowerCase().trim();
      if (q === "") return true;

      const userInfo = usersMap[post.ReferenceID];
      if (!userInfo) return false;

      const first = userInfo.Firstname.toLowerCase();
      const last = userInfo.Lastname.toLowerCase();

      return first.includes(q) || last.includes(q);
    })
    .filter((post) => isDateInRange(post.date_created, dateCreatedFilterRange));

  const dayHeaders: DailyLog[] = [];

  if (dateCreatedFilterRange?.from && dateCreatedFilterRange?.to) {
    for (
      let d = new Date(dateCreatedFilterRange.from);
      d <= dateCreatedFilterRange.to;
      d.setDate(d.getDate() + 1)
    ) {
      if (d.getDay() === 0) continue;
      const copy = new Date(d.getTime());
      dayHeaders.push({
        dateStr: formatDate(copy),
        label: formatDateLabel(copy),
      });
    }
  } else {
    const today = new Date();
    const dayOfWeek = today.getDay();

    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dayHeaders.push({
        dateStr: formatDate(d),
        label: formatDateLabel(d),
      });
    }
  }

  const groupedByRefDate: Record<string, ActivityLog[]> = {};
  searchedPosts.forEach((log) => {
    const dateKey = formatDate(log.date_created);
    const key = `${log.ReferenceID}|${dateKey}`;
    if (!groupedByRefDate[key]) groupedByRefDate[key] = [];
    groupedByRefDate[key].push(log);
  });

  const weeklyData: Record<string, WeeklyLog & Record<string, number>> = {};

  Object.entries(groupedByRefDate).forEach(([key, logs]) => {
    const [ref, dateKey] = key.split("|");

    if (!weeklyData[ref]) {
      weeklyData[ref] = {
        late: 0,
        undertime: 0,
        overtime: 0,
      };
      dayHeaders.forEach(({ dateStr }) => {
        weeklyData[ref][dateStr] = 0;
      });
    }

    const result = calculateTimes(logs);
    weeklyData[ref][dateKey] = result.hours;
    weeklyData[ref].late += result.late;
    weeklyData[ref].undertime += result.undertime;
    weeklyData[ref].overtime += result.overtime;
  });

  async function exportToExcel() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Timesheet");

    // Header row
    const headers = [
      "Name",
      ...dayHeaders.map((d) => d.label),
      "Total Hours",
      "Total Late",
      "Total Undertime",
      "Total Overtime",
    ];

    sheet.addRow(headers);

    Object.entries(weeklyData)
      .filter(([ref, week]) => {
        const totalHours = dayHeaders.reduce(
          (sum, { dateStr }) => sum + (week[dateStr] ?? 0),
          0
        );
        const totalOthers = week.late + week.undertime + week.overtime;
        return totalHours > 0 || totalOthers > 0;
      })
      .forEach(([ref, week]) => {
        const u = usersMap[ref];
        const name = u ? `${u.Firstname} ${u.Lastname}` : ref;
        const total = dayHeaders.reduce(
          (sum, { dateStr }) => sum + (week[dateStr] ?? 0),
          0
        );

        const row = [
          name,
          ...dayHeaders.map(({ dateStr }) =>
            week[dateStr] ? week[dateStr].toFixed(2) : "-"
          ),
          total.toFixed(2),
          week.late.toFixed(2),
          week.undertime.toFixed(2),
          week.overtime.toFixed(2),
        ];
        sheet.addRow(row);
      });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, "timesheet.xlsx");
  }

  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  function getComputationDetails(ref: string) {
    const week = weeklyData[ref];
    if (!week) return null;

    let details = `Computation breakdown for ${ref}:\n\n`;
    details += `Daily hours:\n`;
    dayHeaders.forEach(({ dateStr, label }) => {
      details += `  ${label}: ${week[dateStr]?.toFixed(2) ?? "0.00"} hrs\n`;
    });
    details += `\nTotals:\n`;
    details += `  Late: ${week.late.toFixed(2)} hrs\n`;
    details += `  Undertime: ${week.undertime.toFixed(2)} hrs\n`;
    details += `  Overtime: ${week.overtime.toFixed(2)} hrs\n`;
    return details;
  }

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
              <header className="bg-background sticky top-0 flex h-16 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbPage>Timesheet</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </header>

              <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex items-center w-full max-w-md gap-2">
                  {/* Search input container */}
                  <div className="relative flex-grow">
                    <Search className="absolute left-2 top-2 h-5 w-5 text-gray-400" />
                    <Input
                      placeholder="Search by Firstname or Lastname..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                    {loading && (
                      <Spinner className="absolute right-3 top-2 h-5 w-5 text-gray-500" />
                    )}
                  </div>

                  {/* Export button */}

                  <Button onClick={exportToExcel} className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#d11a2a] transition-all shadow-lg shadow-gray-200">
                    <DownloadCloud size={18} />  Export Data
                  </Button>
                </div>


                <div className="w-full overflow-x-auto border rounded-md shadow-sm bg-white">
                  <Table className="min-w-full table-auto">
                    <caption className="text-sm font-semibold mb-3 text-gray-700 px-4 pt-4">
                      Timesheet Summary —{" "}
                      <span className="text-gray-500">
                        {dateCreatedFilterRange
                          ? `${formatDateLabel(new Date(dateCreatedFilterRange.from!))} - ${formatDateLabel(new Date(dateCreatedFilterRange.to!))}`
                          : "All Dates"}
                      </span>
                    </caption>

                    <TableHeader className="bg-gray-100 sticky top-0 z-10">
                      <TableRow className="text-xs whitespace-nowrap">
                        <TableHead className="text-left px-4 py-2">Name</TableHead>
                        {dayHeaders.map(({ label }) => (
                          <TableHead
                            key={label}
                            className="text-right px-4 py-2"
                            title={label}
                          >
                            {label}
                          </TableHead>
                        ))}
                        <TableHead className="text-right px-4 py-2">Total Hrs</TableHead>
                        <TableHead className="text-right px-4 py-2">Late</TableHead>
                        <TableHead className="text-right px-4 py-2">Undertime</TableHead>
                        <TableHead className="text-right px-4 py-2">Overtime</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody className="text-xs whitespace-nowrap">
                      {Object.keys(weeklyData).length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={7 + dayHeaders.length}
                            className="text-center p-6 text-gray-500"
                          >
                            No timesheet records found.
                          </TableCell>
                        </TableRow>
                      )}

                      {Object.entries(weeklyData)
                        .filter(([_, week]) => {
                          const totalHours = dayHeaders.reduce(
                            (sum, { dateStr }) => sum + (week[dateStr] ?? 0),
                            0
                          );
                          const totalOthers = week.late + week.undertime + week.overtime;
                          return totalHours > 0 || totalOthers > 0;
                        })
                        .map(([ref, week], idx) => {
                          const u = usersMap[ref];
                          const name = u ? `${u.Firstname} ${u.Lastname}` : ref;
                          const total = dayHeaders.reduce(
                            (sum, { dateStr }) => sum + (week[dateStr] ?? 0),
                            0
                          );

                          return (
                            <TableRow
                              key={ref}
                              className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                                } hover:bg-blue-50`}
                            >
                              <TableCell
                                className="capitalize px-4 py-2 font-medium max-w-xs truncate flex items-center gap-2"
                                title={name}
                              >
                                {name}
                                {/* Info button */}
                                <button
                                  aria-label={`Show computation details for ${name}`}
                                  onClick={() => setSelectedRef(ref)}
                                  className="text-blue-500 hover:text-blue-700"
                                  type="button"
                                >
                                  <InfoIcon className="h-4 w-4" />
                                </button>
                              </TableCell>

                              {dayHeaders.map(({ dateStr }) => (
                                <TableCell
                                  key={dateStr}
                                  className="text-right px-4 py-2 font-mono"
                                  title={week[dateStr] ? week[dateStr].toFixed(2) : "No data"}
                                >
                                  {week[dateStr] ? week[dateStr].toFixed(2) : "-"}
                                </TableCell>
                              ))}

                              <TableCell className="text-right px-4 py-2 font-bold font-mono">
                                {total.toFixed(2)}
                              </TableCell>

                              {/* Colored badges */}
                              <TableCell className="text-right px-4 py-2">
                                {week.late > 0 ? (
                                  <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">
                                    {week.late.toFixed(2)}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </TableCell>

                              <TableCell className="text-right px-4 py-2">
                                {week.undertime > 0 ? (
                                  <span className="inline-block rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs font-semibold">
                                    {week.undertime.toFixed(2)}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </TableCell>

                              <TableCell className="text-right px-4 py-2">
                                {week.overtime > 0 ? (
                                  <span className="inline-block rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-semibold">
                                    {week.overtime.toFixed(2)}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
                {/* Dialog for computation details */}
                {selectedRef && (
                  <Dialog open={true} onOpenChange={() => setSelectedRef(null)}>
                    <DialogContent>
                      <DialogTitle>Computation Details</DialogTitle>
                      <pre className="whitespace-pre-wrap text-sm mt-2">
                        {getComputationDetails(selectedRef)}
                      </pre>
                      <button
                        onClick={() => setSelectedRef(null)}
                        className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                      >
                        Close
                      </button>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </FormatProvider>
      </UserProvider>
    </ProtectedPageWrapper>
  );
}
