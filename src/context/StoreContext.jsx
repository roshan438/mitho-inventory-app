import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { profile, loading } = useAuth();

  const [storeId, setStoreId] = useState(() => localStorage.getItem("storeId"));

  // 🔁 Sync store when profile loads / changes
  useEffect(() => {
    if (loading) return;

    // logout → clear store
    if (!profile) {
      setStoreId(null);
      localStorage.removeItem("storeId");
      return;
    }

    const allowed =
      Array.isArray(profile.storeIds) && profile.storeIds.length
        ? profile.storeIds
        : Array.isArray(profile.allowedStores)
        ? profile.allowedStores
        : [];

    if (allowed.length === 0) {
      setStoreId(null);
      localStorage.removeItem("storeId");
      return;
    }

    // if stored storeId still valid → keep it
    if (storeId && allowed.includes(storeId)) {
      return;
    }

    // else pick default or first allowed
    const next =
      profile.defaultStoreId && allowed.includes(profile.defaultStoreId)
        ? profile.defaultStoreId
        : allowed[0];

    setStoreId(next);
    localStorage.setItem("storeId", next);
  }, [profile, loading]); // intentionally NOT depending on storeId

  // 💾 persist manual changes
  useEffect(() => {
    if (storeId) localStorage.setItem("storeId", storeId);
  }, [storeId]);

  function safeSetStoreId(nextId) {
    if (!profile) return;

    const allowed =
      Array.isArray(profile.storeIds) && profile.storeIds.length
        ? profile.storeIds
        : profile.allowedStores || [];

    if (!allowed.includes(nextId)) {
      console.warn("Attempt to set unauthorized store:", nextId);
      return;
    }

    setStoreId(nextId);
  }

  return (
    <StoreContext.Provider value={{ storeId, setStoreId: safeSetStoreId }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
