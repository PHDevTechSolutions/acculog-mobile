"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Camera as CameraIcon, SwitchCamera } from "lucide-react";

interface CameraProps {
  onCaptureAction: (dataUrl: string) => void;
}

const COUNTDOWN_SECONDS = 5;

export default function Camera({ onCaptureAction }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [cameraStarted, setCameraStarted] = useState<boolean>(false);

  // Request permission and enumerate devices AFTER user interaction
  const requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setPermissionGranted(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(videoDevices);
      if (videoDevices.length > 0) setSelectedDeviceId(videoDevices[0].deviceId);

      setCameraStarted(true);
    } catch (err) {
      console.error("Camera permission denied or error:", err);
      setPermissionGranted(false);
    }
  };

  // Start camera stream with deviceId or fallback
  const startCamera = async (deviceId?: string) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      const constraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId } } }
        : { video: { facingMode: "user" } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
    } catch (err) {
      console.error("Error starting camera with deviceId, fallback to facingMode:", err);
      // fallback without deviceId
      if (deviceId) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
          if (videoRef.current) videoRef.current.srcObject = stream;
          streamRef.current = stream;
        } catch (e) {
          console.error("Fallback camera error:", e);
        }
      }
    }
  };

  // When selectedDeviceId changes and camera started, start camera stream again
  useEffect(() => {
    if (!permissionGranted || !cameraStarted) return;
    if (!selectedDeviceId) return;
    startCamera(selectedDeviceId);
  }, [selectedDeviceId, permissionGranted, cameraStarted]);

  const flipCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    setSelectedDeviceId(devices[nextIndex].deviceId);
  };

  const handleTap = () => {
    if (!capturedImage && countdown === null) setCountdown(COUNTDOWN_SECONDS);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) return capture();

    const timer = setTimeout(() => setCountdown((prev) => (prev! > 0 ? prev! - 1 : 0)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.9);
    setCapturedImage(dataUrl);
    onCaptureAction(dataUrl);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setCountdown(null);
    if (selectedDeviceId) startCamera(selectedDeviceId);
  };

  return (
    <div className="w-full flex flex-col gap-3 border border-dashed border-gray-300 p-3 rounded-lg shadow-lg">
      {!permissionGranted && (
        <Button onClick={requestCameraPermission} className="h-20">
          <CameraIcon />
          Start Camera
        </Button>
      )}

      {/* Show select only if permission granted and no photo captured */}
      {permissionGranted && !capturedImage && devices.length > 0 && (
        <select
          className="w-full max-w-xl p-2 border rounded text-xs"
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
        >
          {devices.map((d, idx) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${idx + 1}`}
            </option>
          ))}
        </select>
      )}

      {/* Show video only if permission granted */}
      {permissionGranted && !capturedImage && (
        <div
          className="relative w-full max-w-xl cursor-pointer"
          onClick={handleTap}
          onTouchStart={handleTap}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-video rounded-lg border shadow-md"
          />

          {countdown !== null && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-6xl font-bold">{countdown}</span>
            </div>
          )}

          {countdown === null && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span className="text-white text-sm font-medium text-center px-2">
                Tap to capture photo
              </span>
            </div>
          )}
        </div>
      )}

      {/* Flip camera button */}
      {permissionGranted && !capturedImage && devices.length > 1 && (
        <Button onClick={flipCamera} className="flex gap-2">
          <SwitchCamera size={18} />
          Flip Camera
        </Button>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* Captured image preview */}
      {capturedImage && (
        <div className="w-full flex flex-col items-center">
          <img
            src={capturedImage}
            alt="Captured"
            className="w-full max-w-xs rounded shadow-md"
          />
          <Button onClick={retakePhoto} className="mt-3">
            <RefreshCcw className="w-4 h-4" />
            Retake Photo
          </Button>
        </div>
      )}
    </div>
  );
}
