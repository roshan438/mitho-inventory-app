const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper: only admins can call admin functions.
 * Admin status comes from Firestore: users/{uid}.role === "admin"
 */
async function assertAdmin(context) {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }

  const uref = db.collection("users").doc(context.auth.uid);
  const usnap = await uref.get();
  const role = usnap.exists ? usnap.data()?.role : null;

  if (role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }

  return { uid: context.auth.uid, profile: usnap.data() || {} };
}

/**
 * ✅ Admin creates a store
 * data: { storeId, storeName }
 */
exports.createStore = functions.https.onCall(async (data, context) => {
  await assertAdmin(context);

  const storeId = String(data?.storeId || "").trim();
  const storeName = String(data?.storeName || "").trim();

  if (!storeId) {
    throw new functions.https.HttpsError("invalid-argument", "storeId is required.");
  }

  // storeId allowed chars (safe for doc ids)
  if (!/^[a-z0-9_-]{3,40}$/i.test(storeId)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "storeId must be 3–40 chars: letters/numbers/_- only."
    );
  }

  const ref = db.collection("stores").doc(storeId);
  const snap = await ref.get();
  if (snap.exists) {
    throw new functions.https.HttpsError("already-exists", "Store already exists.");
  }

  await ref.set({
    storeId,
    storeName: storeName || storeId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    isActive: true,
  });

  return { ok: true, storeId };
});

/**
 * ✅ Admin creates an employee
 * data: { storeId, employeeId, name, pin }
 *
 * We create a Firebase Auth user with a generated email:
 * employeeId@storeId.local
 *
 * Password = pin (you can change later)
 *
 * We also create Firestore profile: users/{uid}
 */
exports.createEmployee = functions.https.onCall(async (data, context) => {
  await assertAdmin(context);

  const storeId = String(data?.storeId || "").trim();
  const employeeId = String(data?.employeeId || "").trim();
  const name = String(data?.name || "").trim();
  const pin = String(data?.pin || "").trim();

  if (!storeId || !employeeId || !pin) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "storeId, employeeId, and pin are required."
    );
  }

  if (!/^[a-z0-9_-]{3,40}$/i.test(storeId)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid storeId format.");
  }

  // simple employeeId rules (you can adjust)
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(employeeId)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "employeeId must be 3–20 chars: letters/numbers/_- only."
    );
  }

  // pin rule: 4 digits
  if (!/^\d{4}$/.test(pin)) {
    throw new functions.https.HttpsError("invalid-argument", "PIN must be exactly 4 digits.");
  }

  // ensure store exists
  const storeRef = db.collection("stores").doc(storeId);
  const storeSnap = await storeRef.get();
  if (!storeSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Store not found.");
  }

  const email = `${employeeId.toLowerCase()}@${storeId.toLowerCase()}.local`;

  // create auth user
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password: pin,
      displayName: name || employeeId,
      disabled: false,
    });
  } catch (e) {
    // duplicate email = employee already exists
    if (String(e?.message || "").toLowerCase().includes("email")) {
      throw new functions.https.HttpsError("already-exists", "Employee already exists.");
    }
    throw new functions.https.HttpsError("internal", e?.message || "Failed to create auth user.");
  }

  // Create user profile doc used by your app
  await db.collection("users").doc(userRecord.uid).set(
    {
      role: "employee",
      storeId,
      storeIds: [storeId], // future multi-store
      employeeId,
      name: name || employeeId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true,
    },
    { merge: true }
  );

  return {
    ok: true,
    uid: userRecord.uid,
    email,
    tempPassword: pin,
  };
});

/**
 * ✅ Admin can grant another admin multi-store access
 * data: { targetUid, storeIds: [] }
 */
exports.setAdminStores = functions.https.onCall(async (data, context) => {
  await assertAdmin(context);

  const targetUid = String(data?.targetUid || "").trim();
  const storeIds = Array.isArray(data?.storeIds) ? data.storeIds.map(String) : [];

  if (!targetUid || storeIds.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "targetUid and storeIds required.");
  }

  await db.collection("users").doc(targetUid).set(
    {
      role: "admin",
      storeIds: storeIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});
