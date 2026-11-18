# ⚡ Webhook Echo Spy

A real-time, lightweight HTTP webhook inspector and debugging gateway built with **Node.js**, **Express.js**, and **Server-Sent Events (SSE)**. Designed to capture, inspect, and analyze incoming webhook payloads instantly without heavy infrastructure or paid tools.

## 🚀 Live Demo
* **Live Application:** [https://webhook-echo-spy.onrender.com](https://webhook-echo-spy.onrender.com)

---

## 🛠️ Tech Stack & Architecture
* **Backend:** Node.js, Express.js (REST API & Catch-all routing)
* **Real-Time Communication:** Server-Sent Events (SSE) for zero-latency client updates
* **Frontend:** Tailwind CSS via CDN, Vanilla JavaScript (DOM manipulation & reactive state)
* **Utilities:** `uuid` for secure session generation, `cors` middleware
* **Deployment:** Hosted on Render (Free Tier)

---

## 💡 Key Technical Features
1. **Dynamic Session Isolation:** Generates secure temporary inspection endpoints (`/api/hook/:sessionId`) on the fly.
2. **Catch-All HTTP Routing (`app.all`):** Intercepts any incoming method (GET, POST, PUT, DELETE, PATCH) regardless of payload structure.
3. **Real-Time Event Streaming:** Pushes captured requests instantly from the backend to the frontend dashboard using native Server-Sent Events (SSE) streams rather than inefficient polling.
4. **Deep Payload Inspection:** Parses and displays raw headers, query parameters, method types, timestamps, and formatted JSON bodies.

---

## ⚙️ Local Setup & Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/heyyisha/webhook-echo-spy.git](https://github.com/heyyisha/webhook-echo-spy.git)
   cd webhook-echo-spy