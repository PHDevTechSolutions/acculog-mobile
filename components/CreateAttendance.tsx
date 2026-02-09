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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

const ManualLocationPicker = dynamic(
  () => import("./manual-location-picker"),
  { ssr: false }
);

interface FormData {
  ReferenceID: string;
  Email: string;
  Type: string;
  Status: string;
  PhotoURL: string;
  Remarks: string;
  TSM: string;
  _id?: string;
}

interface UserDetails {
  ReferenceID: string;
  Email: string;
  TSM: string;
}

interface CreateAttendanceProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  formData: FormData;
  onChangeAction: (field: Exclude<keyof FormData, "_id">, value: any) => void;
  userDetails: UserDetails;
  fetchAccountAction: () => void;
  setFormAction: React.Dispatch<React.SetStateAction<FormData>>;
}

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
  const [manualLat, setManualLat] = useState<number | null>(null);
  const [manualLng, setManualLng] = useState<number | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [lastStatus, setLastStatus] = useState<"Login" | "Logout" | null>(null);
  const [lastTime, setLastTime] = useState<string | null>(null);

  // Auto-set Type to "On Field" on mount or open
  useEffect(() => {
    if (open && formData.Type !== "On Field") {
      onChangeAction("Type", "On Field");
    }
  }, [open, formData.Type, onChangeAction]);

  // Auto-fetch location when open
  useEffect(() => {
    if (!open) return;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude);
        setLongitude(coords.longitude);

        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`
        )
          .then((res) => res.json())
          .then((data) => setLocationAddress(data.display_name || "Location detected"))
          .catch(() => setLocationAddress("Location detected (no address)"));
      },
      (error) => {
        console.error("Geolocation error:", error);
        setLocationAddress("Location unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => setCapturedImage(null);
  }, [open]);

  const uploadToCloudinary = async (base64: string): Promise<string> => {
    const imgData = new FormData();
    imgData.append("file", base64);
    imgData.append("upload_preset", "Xchire");

    const res = await fetch("https://api.cloudinary.com/v1_1/dhczsyzcz/image/upload", {
      method: "POST",
      body: imgData,
    });

    const data = await res.json();
    return data.secure_url;
  };

  useEffect(() => {
    const fetchLastStatus = async () => {
      try {
        const res = await fetch(
          `/api/ModuleSales/Activity/LastStatus?referenceId=${userDetails.ReferenceID}`
        );
        if (!res.ok) return;

        const data = await res.json();

        if (data?.Status) {
          setLastStatus(data.Status);
          setLastTime(
            new Date(data.date_created).toLocaleTimeString("en-PH", {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
        } else {
          setLastStatus(null);
          setLastTime(null);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchLastStatus();
  }, [userDetails.ReferenceID]);

  const handleCreate = async () => {
    if (!capturedImage) return toast.error("Please capture a photo first.");
    if (!locationAddress || locationAddress === "Fetching location...")
      return toast.error("Location not ready yet.");

    setLoading(true);
    try {
      const photoURL = await uploadToCloudinary(capturedImage);

      const payload = {
        ...formData,
        PhotoURL: photoURL,
        Location: locationAddress,
        Latitude: latitude,
        Longitude: longitude,
      };

      const response = await fetch("/api/ModuleSales/Activity/AddLog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to create attendance");

      toast.success("Attendance created!");
      fetchAccountAction();
      onOpenChangeAction(false);

      setFormAction({
        ReferenceID: userDetails.ReferenceID,
        Email: userDetails.Email,
        Type: "On Field",
        Status: "",
        PhotoURL: "",
        Remarks: "",
        TSM: "",
      });

      setCapturedImage(null);
    } catch (err) {
      console.error(err);
      toast.error("Error saving attendance.");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="rounded-lg max-h-[90vh] overflow-y-auto w-full max-w-sm sm:max-w-lg md:max-w-lg mx-auto px-4 sm:px-6 md:px-8">
        <DialogHeader>
          <DialogTitle>Create Attendance</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4">

          {/* CURRENT STATUS */}
          {lastStatus && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
              <p>
                <strong>Current Status:</strong>{" "}
                <span
                  className={
                    lastStatus === "Login"
                      ? "text-green-600 font-semibold"
                      : "text-red-600 font-semibold"
                  }
                >
                  {lastStatus === "Login" ? "Logged In" : "Logged Out"}
                </span>
              </p>

              {lastTime && (
                <p className="text-gray-500 mt-1">
                  Last activity: {lastTime}
                </p>
              )}
            </div>
          )}

          {/* CAMERA */}
          <Camera onCaptureAction={(img) => setCapturedImage(img)} />

          {/* FORM FIELDS (SHOW AFTER CAPTURE) */}
          {capturedImage && (
            <>
              {/* STATUS */}
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.Status}
                  onValueChange={(v) => onChangeAction("Status", v)}
                >
                  <SelectTrigger
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs
                           focus:ring-2 focus:ring-black focus:outline-none transition-all"
                  >
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="Login" disabled={lastStatus === "Login"}>
                      Login {lastStatus === "Login" && "(Current)"}
                    </SelectItem>
                    <SelectItem value="Logout" disabled={lastStatus === "Logout"}>
                      Logout {lastStatus === "Logout" && "(Current)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* REMARKS */}
              <div className="grid gap-2">
                <Label>Remarks</Label>
                <Textarea
                  value={formData.Remarks}
                  onChange={(e) => onChangeAction("Remarks", e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid gap-2">
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
              </div>

              {/* SUBMIT */}
              <Button
                onClick={handleCreate}
                disabled={
                  loading ||
                  !formData.Status ||
                  !capturedImage ||
                  locationAddress === "Fetching location..."
                }
                className="w-full"
              >
                {loading ? "Saving..." : "Create Attendance"}
              </Button>
            </>
          )}

        </div>
      </DialogContent>
    </Dialog>

  );
}
