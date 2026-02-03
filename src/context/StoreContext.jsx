import React, { createContext, useContext, useEffect, useState } from "react";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [storeId, setStoreId] = useState(() => localStorage.getItem("storeId"));

  useEffect(() => {
    if (storeId) localStorage.setItem("storeId", storeId);
    else localStorage.removeItem("storeId");
  }, [storeId]);

  return (
    <StoreContext.Provider value={{ storeId, setStoreId }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
