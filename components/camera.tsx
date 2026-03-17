"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCcw, SwitchCamera, Camera as CameraIcon, CheckCircle2, AlertCircle } from "lucide-react";

interface CameraProps {
  onCaptureAction: (dataUrl: string) => void;
}

const COUNTDOWN_SECONDS = 3;

// Face detection status types
type FaceStatus = "idle" | "no-face" | "multiple" | "detected" | "unsupported";

export default function Camera({ onCaptureAction }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [permissionGiven, setPermissionGiven] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("idle");
  const [faceCount, setFaceCount] = useState(0);

  // ── Face detection loop ───────────────────────────────────────────────────

  const runFaceDetection = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(runFaceDetection);
      return;
    }

    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    overlay.width = video.videoWidth || video.clientWidth;
    overlay.height = video.videoHeight || video.clientHeight;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!detectorRef.current) {
      rafRef.current = requestAnimationFrame(runFaceDetection);
      return;
    }

    try {
      const faces: any[] = await detectorRef.current.detect(video);
      setFaceCount(faces.length);

      if (faces.length === 0) {
        setFaceStatus("no-face");
      } else if (faces.length > 1) {
        setFaceStatus("multiple");
        // Draw red boxes for extra faces
        faces.forEach((face) => {
          const { x, y, width, height } = face.boundingBox;
          const scaleX = overlay.width / video.videoWidth;
          const scaleY = overlay.height / video.videoHeight;
          ctx.strokeStyle = "#CC1318";
          ctx.lineWidth = 2;
          ctx.strokeRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);
        });
      } else {
        setFaceStatus("detected");
        // Draw a polished scan frame around the single detected face
        const face = faces[0];
        const { x, y, width, height } = face.boundingBox;
        const scaleX = overlay.width / video.videoWidth;
        const scaleY = overlay.height / video.videoHeight;
        const fx = x * scaleX;
        const fy = y * scaleY;
        const fw = width * scaleX;
        const fh = height * scaleY;
        const padding = 20;
        const px = fx - padding;
        const py = fy - padding;
        const pw = fw + padding * 2;
        const ph = fh + padding * 2;
        const corner = 18;

        // Soft green glow fill
        ctx.fillStyle = "rgba(26, 122, 74, 0.06)";
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, corner);
        ctx.fill();

        // Green border
        ctx.strokeStyle = "#1A7A4A";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, corner);
        ctx.stroke();

        // Corner accent lines (top-left, top-right, bottom-left, bottom-right)
        const len = 18;
        const lw = 3;
        ctx.strokeStyle = "#1A7A4A";
        ctx.lineWidth = lw;
        ctx.lineCap = "round";

        const corners = [
          // top-left
          [px, py + len, px, py, px + len, py],
          // top-right
          [px + pw - len, py, px + pw, py, px + pw, py + len],
          // bottom-left
          [px, py + ph - len, px, py + ph, px + len, py + ph],
          // bottom-right
          [px + pw - len, py + ph, px + pw, py + ph, px + pw, py + ph - len],
        ];

        corners.forEach(([x1, y1, x2, y2, x3, y3]) => {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.stroke();
        });

        // Scan line animation
        const now = performance.now();
        const period = 2000;
        const t = ((now % period) / period);
        const scanY = py + t * ph;
        const grad = ctx.createLinearGradient(px, scanY - 8, px, scanY + 8);
        grad.addColorStop(0, "rgba(26,122,74,0)");
        grad.addColorStop(0.5, "rgba(26,122,74,0.4)");
        grad.addColorStop(1, "rgba(26,122,74,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(px, scanY - 8, pw, 16);
      }
    } catch {
      // FaceDetector not supported or error — fail silently
      setFaceStatus("unsupported");
    }

    rafRef.current = requestAnimationFrame(runFaceDetection);
  }, []);

  // ── Initialize face detector ───────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("FaceDetector" in window) {
      try {
        detectorRef.current = new (window as any).FaceDetector({
          fastMode: true,
          maxDetectedFaces: 5,
        });
      } catch {
        setFaceStatus("unsupported");
      }
    } else {
      setFaceStatus("unsupported");
    }
  }, []);

  // Start / stop detection loop
  useEffect(() => {
    if (permissionGiven && cameraStarted && !capturedImage) {
      rafRef.current = requestAnimationFrame(runFaceDetection);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [permissionGiven, cameraStarted, capturedImage, runFaceDetection]);

  // ── Camera control ─────────────────────────────────────────────────────────

  const startCamera = async (deviceId?: string) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const constraints: MediaStreamConstraints = deviceId
      ? { video: { deviceId: { exact: deviceId }, facingMode: "user" } }
      : { video: { facingMode: "user" } };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
    } catch {
      // Fallback without exact deviceId
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) videoRef.current.srcObject = stream;
        streamRef.current = stream;
      } catch (e) {
        console.error("Camera error:", e);
      }
    }
  };

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setPermissionGiven(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;

      const all = await navigator.mediaDevices.enumerateDevices();
      const video = all.filter((d) => d.kind === "videoinput");
      setDevices(video);
      if (video.length > 0) setSelectedDevice(video[0].deviceId);
      setCameraStarted(true);
    } catch (e) {
      console.error("Permission denied:", e);
    }
  };

  useEffect(() => {
    if (!permissionGiven || !cameraStarted || !selectedDevice) return;
    startCamera(selectedDevice);
  }, [selectedDevice, permissionGiven, cameraStarted]);

  const flipCamera = () => {
    if (devices.length < 2) return;
    const idx = devices.findIndex((d) => d.deviceId === selectedDevice);
    const next = (idx + 1) % devices.length;
    setSelectedDevice(devices[next].deviceId);
  };

  // ── Capture flow ───────────────────────────────────────────────────────────

  const handleTap = () => {
    if (!capturedImage && countdown === null) setCountdown(COUNTDOWN_SECONDS);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { capture(); return; }
    const t = setTimeout(() => setCountdown((p) => (p! > 0 ? p! - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(dataUrl);
    onCaptureAction(dataUrl);
    setCountdown(null);

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const retake = () => {
    setCapturedImage(null);
    setCountdown(null);
    setFaceStatus("idle");
    if (selectedDevice) startCamera(selectedDevice);
    setTimeout(() => {
      rafRef.current = requestAnimationFrame(runFaceDetection);
    }, 500);
  };

  // ── Status helpers ─────────────────────────────────────────────────────────

  const statusConfig: Record<FaceStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    idle: { label: "Starting camera…", color: "#6B7280", bg: "bg-gray-100", icon: null },
    unsupported: { label: "Tap to capture", color: "#6B7280", bg: "bg-gray-100", icon: null },
    "no-face": { label: "No face detected", color: "#CC1318", bg: "bg-[#FEF0F0]", icon: <AlertCircle size={13} /> },
    multiple: { label: "Multiple faces detected", color: "#A0611A", bg: "bg-[#FDF4E7]", icon: <AlertCircle size={13} /> },
    detected: { label: "Face detected — tap to capture", color: "#1A7A4A", bg: "bg-[#EEF7F2]", icon: <CheckCircle2 size={13} /> },
  };

  const sc = statusConfig[faceStatus];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full flex flex-col gap-3">

      {/* ── Permission prompt ── */}
      {!permissionGiven && (
        <button
          onClick={requestPermission}
          className="w-full rounded-2xl border-2 border-dashed border-gray-200 bg-[#F9F6F4] py-8 flex flex-col items-center gap-3 hover:border-[#CC1318]/40 hover:bg-[#FFF8F8] transition-all group"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#FEF0F0] flex items-center justify-center group-hover:bg-[#CC1318] transition-colors">
            <CameraIcon size={24} className="text-[#CC1318] group-hover:text-white transition-colors" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-gray-700">Start Camera</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Tap to allow camera access</p>
          </div>
        </button>
      )}

      {/* ── Live camera ── */}
      {permissionGiven && !capturedImage && (
        <>
          {/* Face status badge */}
          {faceStatus !== "idle" && (
            <div className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${sc.bg}`}>
              {sc.icon && <span style={{ color: sc.color }}>{sc.icon}</span>}
              <span className="text-[12px] font-semibold" style={{ color: sc.color }}>{sc.label}</span>
              {faceStatus === "detected" && (
                <span className="ml-auto w-2 h-2 rounded-full bg-[#1A7A4A] animate-pulse" />
              )}
            </div>
          )}

          {/* Camera viewfinder */}
          <div
            className="relative w-full cursor-pointer select-none overflow-hidden rounded-2xl border border-gray-200 bg-black"
            onClick={handleTap}
            onTouchStart={handleTap}
            style={{ aspectRatio: "4/3" }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Face detection overlay canvas */}
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Countdown overlay */}
            {countdown !== null && countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="flex flex-col items-center gap-2">
                  <span
                    className="text-white font-bold leading-none"
                    style={{
                      fontSize: 72,
                      textShadow: "0 0 32px rgba(204,19,24,0.8)",
                    }}
                  >
                    {countdown}
                  </span>
                  <span className="text-white/70 text-[13px] font-medium tracking-wide">Capturing…</span>
                </div>
              </div>
            )}

            {/* Idle tap hint (no countdown, no face detected or unsupported) */}
            {countdown === null && (faceStatus === "unsupported" || faceStatus === "idle") && (
              <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                <div className="bg-black/50 rounded-full px-4 py-2">
                  <span className="text-white text-[12px] font-medium">Tap to capture</span>
                </div>
              </div>
            )}

            {/* Ready to capture hint when face detected */}
            {countdown === null && faceStatus === "detected" && (
              <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                <div className="bg-[#1A7A4A]/80 rounded-full px-4 py-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span className="text-white text-[12px] font-medium">Tap to capture</span>
                </div>
              </div>
            )}

            {/* No face / multiple hint */}
            {countdown === null && (faceStatus === "no-face" || faceStatus === "multiple") && (
              <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                <div className="bg-black/60 rounded-full px-4 py-2">
                  <span className="text-white/80 text-[11px] font-medium">
                    {faceStatus === "no-face" ? "Position your face in frame" : "Please use camera alone"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="flex gap-2">
            {/* Camera selector */}
            {devices.length > 1 && (
              <button
                onClick={flipCamera}
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 text-[12px] font-semibold text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-95 flex-shrink-0"
              >
                <SwitchCamera size={15} />
                Flip
              </button>
            )}

            {/* Device dropdown (only on desktop where multiple cameras exist) */}
            {devices.length > 2 && (
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="flex-1 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] text-gray-700 outline-none focus:border-[#CC1318] focus:ring-2 focus:ring-[#CC1318]/10 transition-all"
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </>
      )}

      {/* ── Captured photo preview ── */}
      {capturedImage && (
        <div className="flex flex-col gap-3">
          {/* Success banner */}
          <div className="flex items-center gap-2 bg-[#EEF7F2] rounded-2xl px-3 py-2.5">
            <CheckCircle2 size={15} className="text-[#1A7A4A] flex-shrink-0" />
            <span className="text-[12px] font-semibold text-[#1A7A4A]">Photo captured successfully</span>
          </div>

          {/* Preview */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-200">
            <img
              src={capturedImage}
              alt="Captured photo"
              className="w-full object-cover"
              style={{ aspectRatio: "4/3" }}
            />
            {/* Overlay check mark */}
            <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#1A7A4A] flex items-center justify-center shadow-lg">
              <CheckCircle2 size={16} className="text-white" />
            </div>
          </div>

          {/* Retake button */}
          <button
            onClick={retake}
            className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3 text-[13px] font-semibold text-gray-600 hover:border-[#CC1318]/40 hover:bg-[#FFF8F8] hover:text-[#CC1318] transition-all active:scale-[0.98]"
          >
            <RefreshCcw size={14} />
            Retake Photo
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}