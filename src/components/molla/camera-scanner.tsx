import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CameraScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" aria-label="Scan with camera">
          <Camera className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan a barcode</DialogTitle>
          <DialogDescription>
            Point the phone camera at the barcode. The item is added as soon as it is read.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ScannerView
            onDetected={(code) => {
              setOpen(false);
              onDetected(code);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ScannerView({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Keep the latest callback in a ref so a re-render never restarts the camera.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    let permissionStream: MediaStream | undefined;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError(
            "This browser cannot open the camera. Open the app in Chrome or Safari on the phone.",
          );
          return;
        }
        // Ask for the camera up front so the permission prompt always appears.
        try {
          permissionStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
        } catch (permError) {
          if (stopped) return;
          const name = (permError as DOMException)?.name;
          if (name === "NotAllowedError" || name === "SecurityError") {
            setError(
              "Camera access is blocked. Tap the lock/tune icon next to the address bar, allow Camera for this site, then try again.",
            );
          } else if (name === "NotFoundError" || name === "OverconstrainedError") {
            setError("No camera was found on this device.");
          } else {
            setError("The camera could not be opened. Close other apps using the camera and try again.");
          }
          return;
        }
        // Permission granted — release the probe stream; the reader opens its own.
        permissionStream.getTracks().forEach((t) => t.stop());
        permissionStream = undefined;
        if (stopped) return;

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const video = videoRef.current;
        if (!video) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video,
          (result) => {
            if (result && !stopped) {
              stopped = true;
              try {
                controls?.stop();
              } catch {
                // already stopped
              }
              onDetectedRef.current(result.getText());
            }
          },
        );
        if (stopped) {
          try {
            controls.stop();
          } catch {
            // already stopped
          }
        }
      } catch {
        if (!stopped) {
          setError("The camera could not be opened. Check camera permission for this app.");
        }
      }
    })();

    return () => {
      stopped = true;
      try {
        controls?.stop();
      } catch {
        // already stopped
      }
    };
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <video
      ref={videoRef}
      className="aspect-video w-full rounded-lg bg-secondary object-cover"
      muted
      playsInline
    />
  );
}
