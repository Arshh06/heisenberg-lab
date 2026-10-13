/**
 * ============================================================================
 * HEISENBERG LAB SUPPLY INTELLIGENCE - FIREBASE CLOUD CONFIGURATION
 * ============================================================================
 * 
 * ARCHITECTURE:
 * User -> Firebase Hosting -> Web Application (Vanilla JS) -> Cloud Firestore
 * 
 * FREE TIER (SPARK PLAN) ₹0 COMPLIANCE:
 * - Uses Firebase Cloud Firestore (Direct Web SDK v10 Modular CDN)
 * - No Cloud Functions (All Inventory Intelligence computed in client JS)
 * - No Blaze Plan / No Credit Card required
 * 
 * INSTRUCTIONS FOR VIVA / LAB EVALUATION:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new Firebase project (e.g., "heisenberg-lab-sim")
 * 3. In the project dashboard, add a "Web App" (</>)
 * 4. Enable Cloud Firestore in "Test Mode" (or using firestore.rules)
 * 5. Copy your firebaseConfig object and replace the placeholder below.
 * ============================================================================
 */

// Import Firebase Modular SDK from CDN (Version 10.12.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  runTransaction 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Default Firebase Project Configuration (API key loaded securely from untracked firebase-env.js)
const baseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "heisenberg-6d136.firebaseapp.com",
  projectId: "heisenberg-6d136",
  storageBucket: "heisenberg-6d136.firebasestorage.app",
  messagingSenderId: "841517689560",
  appId: "1:841517689560:web:75636e0729cff60d4305ad",
  measurementId: "G-4CLT85T11V"
};

// Overlay local environment configuration if provided via untracked firebase-env.js
const localEnv = (typeof window !== "undefined" && window.__FIREBASE_ENV__) || {};
export const firebaseConfig = {
  ...baseConfig,
  ...localEnv
};

/**
 * Determine if current config is using placeholders or real Firebase keys
 */
export function isPlaceholderConfig(config = firebaseConfig) {
  return (
    !config.apiKey ||
    config.apiKey.includes("YOUR_") ||
    config.projectId === "heisenberg-lab-demo"
  );
}

// Global cloud state container
let app = null;
let db = null;
let isCloudActive = false;

// Try initializing Firebase
try {
  if (!isPlaceholderConfig()) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isCloudActive = true;
    console.log("%c[HEISENBERG CLOUD] Firebase Cloud Firestore Connected successfully.", "color: #00f5a0; font-weight: bold;");
  } else {
    console.warn("%c[HEISENBERG CLOUD] Running in Local Simulation Mode. To connect Live Firebase, update firebase-config.js with your project credentials.", "color: #ffb703; font-weight: bold;");
  }
} catch (err) {
  console.error("[HEISENBERG CLOUD] Error initializing Firebase:", err);
  isCloudActive = false;
}

/**
 * Fallback Local Simulation Store (localStorage backed)
 * Ensures the project works 100% reliably in local testing & college viva
 * even before Firebase keys are provisioned.
 */
const STORAGE_PREFIX = "heisenberg_lab_";

const LocalStore = {
  getCollection(collName) {
    const raw = localStorage.getItem(STORAGE_PREFIX + collName);
    return raw ? JSON.parse(raw) : [];
  },
  saveCollection(collName, items) {
    localStorage.setItem(STORAGE_PREFIX + collName, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(`localstore_${collName}_updated`, { detail: items }));
  },
  addItem(collName, item) {
    const items = this.getCollection(collName);
    const id = item.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();
    const newItem = { ...item, id };
    if (collName === "transactions") {
      if (!newItem.timestamp) newItem.timestamp = now;
    } else {
      if (!newItem.createdAt) newItem.createdAt = now;
      if (!newItem.updatedAt) newItem.updatedAt = now;
    }
    items.unshift(newItem);
    this.saveCollection(collName, items);
    return newItem;
  },
  updateItem(collName, id, updates) {
    const items = this.getCollection(collName);
    const index = items.findIndex(i => i.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
      this.saveCollection(collName, items);
      return items[index];
    }
    return null;
  },
  deleteItem(collName, id) {
    let items = this.getCollection(collName);
    items = items.filter(i => i.id !== id);
    this.saveCollection(collName, items);
  }
};

/**
 * ============================================================================
 * UNIFIED DATA ACCESS LAYER (DAL)
 * Seamlessly routes requests to Firebase Firestore or Local Simulation Store
 * ============================================================================
 */

