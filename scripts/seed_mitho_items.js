import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ONLY Mitho Mitho
const STORE_ID = "mitho_mitho";

// helper doc id
function slug(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Your items (Mitho Mitho only)
const ITEMS = [
  { name: "Chicken momo", category: "menu", unit: "portion", t: 10 },
  { name: "Veg momo", category: "menu", unit: "portion", t: 10 },
  { name: "Buff momo", category: "menu", unit: "portion", t: 10 },
  { name: "Chowmein", category: "menu", unit: "portion", t: 10 },
  { name: "Laphing sheet", category: "condiments", unit: "packet", t: 2 },
  { name: "Laphing jhol", category: "condiments", unit: "bottle", t: 2 },
  { name: "Laphing chilly", category: "menu", unit: "portion", t: 10 },
  { name: "Momo achar", category: "condiments", unit: "bottle", t: 2 },
  { name: "Momo jhol", category: "condiments", unit: "bottle", t: 2 },
  { name: "Piro achar", category: "condiments", unit: "bottle", t: 2 },

  { name: "Coke classic", category: "drinks", unit: "bottle", t: 10 },
  { name: "Coke no sugar", category: "drinks", unit: "bottle", t: 10 },
  { name: "Mountain dew", category: "drinks", unit: "bottle", t: 10 },
  { name: "Sunkist", category: "drinks", unit: "bottle", t: 10 },
  { name: "Solo", category: "drinks", unit: "bottle", t: 10 },
  { name: "Lassi", category: "drinks", unit: "cup", t: 10 },
  { name: "Water", category: "drinks", unit: "bottle", t: 10 },

  { name: "Pani puri", category: "menu", unit: "portion", t: 10 },
  { name: "Pani puri jhol", category: "condiments", unit: "bottle", t: 2 },
  { name: "Wai wai", category: "dry_goods", unit: "packet", t: 2 },
  { name: "Pani puri fillings", category: "prep", unit: "kg", t: 3 },

  { name: "Potato", category: "veg", unit: "kg", t: 3 },
  { name: "Onion", category: "veg", unit: "kg", t: 3 },
  { name: "Capsicum", category: "veg", unit: "kg", t: 3 },
  { name: "Carrot", category: "veg", unit: "kg", t: 3 },
  { name: "Chana", category: "veg", unit: "kg", t: 3 },
  { name: "Green chilli", category: "veg", unit: "kg", t: 3 },
  { name: "Cucumber", category: "veg", unit: "kg", t: 3 },

  { name: "Sausage", category: "protein", unit: "kg", t: 5 },
  { name: "Chicken meat", category: "protein", unit: "kg", t: 5 },
  { name: "Buff meat", category: "protein", unit: "kg", t: 5 },

  { name: "Pani puri masala", category: "dry_goods", unit: "packet", t: 2 },
  { name: "Chat masala", category: "dry_goods", unit: "packet", t: 2 },
  { name: "Salt", category: "dry_goods", unit: "kg", t: 2 },
  { name: "Sugar", category: "dry_goods", unit: "kg", t: 2 },
  { name: "Tea leaves", category: "dry_goods", unit: "packet", t: 2 },
  { name: "Tea masala", category: "dry_goods", unit: "packet", t: 2 },
  { name: "Milk", category: "dairy", unit: "litre", t: 5 },

  { name: "Sweet chilli sauce", category: "condiments", unit: "bottle", t: 2 },
  { name: "Vinegar", category: "condiments", unit: "bottle", t: 2 },
  { name: "Dark soy sauce", category: "condiments", unit: "bottle", t: 2 },
  { name: "Cooking oil", category: "cooking", unit: "litre", t: 5 },
];

async function run() {
  // ensure store doc exists
  await db.collection("stores").doc(STORE_ID).set(
    { name: "Mitho Mitho", active: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  const itemsRef = db.collection("stores").doc(STORE_ID).collection("items");
  const batch = db.batch();

  ITEMS.forEach((it, idx) => {
    const id = slug(it.name);
    batch.set(
      itemsRef.doc(id),
      {
        name: it.name,
        category: it.category,
        defaultUnit: it.unit,
        lowStockThreshold: it.t,
        isActive: true,
        sortOrder: (idx + 1) * 10,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();
  console.log(`✅ Seeded ${ITEMS.length} items into stores/${STORE_ID}/items`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
