import { useState } from "react";
import { apiBaseUrl } from "./config.js";

type KioskAttendance = {
  id: string;
  teacherId: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status: string;
};

export function TeacherAttendanceKiosk() {
  const [staffId, setStaffId] = useState("TCH-001");
  const [pin, setPin] = useState("1234");
  const [lastRecord, setLastRecord] = useState<KioskAttendance | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [requestedCheckInAt, setRequestedCheckInAt] = useState("");
  const [requestedCheckOutAt, setRequestedCheckOutAt] = useState("");
  const [message, setMessage] = useState("Ready for teacher attendance.");
  const [busy, setBusy] = useState(false);

  async function submit(action: "check-in" | "check-out") {
    setMessage("Submitting...");
    setBusy(true);
    try {
      const response = await fetch(`${apiBaseUrl}/teacher-attendance/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          pin,
          deviceId: "00000000-0000-4000-8000-000000000001",
          occurredAt: new Date().toISOString()
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const attendance = await response.json();
      setLastRecord(attendance);
      setMessage(`${action === "check-in" ? "Check-in" : "Check-out"} recorded.`);
    } catch (error) {
      setMessage(`Offline or failed: ${error instanceof Error ? error.message : "Unknown error"}. The SQLite queue can retry this change.`);
    } finally {
      setBusy(false);
    }
  }

  async function requestCorrection() {
    if (!lastRecord) {
      setMessage("Record attendance first, then request a correction.");
      return;
    }
    if (correctionReason.trim().length < 10) {
      setMessage("Correction reason must be at least 10 characters.");
      return;
    }
    setBusy(true);
    const response = await fetch(`${apiBaseUrl}/teacher-attendance/${lastRecord.id}/correction-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestedBy: lastRecord.teacherId,
        reason: correctionReason.trim(),
        requestedCheckInAt: requestedCheckInAt ? new Date(requestedCheckInAt).toISOString() : null,
        requestedCheckOutAt: requestedCheckOutAt ? new Date(requestedCheckOutAt).toISOString() : null
      })
    });
    if (!response.ok) {
      setMessage(await response.text());
      setBusy(false);
      return;
    }
    setMessage("Correction request submitted for administrator review.");
    setBusy(false);
  }

  return (
    <div className="kiosk">
      <section className="kiosk-panel">
        <h1>Satelite Teacher Attendance</h1>
        <p className="kiosk-lede">Fast staff check-in, check-out, late tracking, and correction requests for administrator review.</p>
        <label>
          Staff ID
          <input value={staffId} onChange={(event) => setStaffId(event.target.value)} />
        </label>
        <label>
          PIN
          <input value={pin} type="password" onChange={(event) => setPin(event.target.value)} />
        </label>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => submit("check-in")}>Check In</button>
          <button type="button" disabled={busy} onClick={() => submit("check-out")}>Check Out</button>
        </div>
        {lastRecord && (
          <div className="kiosk-correction">
            <strong>Last record: {lastRecord.status}</strong>
            <label>
              Requested check-in
              <input type="datetime-local" value={requestedCheckInAt} onChange={(event) => setRequestedCheckInAt(event.target.value)} />
            </label>
            <label>
              Requested check-out
              <input type="datetime-local" value={requestedCheckOutAt} onChange={(event) => setRequestedCheckOutAt(event.target.value)} />
            </label>
            <label>
              Reason
              <textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} />
            </label>
            <button className="ghost" type="button" disabled={busy} onClick={() => void requestCorrection()}>Request Correction</button>
          </div>
        )}
        <p>{message}</p>
      </section>
    </div>
  );
}
