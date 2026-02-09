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

import {
  MapPin,
  CheckCircleIcon,
} from "lucide-react";
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
  Type: string;
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
  const [siteCapturedImage, setSiteCapturedImage] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const [siteVisitAccounts, setSiteVisitAccounts] = useState<
    { company_name: string }[]
  >([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [lastTime, setLastTime] = useState<string | null>(null);
  const [loginCountToday, setLoginCountToday] = useState<number>(0);

  /* ================= SET DEFAULT TYPE TO 'Client Visit' ================= */

  useEffect(() => {
    if (open && formData.Type !== "Client Visit") {
      onChangeAction("Type", "Client Visit");
    }
  }, [open, formData.Type, onChangeAction]);

  /* ================= FETCH SITE VISIT ACCOUNTS ================= */

  useEffect(() => {
    if (!open) return;

    setLoadingAccounts(true);
    setAccountsError(null);

    fetch(
      `/api/fetch-account?referenceid=${encodeURIComponent(
        userDetails.ReferenceID
      )}`,
      { cache: "no-store" }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch accounts");
        return res.json();
      })
      .then((json) => {
        if (json.success) {
          setSiteVisitAccounts(json.data || []);
        } else {
          setAccountsError(json.error || "No accounts found");
        }
      })
      .catch((err) => {
        setAccountsError(err.message || "Error fetching accounts");
      })
      .finally(() => {
        setLoadingAccounts(false);
      });
  }, [open, userDetails.ReferenceID]);

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
          )
          .catch(() =>
            setLocationAddress("Location detected (no address)")
          );
      },
      () => {
        setLocationAddress("Location not allowed by user");
        setLatitude(null);
        setLongitude(null);
      },
      { enableHighAccuracy: true }
    );

    return () => {
      setCapturedImage(null);
      setSiteCapturedImage(null);
    };
  }, [open]);

  /* ================= FETCH LOGIN SUMMARY ================= */

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

      if (data.lastTime) {
        setLastTime(
          new Date(data.lastTime).toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
          })
        );
      }

      // Determine next status based on lastStatus:
      const nextStatus = data.lastStatus === "Login" ? "Logout" : "Login";

      // Set form status accordingly:
      onChangeAction("Status", nextStatus);
    };

    fetchSummary();

    const interval = setInterval(fetchSummary, 3000);
    return () => clearInterval(interval);
  }, [open, userDetails.ReferenceID, onChangeAction]);

  /* ================= UPLOAD IMAGE ================= */

  const uploadToCloudinary = async (base64: string) => {
    const imgData = new FormData();
    imgData.append("file", base64);
    imgData.append("upload_preset", "Xchire");

    const res = await fetch(
      "https://api.cloudinary.com/v1_1/dhczsyzcz/image/upload",
      { method: "POST", body: imgData }
    );

    const data = await res.json();
    return data.secure_url;
  };

  /* ================= SUBMIT ================= */

  const handleCreate = async () => {
    if (!capturedImage) {
      return toast.error("Please capture a photo first.");
    }

    if (!locationAddress || locationAddress === "Fetching location...") {
      return toast.error("Location not ready yet.");
    }

    if (!formData.SiteVisitAccount) {
      return toast.error("Please select a client account.");
    }

    setLoading(true);

    try {
      const photoURL = await uploadToCloudinary(capturedImage);
      const sitePhotoURL =
        siteCapturedImage && formData.Status !== "Logout"
          ? await uploadToCloudinary(siteCapturedImage)
          : null;

      const payload = {
        ...formData,
        Type: "Client Visit",
        PhotoURL: photoURL,
        SitePhotoURL: sitePhotoURL,
        Location: locationAddress,
        Latitude: manualLat ?? latitude,
        Longitude: manualLng ?? longitude,
      };

      const response = await fetch("/api/ModuleSales/Activity/AddLog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        return toast.error(err.error || "Error saving attendance.");
      }

      toast.success("Attendance created!");

      fetchAccountAction();

      // After successful submit, clear form and reset states:
      setFormAction({
        ReferenceID: userDetails.ReferenceID,
        Email: userDetails.Email,
        TSM: userDetails.TSM,
        Type: "Client Visit",
        Status: "", // will be reset on next fetchSummary
        PhotoURL: "",
        Remarks: "",
        SiteVisitAccount: "",
      });

      setCapturedImage(null);
      setSiteCapturedImage(null);
      setLoading(false);
      onOpenChangeAction(false);
    } catch (err) {
      console.error(err);
      toast.error("Error saving attendance.");
      setLoading(false);
    }
  };

  /* ================= UI ================= */

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Attendance</DialogTitle>
        </DialogHeader>

        {/* Display login count and next status */}
        <div className="p-4 bg-gray-50 rounded border border-gray-200 text-sm text-gray-700">
          <div>
            <strong>Login Count Today:</strong> {loginCountToday}
          </div>
          <div>
            <strong>Next Status:</strong>{" "}
            <span className={lastStatus === "Login" ? "text-red-600" : "text-green-600"}>
              {lastStatus === "Login" ? "Logout" : "Login"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 mt-4">
          {open && (
            <>
              <Camera onCaptureAction={setCapturedImage} />

              {capturedImage && (
                <>
                  <div className="grid gap-2">
                    <Label>Site Visit Account</Label>
                    {loadingAccounts ? (
                      <p className="text-xs text-gray-500">Loading accounts...</p>
                    ) : accountsError ? (
                      <p className="text-xs text-red-500">{accountsError}</p>
                    ) : (
                      <Select
                        options={siteVisitAccounts.map((acc) => ({
                          value: acc.company_name,
                          label: acc.company_name,
                        }))}
                        value={
                          formData.SiteVisitAccount
                            ? {
                              value: formData.SiteVisitAccount,
                              label: formData.SiteVisitAccount,
                            }
                            : null
                        }
                        onChange={(selected) =>
                          onChangeAction("SiteVisitAccount", selected?.value || "")
                        }
                        isClearable
                        placeholder="Select Account"
                      />
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label>Remarks</Label>
                    <Textarea
                      value={formData.Remarks}
                      onChange={(e) => onChangeAction("Remarks", e.target.value)}
                    />
                  </div>

                  <Alert className="text-xs">
                    <MapPin className="w-4 h-4 text-blue-500" />
                    <AlertTitle>My Location</AlertTitle>
                    <AlertDescription>{locationAddress}</AlertDescription>
                  </Alert>

                  <ManualLocationPicker
                    latitude={manualLat ?? latitude}
                    longitude={manualLng ?? longitude}
                    onChange={(lat, lng, address) => {
                      setManualLat(lat);
                      setManualLng(lng);
                      if (address) setLocationAddress(address);
                    }}
                  />
                </>
              )}

              {capturedImage && (
                <Button
                  className={`text-lg p-6 ${lastStatus === "Login" ? "bg-red-600" : "bg-green-600"
                    }`}
                  onClick={handleCreate}
                  disabled={loading}
                >
                  <CheckCircleIcon />
                  {loading ? "Saving..." : ` ${lastStatus === "Login" ? "Logout" : "Login"}`}
                </Button>
              )}

            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
