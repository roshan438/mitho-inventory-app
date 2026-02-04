import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFbUser(u);

      // ✅ DEBUG: show who is logged in
      console.log("AUTH USER:", u ? { uid: u.uid, email: u.email } : null);

      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);

        // ✅ DEBUG: show whether profile doc exists
        console.log("PROFILE DOC EXISTS?", snap.exists(), "DOC_ID:", u.uid);

        setProfile(snap.exists() ? snap.data() : null);

        // ✅ DEBUG: show profile data if exists
        if (snap.exists()) {
          console.log("PROFILE DATA:", snap.data());
        } else {
          console.warn("No users/{uid} doc found. Create doc with this ID:", u.uid);
        }
      } catch (err) {
        console.error("FAILED TO READ users/{uid}:", err);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function logout() {
    return signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ fbUser, profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
