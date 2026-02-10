"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import Camera from "./camera";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { MapPin, CheckCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Select from "react-select";

const ManualLocationPicker = dynamic(
  () => import("./manual-location-picker"),
  { ssr: false }
);

/* ================= TYPES ================= */

interface FormData {
  ReferenceID: string;
  TSM: string;
  Email: string;
  Type: string; // will always be "Client Visit"
  Status: string;
  PhotoURL: string;
  Remarks: string;
  SiteVisitAccount?: string;
}

interface UserDetails {
  ReferenceID: string;
  TSM: string;
  Email: string;
}

interface CreateAttendanceProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  formData: FormData;
  onChangeAction: (field: keyof FormData, value: any) => void;
  userDetails: UserDetails;
  fetchAccountAction: () => void;
  setFormAction: React.Dispatch<React.SetStateAction<FormData>>;
}

/* ================= COMPONENT ================= */

export default function CreateAttendance({
  open,
  onOpenChangeAction,
  formData,
  onChangeAction,
  userDetails,
  fetchAccountAction,
  setFormAction,
}: CreateAttendanceProps) {
  const [locationAddress, setLocationAddress] = useState("Fetching location...");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [manualLat, setManualLat] = useState<number | null>(null);
  const [manualLng, setManualLng] = useState<number | null>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [siteVisitAccounts, setSiteVisitAccounts] = useState<
    { company_name: string }[]
  >([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [loginCountToday, setLoginCountToday] = useState<number>(0);

  // Local UI state to toggle Select visibility only
  const [clientType, setClientType] = useState<"New Client" | "Existing Client" | "">("");

  /* ================= EFFECTS ================= */

  useEffect(() => {
    if (!open) return;

    // Always reset clientType selection on open
    setClientType("");
  }, [open]);

  /* ================= GEOLOCATION ================= */

  useEffect(() => {
    if (!open) return;

    setManualLat(null);
    setManualLng(null);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude);
        setLongitude(coords.longitude);

        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`
        )
          .then((res) => res.json())
          .then((data) =>
            setLocationAddress(data.display_name || "Location detected")
          );
      },
      () => setLocationAddress("Location not allowed"),
      { enableHighAccuracy: true }
    );

    return () => setCapturedImage(null);
  }, [open]);

  /* ================= LOGIN SUMMARY ================= */

  useEffect(() => {
    if (!open) return;

    const fetchSummary = async () => {
      const res = await fetch(
        `/api/ModuleSales/Activity/LoginSummary?referenceId=${userDetails.ReferenceID}`
      );
      if (!res.ok) return;

      const data = await res.json();
      setLastStatus(data.lastStatus);
      setLoginCountToday(data.loginCount);

      onChangeAction(
        "Status",
        data.lastStatus === "Login" ? "Logout" : "Login"
      );
    };

    fetchSummary();
    const i = setInterval(fetchSummary, 3000);
    return () => clearInterval(i);
  }, [open, userDetails.ReferenceID, onChangeAction]);

  /* ================= UPLOAD ================= */

  const uploadToCloudinary = async (base64: string) => {
    const fd = new FormData();
    fd.append("file", base64);
    fd.append("upload_preset", "Xchire");

    const res = await fetch(
      "https://api.cloudinary.com/v1_1/dhczsyzcz/image/upload",
      { method: "POST", body: fd }
    );
    return (await res.json()).secure_url;
  };

  /* ================= SUBMIT ================= */

  const handleCreate = async () => {
    if (!capturedImage) return toast.error("Capture photo first.");

    // Note: formData.Type is always "Client Visit", so no need to check SiteVisitAccount here

    setLoading(true);

    try {
      const photoURL = await uploadToCloudinary(capturedImage);

      const payload = {
        ...formData,
        Type: "Client Visit", // force type here
        PhotoURL: photoURL,
        Location: locationAddress,
        Latitude: manualLat ?? latitude,
        Longitude: manualLng ?? longitude,
      };

      const res = await fetch("/api/ModuleSales/Activity/AddLog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error();

      toast.success("Attendance created!");
      fetchAccountAction();

      setFormAction({
        ReferenceID: userDetails.ReferenceID,
        Email: userDetails.Email,
        TSM: userDetails.TSM,
        Type: "Client Visit",
        Status: "",
        PhotoURL: "",
        Remarks: "",
        SiteVisitAccount: "",
      });

      setCapturedImage(null);
      onOpenChangeAction(false);
    } catch {
      toast.error("Error saving attendance.");
    } finally {
      setLoading(false);
    }
  };

  /* ================= FETCH ACCOUNTS WHEN EXISTING CLIENT SELECTED ================= */

  useEffect(() => {
    if (!open || clientType !== "Existing Client") {
      setSiteVisitAccounts([]);
      setAccountsError(null);
      setLoadingAccounts(false);
      return;
    }

    setLoadingAccounts(true);
    setAccountsError(null);

    fetch(
      `/api/fetch-account?referenceid=${encodeURIComponent(
        userDetails.ReferenceID
      )}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSiteVisitAccounts(json.data || []);
        } else {
          setAccountsError(json.error || "No accounts found");
        }
      })
      .catch(() => setAccountsError("Error fetching accounts"))
      .finally(() => setLoadingAccounts(false));
  }, [open, clientType, userDetails.ReferenceID]);


  /* ================= UI ================= */

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Attendance</DialogTitle>
        </DialogHeader>

        <div className="p-4 bg-gray-50 rounded border text-sm">
          <div>
            <strong>Login Count Today:</strong> {loginCountToday}
          </div>
          <div>
            <strong>Next Status:</strong>{" "}
            <span
              className={
                lastStatus === "Login"
                  ? "text-red-600"
                  : "text-green-600"
              }
            >
              {lastStatus === "Login" ? "Logout" : "Login"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 mt-4">
          <Camera onCaptureAction={setCapturedImage} />

          {capturedImage && (
            <>
              {/* RADIO — UI only, does NOT affect formData.Type */}
              <div className="grid gap-2">
                <Label>Client Type</Label>
                <div className="flex gap-6">
                  {["New Client", "Existing Client"].map((t) => (
                    <label key={t} className="flex gap-2 items-center">
                      <input
                        type="radio"
                        name="clientType"
                        checked={clientType === t}
                        onChange={() => {
                          setClientType(t as "New Client" | "Existing Client");

                          // Clear SiteVisitAccount if New Client selected
                          if (t === "New Client") {
                            onChangeAction("SiteVisitAccount", "");
                          }
                        }}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>

              {/* SELECT — only visible if "Existing Client" selected on UI */}
              {clientType === "Existing Client" && (
                <div className="grid gap-2">
                  <Label>Site Visit Account</Label>
                  <Select
                    options={siteVisitAccounts.map((a) => ({
                      value: a.company_name,
                      label: a.company_name,
                    }))}
                    value={
                      formData.SiteVisitAccount
                        ? {
                          value: formData.SiteVisitAccount,
                          label: formData.SiteVisitAccount,
                        }
                        : null
                    }
                    onChange={(s) =>
                      onChangeAction("SiteVisitAccount", s?.value || "")
                    }
                  />
                </div>
              )}

              {/* REMARKS */}
              <div className="grid gap-2">
                <Label>Remarks</Label>
                <Textarea
                  value={formData.Remarks}
                  onChange={(e) =>
                    onChangeAction("Remarks", e.target.value)
                  }
                />
              </div>

              {/* LOCATION */}
              <Alert className="text-xs">
                <MapPin className="w-4 h-4" />
                <AlertTitle>My Location</AlertTitle>
                <AlertDescription>{locationAddress}</AlertDescription>
              </Alert>

              <ManualLocationPicker
                latitude={manualLat ?? latitude}
                longitude={manualLng ?? longitude}
                onChange={(lat, lng, addr) => {
                  setManualLat(lat);
                  setManualLng(lng);
                  if (addr) setLocationAddress(addr);
                }}
              />

              {/* SUBMIT BUTTON */}
              <Button
                className={`text-lg p-6 ${lastStatus === "Login" ? "bg-red-600" : "bg-green-600"
                  }`}
                onClick={handleCreate}
                disabled={loading}
              >
                <CheckCircleIcon />
                {loading
                  ? "Saving..."
                  : lastStatus === "Login"
                    ? " Logout"
                    : " Login"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