export const CloudService = {
  isLive: () => isCloudActive,

  /**
   * Subscribe to real-time updates for any collection
   */
  subscribe(collectionName, callback, orderByField = "createdAt", orderDirection = "desc") {
    if (isCloudActive && db) {
      try {
        const collRef = collection(db, collectionName);
        const q = query(collRef);
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const items = [];
          snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
          });
          callback(items);
        }, (error) => {
          console.error(`[Cloud Firestore] Subscription error for ${collectionName}:`, error);
          // Fallback to local storage if network or permission error occurs
          callback(LocalStore.getCollection(collectionName));
        });
        return unsubscribe;
      } catch (e) {
        console.warn(`[Cloud Firestore] Falling back to local subscriber for ${collectionName}`, e);
      }
    }

    // Local Simulation subscriber
    const emit = () => callback(LocalStore.getCollection(collectionName));
    emit();

    const handler = () => emit();
    window.addEventListener(`localstore_${collectionName}_updated`, handler);
    return () => window.removeEventListener(`localstore_${collectionName}_updated`, handler);
  },

  /**
   * Fetch one-time snapshot of a collection
   */
  async getCollection(collectionName) {
    if (isCloudActive && db) {
      try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        const items = [];
        querySnapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() });
        });
        return items;
      } catch (err) {
        console.warn(`[Cloud Firestore] Failed to get docs for ${collectionName}, using local fallback:`, err);
      }
    }
    return LocalStore.getCollection(collectionName);
  },

  /**
   * Add a new document
   */
  async addDocument(collectionName, data) {
    if (isCloudActive && db) {
      try {
        const payload = { ...data };
        if (collectionName === "transactions") {
          // Canonical timestamp for transactions without duplicate createdAt
          if (!payload.timestamp) {
            payload.timestamp = new Date().toISOString();
          }
        } else if (!payload.createdAt) {
          payload.createdAt = new Date().toISOString();
        }
        const docRef = await addDoc(collection(db, collectionName), payload);
        return { id: docRef.id, ...payload };
      } catch (err) {
        console.error(`[Cloud Firestore] addDoc error:`, err);
        throw err;
      }
    }
    return LocalStore.addItem(collectionName, data);
  },

  /**
   * Update an existing document
   */
  async updateDocument(collectionName, docId, updates) {
    if (isCloudActive && db) {
      try {
        const docRef = doc(db, collectionName, docId);
        const payload = {
          ...updates,
          updatedAt: new Date().toISOString()
        };
        await updateDoc(docRef, payload);
        return { id: docId, ...payload };
      } catch (err) {
        console.error(`[Cloud Firestore] updateDoc error:`, err);
        throw err;
      }
    }
    return LocalStore.updateItem(collectionName, docId, updates);
  },

  /**
   * Delete a document
   */
  async deleteDocument(collectionName, docId) {
    if (isCloudActive && db) {
      try {
        await deleteDoc(doc(db, collectionName, docId));
        return true;
      } catch (err) {
        console.error(`[Cloud Firestore] deleteDoc error:`, err);
        throw err;
      }
    }
    LocalStore.deleteItem(collectionName, docId);
    return true;
  },

  /**
   * Create document with custom ID atomically, ensuring it does NOT already exist (Prevents Overwrites & Race Conditions)
   */
  async createDocument(collectionName, docId, data) {
    if (isCloudActive && db) {
      try {
        const docRef = doc(db, collectionName, docId);
        const result = await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(docRef);
          if (docSnap.exists()) {
            const err = new Error(`Document '${docId}' already exists in collection '${collectionName}'. Overwrite prevented.`);
            err.code = "already-exists";
            throw err;
          }
          const payload = {
            ...data,
            id: docId,
            ...(collectionName !== "transactions" && !data.createdAt ? { createdAt: new Date().toISOString() } : {})
          };
          transaction.set(docRef, payload);
          return payload;
        });
        return result;
      } catch (err) {
        if (err.code !== "already-exists") {
          console.error(`[Cloud Firestore] createDocument error:`, err);
        }
        throw err;
      }
    }
    const items = LocalStore.getCollection(collectionName);
    if (items.some(i => i.id === docId)) {
      const err = new Error(`Document '${docId}' already exists in local collection '${collectionName}'. Overwrite prevented.`);
      err.code = "already-exists";
      throw err;
    }
    const payload = {
      ...data,
      id: docId,
      ...(collectionName !== "transactions" && !data.createdAt ? { createdAt: new Date().toISOString() } : {})
    };
    items.unshift(payload);
    LocalStore.saveCollection(collectionName, items);
    return { id: docId, ...payload };
  },

  /**
   * Set custom document with specific ID (used during Seeding)
   */
  async setDocument(collectionName, docId, data) {
    if (isCloudActive && db) {
      try {
        await setDoc(doc(db, collectionName, docId), data, { merge: true });
        return { id: docId, ...data };
      } catch (err) {
        console.error(`[Cloud Firestore] setDoc error:`, err);
      }
    }
    const existing = LocalStore.getCollection(collectionName);
    const idx = existing.findIndex(i => i.id === docId);
    if (idx !== -1) {
      existing[idx] = { ...existing[idx], ...data, id: docId };
    } else {
      existing.unshift({ ...data, id: docId });
    }
    LocalStore.saveCollection(collectionName, existing);
    return { id: docId, ...data };
  },

  /**
   * Clear all simulated local collections (useful for resetting demonstration)
   */
  resetLocalData() {
    ['chemicals', 'suppliers', 'transactions', 'alerts'].forEach(coll => {
      localStorage.removeItem(STORAGE_PREFIX + coll);
      window.dispatchEvent(new CustomEvent(`localstore_${coll}_updated`, { detail: [] }));
    });
  }
};
