# Cloud Deployment & Firebase Guide

## Breaking Bad Heisenberg: Chemical Lab Supply Intelligence

This step-by-step guide explains how to test the application locally, create a free Firebase project, connect Cloud Firestore, and deploy to Firebase Hosting under the ₹0 Spark Plan.

---

## Part 1: Local Testing (Immediate ₹0 Execution)

The project has a built-in **Dual-Mode Data Layer**. You can run and demonstrate the full dashboard immediately without configuring anything!

1. Open your terminal in the project directory:
   ```bash
   cd C:\Users\binoy\.gemini\antigravity-ide\scratch\heisenberg-lab
   ```

2. Start a simple local HTTP server (using Python or Node.js):
   ```bash
   # Using Python 3
   python -m http.server 8080

   # Or using Node's npx http-server
   npx -y http-server . -p 8080
   ```

3. Open your browser and navigate to:
   `http://localhost:8080`

4. Click **⚡ Seed Sample Lab Data** to populate realistic educational records and test all features:
   - View stock status badges (Normal, Low, Critical, Expiring Soon).
   - Perform **Stock IN** and **Stock OUT** transactions.
   - Verify negative stock prevention on overdrawing.
   - Inspect automated reorder recommendations and real-time alerts.

---

## Part 2: Creating Your Free Google Firebase Project

Follow these steps to connect your project to live **Google Cloud Firestore**:

1. **Sign in to Firebase Console:**
   - Go to [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Sign in with your Google account.

2. **Create a New Project:**
   - Click **Add project** (or **Create a project**).
   - Project Name: `heisenberg-lab-sim` (or any unique name).
   - Google Analytics: Optional (can disable for faster setup).
   - Click **Create project**. Ensure the billing plan remains on the default **Spark Plan (Free - $0/month)**.

3. **Register a Web App:**
   - On the Project Overview page, click the **Web icon (`</>`)**.
   - App nickname: `Heisenberg Lab Web`.
   - Leave "Also set up Firebase Hosting" checked or unchecked (we will configure via CLI).
   - Click **Register app**.

4. **Copy Firebase Config Object:**
   - Firebase will display a snippet containing `firebaseConfig`.
   - Copy the configuration object:
     ```javascript
     const firebaseConfig = {
       apiKey: "YOUR_FIREBASE_API_KEY",
       authDomain: "heisenberg-lab-sim.firebaseapp.com",
       projectId: "heisenberg-lab-sim",
       storageBucket: "heisenberg-lab-sim.appspot.com",
       messagingSenderId: "1234567890",
       appId: "1:1234567890:web:abcdef..."
     };
     ```

5. **Enable Cloud Firestore Database:**
   - In the left sidebar, navigate to **Build > Firestore Database**.
   - Click **Create database**.
   - Location: Choose a location closest to you (e.g., `asia-south1` or `nam5`).
   - Security Rules: Select **Start in test mode** (allows read/write during development) or apply the provided `firestore.rules`.
   - Click **Enable**.

6. **Update `firebase-config.js`:**
   - Open [firebase-config.js](file:///C:/Users/binoy/.gemini/antigravity-ide/scratch/heisenberg-lab/firebase-config.js) in this project folder.
   - Replace the placeholder object with your copied `firebaseConfig`.
   - Save the file and reload your browser.
   - The top badge will turn green: **Cloud Firestore Live**!

---

## Part 3: Deploying to Firebase Hosting

Deploy your application globally to Google's fast Content Delivery Network (CDN):

1. **Install Firebase CLI (if not already installed):**
   ```bash
   npm install -g firebase-tools
   ```

2. **Log in to Firebase:**
   ```bash
   firebase login
   ```

3. **Initialize Firebase in the project folder:**
   ```bash
   cd C:\Users\binoy\.gemini\antigravity-ide\scratch\heisenberg-lab
   firebase use --add
   ```
   - Select your project from the list and give it the alias `default`.

4. **Deploy Application to the Cloud:**
   ```bash
   firebase deploy
   ```

5. **Access Your Live Cloud Application:**
   - Upon successful deployment, Firebase CLI provides your live URL:
     `https://heisenberg-lab-sim.web.app` or `https://heisenberg-lab-sim.firebaseapp.com`
   - Test the live deployment in your browser!

---

## Part 4: Cloud Verification Checklist

| Check | Expected Result | Verified |
| :--- | :--- | :--- |
| **Hosting Deployment** | Application loads over secure HTTPS with custom domain / `.web.app` | [ ] |
| **Firestore CRUD** | Stock IN / OUT updates reflect directly in Firebase Console data explorer | [ ] |
| **Spark Plan ₹0 Check** | Usage remains strictly 0 cost in Firebase billing dashboard | [ ] |
| **Multi-tab Sync** | Changes in one browser tab reflect instantly in another tab | [ ] |
