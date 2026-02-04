import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";

export default function useCurrentStoreName() {
  const { storeId } = useStore();
  const [storeName, setStoreName] = useState("");

  useEffect(() => {
    if (!storeId) {
      setStoreName("");
      return;
    }

    const ref = doc(db, "stores", storeId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const name = snap.exists() ? snap.data()?.name : "";
        setStoreName(name || storeId);
      },
      () => setStoreName(storeId)
    );

    return () => unsub();
  }, [storeId]);

  return { storeId, storeName };
}
