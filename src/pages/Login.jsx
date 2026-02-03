import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebase";

const PIN_SUFFIX = "56"; // Firebase password becomes 4-digit + MM (6 chars)

export default function Login() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    setLoading(true);

    const id = employeeId.trim().toUpperCase();
    const p = pin.trim();

    if (!id) {
      setLoading(false);
      return setErr("Employee ID required.");
    }
    if (!/^\d{4}$/.test(p)) {
      setLoading(false);
      return setErr("PIN must be exactly 4 digits.");
    }

    const email = `${id}@mithomitho.com.au`;
    const password = `${p}${PIN_SUFFIX}`; // <-- 4-digit input, 6-char password

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setOk(`Logged in: ${cred.user.email} ✅`);

      // Wait a tiny bit so route guards see auth.currentUser properly
      setTimeout(() => nav("/stores"), 150);
    } catch (e) {
      setErr(e?.code ? `${e.code}` : "Login failed");
      console.error("LOGIN ERROR:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1 className="title">Mitho Inventory</h1>

      <form className="card" onSubmit={onSubmit}>
        <label className="label">Employee ID</label>
        <input
          className="input"
          placeholder="EMP01"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          autoCapitalize="characters"
        />

        <label className="label">4-digit PIN</label>
        <input
          className="input"
          placeholder="1234"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="numeric"
          maxLength={4}
        />

        {err ? <div className="error">{err}</div> : null}
        {ok ? <div style={{ fontSize: 14 }}>{ok}</div> : null}

        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  );
}
