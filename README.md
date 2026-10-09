# DropWise – Smart Water Management System
> *"See the Flow. Spot the Problem. Save the Water."*

[![Hackathon Ready](https://img.shields.io/badge/Status-Hackathon--Ready-00e5ff?style=flat-square)](#)
[![Stack](https://img.shields.io/badge/Stack-Vanilla_JS_•_HTML5_•_CSS3_•_Chart.js-0284c7?style=flat-square)](#)
[![AI Engine](https://img.shields.io/badge/AI-Google_Gemini_1.5_Flash-a855f7?style=flat-square)](#)
[![Offline Fallback](https://img.shields.io/badge/Engine-Offline_Heuristic_Fallback-10b981?style=flat-square)](#)

---

## 1. Project Overview & Problem Statement

### The Problem
Water scarcity and silent infrastructure waste pose critical challenges in residential buildings, student hostels, and multi-tenant apartments:
- **Unnoticed Pipe Ruptures & Faulty Flush Valves:** A silent toilet flapper leak or hairline pipe crack can leak 15–20 litres every minute, squandering over 20,000 litres within 24 hours before anyone notices.
- **Overhead Tank Overflows & Dry Runs:** Unmonitored overhead tanks frequently overflow, damaging roof waterproofing and wasting pumped municipal water. Conversely, unexpected dry tanks disrupt daily routines.
- **Lack of Actionable Usage Intelligence:** Residents only receive a monthly utility bill without real-time visibility into usage spikes, conservation targets, or rainwater collection potential.

### The DropWise Solution
**DropWise** is a smart water operating system and monitoring dashboard designed for domestic and commercial facilities. It combines real-time simulated telemetry, automated multi-strike leak detection, smart threshold alarms, Google Gemini-powered water-saving intelligence, and a rainwater harvesting calculator into an intuitive, high-performance web application.

> **Important Demo Notice:** DropWise currently operates in **Simulation Mode** using mathematically modeled sensors. It provides a software prototype for demonstration and does not claim to be physically wired to live plumbing or real pump motors.

---

## 2. Key Features

- **Dynamic Overhead Tank Visualization:**
  - Real-time 3D-styled cylindrical tank vessel with glass reflections.
  - Multi-layered parallax wave animations and rising aeration bubbles during pump operation.
  - Fluid level transitions with low-water (≤20%) and overflow-risk (≥90%) visual states.
  - Center readout badge displaying instantaneous percentage and available litres.
- **Differential Sensor Simulation:**
  - True elapsed-time volumetric updates every 2 seconds.
  - Accurate conversion from litres/minute to fractional litres consumed per 2s tick.
  - Dynamic inflow/outflow balance based on pump state and simulated domestic activity.
- **3-Strike Anomaly Leak Detection:**
  - Threshold-based continuous flow monitoring (default baseline: 15.0 L/min).
  - Requires **3 consecutive abnormal readings** before triggering a "Possible Leak Detected" alert, eliminating false alarms from brief faucet use.
- **Dedicated Cooldown Alarms:**
  - 10-second cooldown guards per alert channel (Low Water, Overflow, Leak) preventing notification spam.
  - Dismissible alert feed with severity indicators and actionable guidance.
- **Live Rolling Flow Analytics:**
  - High-performance Chart.js line graph tracking a rolling buffer of 30 readings.
  - Updates seamlessly every 2 seconds without recreating chart instances.
- **Dual-Tier AI Water Advisor:**
  - **Live Tier:** Direct integration with Google Gemini 1.5 Flash via structured prompt payloads.
  - **Offline Fallback Tier:** Built-in heuristic expert rule engine that activates automatically if an API key is absent, times out, or experiences a network error.
- **Rainwater Harvesting Calculator:**
  - Interactive volumetric estimator based on the formula: $\text{Harvest} = \text{Area (m²)} \times \text{Rainfall (mm)} \times \text{Efficiency}$.
  - One-click building presets, tank fill multiples, and municipal cost savings estimates.
- **Deterministic Hackathon Demo Scenarios:**
  - One-click triggers for **Normal Flow**, **Low Water (≤20%)**, **Overflow (≥90%)**, and **Burst Leak (≥15 L/min)** for reliable evaluation by hackathon judges.

---

## 3. Technology Stack

- **Structure:** Semantic HTML5 (accessible headers, cards, dialogs, forms).
- **Styling:** Modern Vanilla CSS3 (Custom properties, dark mode glassmorphism, responsive CSS grid/flexbox, SVG/CSS keyframe wave animations).
- **Application Logic:** Vanilla JavaScript (ES6+ modular architecture, zero frameworks, clean separation of state and DOM rendering).
- **Visual Analytics:** [Chart.js 4.4.2](https://www.chartjs.org/) via CDN.
- **AI Intelligence:** [Google Gemini API](https://ai.google.dev/) (`gemini-1.5-flash`).
- **Icons & Typography:** Font Awesome 6.5.1 and Google Fonts (Outfit & JetBrains Mono).
- **Persistence:** Browser `localStorage` (strictly for API key and user preferences; zero sensitive data transmitted to external servers).

---

## 4. Project Folder Structure

```
DropWise/
├── index.html        # Main dashboard UI, views, modal dialogues & layout
├── style.css         # Complete styling, dark theme, glassmorphism & wave animations
├── app.js            # Central state, 2s simulation engine, leak algorithm, Chart.js & controls
├── ai.js             # Google Gemini API integration and offline heuristic recommendation fallback
└── README.md         # Comprehensive project documentation and test verification guide
```

---

## 5. How to Run the Application Locally

DropWise has zero dependencies and requires no build steps or backend servers.

### Option A: Direct Browser Launch (Simplest)
1. Navigate to the `DropWise` project directory in your file explorer.
2. Double-click `index.html` (or right-click $\rightarrow$ **Open with Google Chrome / Microsoft Edge / Firefox**).
3. The dashboard will immediately load with simulated sensors active.

### Option B: Local Development Server (Recommended for Chart/CDN performance)
Using Python (pre-installed on most machines):
```bash
# Inside c:\Users\Admin\DropWise
python -m http.server 8000
```
Then open `http://localhost:8000` in your web browser.

Alternatively, using Node.js:
```bash
npx serve .
```

---

## 6. Sensor Simulator Engine Mechanics

The simulator in [`app.js`](file:///c:/Users/Admin/DropWise/app.js) executes a deterministic physics loop every 2,000 milliseconds:

### Volumetric Math
$$\Delta t = \frac{\text{CurrentTime} - \text{LastTickTime}}{1000} \quad (\text{seconds})$$

$$\text{Outflow Volume (Litres)} = \text{FlowRate} \times \left(\frac{\Delta t}{60}\right)$$

$$\text{Inflow Volume (Litres)} = \text{PumpInflowRate} \times \left(\frac{\Delta t}{60}\right) \quad (\text{if Pump is ON, else } 0)$$

$$\text{New Water Available} = \text{clamp}\Big(\text{WaterAvailable} + (\text{Inflow Volume} - \text{Outflow Volume}),\, 0,\, \text{TankCapacity}\Big)$$

$$\text{Tank Level (\%)} = \left(\frac{\text{WaterAvailable}}{\text{TankCapacity}}\right) \times 100$$

- **Elapsed Time Accounting:** The loop calculates actual elapsed time between ticks. If the browser tab pauses or stutters, it avoids cumulative integration errors.
- **Daily Usage:** Only outflow increases the cumulative daily usage counter.

---

## 7. Leak Detection Algorithm

DropWise implements an understandable, false-positive-resistant threshold filter:

1. **Baseline Threshold:** Normal household consumption operates between $0.8$ and $7.5\text{ L/min}$. Any reading $\ge 15.0\text{ L/min}$ is flagged as abnormal.
2. **The 3-Strike Rule:** A single momentary spike (e.g. flushing two toilets simultaneously) will not trigger an alarm. The simulator tracks `consecutiveAbnormalReadings`.
3. **Trigger Event:** Only when `consecutiveAbnormalReadings >= 3` (minimum 6 continuous seconds of abnormal flow) does DropWise elevate status to **"Possible Leak Detected"**.
4. **Auto-Reset:** The moment flow drops below $15.0\text{ L/min}$, the consecutive counter is immediately reset to 0 and the warning is resolved.
5. **Cooldown Guard:** Once triggered, a 10-second cooldown timer prevents duplicate alert entries from spamming the log during sustained leaks.

---

## 8. Google Gemini AI & Offline Fallback Architecture

### Security First
- **No Hardcoded Keys:** Source files never contain embedded Gemini API keys.
- **Client-Side Storage:** Keys configured in the **AI Key & Settings** modal are stored strictly within the user's browser `localStorage` (`dropwise_gemini_api_key`).
- **Production Note:** In a commercial enterprise release, client-side API keys must be replaced with a secured backend gateway or proxy server.

### Offline Fallback Engine
If no Gemini API key is configured, or if an API call times out ($>8\text{ seconds}$), DropWise automatically engages its offline expert rule heuristics:
- **Leak Detected:** Recommends isolating main stopcocks, inspecting toilet flappers, and verifying pump circuit safety.
- **Low Water ($\le 20\%$):** Recommends postponing high-demand laundry cycles, scheduling pump refills during peak municipal pressure, and prioritizing sanitation.
- **Overflow Risk ($\ge 90\%$):** Recommends disengaging the pump, checking mechanical float valves, and verifying unobstructed overflow warning pipes.
- **Normal Flow:** Provides domestic water stewardship and weekly static flow audit recommendations.

Every recommendation card transparently displays its origin badge: **"Google Gemini 1.5 Flash"** or **"Offline Expert Rules"**.

---

## 9. Rainwater Harvesting Calculator

Located under the **Rainwater Calc** tab, the calculator uses the standard hydrological yield equation:

$$\text{Harvestable Yield (Litres)} = \text{Roof Catchment Area (m²)} \times \text{Rainfall Event (mm)} \times \text{Collection Efficiency (\eta)}$$

- **Default Efficiency ($\eta$):** $0.80$ ($80\%$), accounting for first-flush divergence, roof texture absorption, and gutter overflow.
- **Equivalence Analysis:** Automatically computes how many full 2,000L DropWise tanks the rainfall would replenish, days of household supply provided, and monetary savings.

---

## 10. Comprehensive Verification & Testing Guide

To verify all 21 hackathon evaluation criteria:

| # | Test Criteria | Verification Action | Expected Result |
|---|---|---|---|
| 1 | Dashboard loads successfully | Open `index.html` in browser | Clean dark theme layout loads with sidebar, KPIs, tank, and live chart. |
| 2 | All summary values appear | Check top KPI cards | Tank Level (72%), Water Available (1,440L), Usage Today, Flow Rate, Pump State appear. |
| 3 | Tank animation matches percentage | Observe animated tank vessel | Water level sits at 72% height; waves animate at surface; readout matches. |
| 4 | Simulated readings update every 2s | Watch Flow Rate and clock | Flow updates every 2 seconds; clock ticks live. |
| 5 | Water availability calculated | Check Available vs Capacity | $2000 \times 72\% = 1440\text{ Litres}$ matches accurately. |
| 6 | Usage accounts for elapsed time | Observe "Today's Usage" | Usage increments by $\approx 0.1$–$0.2\text{ L}$ per 2s tick, NOT by whole minutes. |
| 7 | Live chart updates without recreation | Observe Chart.js widget | Line shifts smoothly with new points; canvas is not destroyed or recreated. |
| 8 | Low-water alert triggers $\le 20\%$ | Click **Force Low Water (≤20%)** | Tank drops to 18%; tank turns red; "Low Water Level Warning" alert & toast appear. |
| 9 | Overflow-risk triggers $\ge 90\%$ | Click **Force Overflow (≥90%)** | Tank fills to 92%; pump starts; tank turns amber; "Overflow Risk Warning" triggers. |
| 10 | 3-strike leak detection | Click **Simulate Leak** | Flow spikes to $>18\text{ L/min}$; strike counter counts $1 \rightarrow 2 \rightarrow 3$; "Possible Leak" alert triggers. |
| 11 | Per-alert cooldown | Observe alerts during leak | Duplicate alerts are throttled by the 10-second cooldown window. |
| 12 | Simulate Leak works | Click **Simulate Leak** | Abnormal flow displays on live chart with red dashed threshold line. |
| 13 | Stop Leak Simulation works | Click **Stop Leak Simulation** | Flow normalizes ($<7\text{ L/min}$); leak badge returns to normal. |
| 14 | Reset restores starting state | Click **Reset Simulation** | Tank returns to 72%; alerts clear; chart resets to nominal baseline. |
| 15 | Pause and Resume works | Click **Pause Monitoring** | Sensor clock halts; click **Resume Monitoring** to restart. |
| 16 | Gemini integration works | Enter API key in Settings modal | Generates 3 custom AI recommendations tagged with "Google Gemini 1.5 Flash". |
| 17 | Offline recommendations work | Remove key / use default | Generates 3 expert rule recommendations tagged with "Offline Expert Rules". |
| 18 | Rainwater calculator works | Enter $100\text{ m}^2$, $50\text{ mm}$, $0.8$ | Yields exactly $4,000\text{ Litres}$ ($2.0\times$ tanks filled). |
| 19 | All navigation links work | Click tabs in sidebar | Seamlessly switches between Dashboard, Analytics, Alerts, Advisor, Rainwater, and About. |
| 20 | Desktop & mobile responsive | Resize window / test mobile view | Hamburger menu toggles drawer; cards stack cleanly; tank scales properly. |
| 21 | Zero browser console errors | Open F12 DevTools Console | No syntax errors, unhandled exceptions, or missing asset 404s. |

---

## 11. Current Limitations & Hardware Transition Roadmap

### Current Prototype Limitations
- **Sensor Telemetry:** Readings are synthesized mathematically using JavaScript intervals.
- **Actuation:** Pump toggling affects simulated state but cannot mechanically energize a motor.

### Physical IoT Deployment Blueprint
To convert DropWise into an industrial-grade hardware deployment:

```
[ Overhead Tank ]
       │
       ├─► Waterproof Ultrasonic Sensor (JSN-SR04T) ──┐
       │                                              │
[ Outlet Pipe ]                                       ├──► ESP32 Microcontroller
       │                                              │         (MQTT over Wi-Fi/LTE)
       └─► Turbine Flow Meter (YF-S201 Hall-Effect) ──┘                  │
                                                                         ▼
[ Water Pump 230V ] ◄── 30A Solid-State Relay Module ◄────── Cloud Backend / Broker
```

1. **Microcontroller:** ESP32-WROOM-32 with hardware watchdog and OTA firmware updates.
2. **Liquid Depth:** JSN-SR04T ultrasonic sensor mounted to tank inspection hatch or submersible 4–20mA hydrostatic pressure transducer.
3. **Flow Monitoring:** YF-S201 Hall-effect turbine pulse sensor installed on main building riser.
4. **Pump Interlock:** Optocoupler-isolated 30A industrial relay with mechanical float-switch cutoff wired in series as an emergency fail-safe.
5. **Protocol:** Lightweight JSON over MQTT with TLS encryption.

---

## 12. Security & Production Guidelines

- **Frontend API Key Limitation:** Directly calling Google Gemini from browser JavaScript exposes the API key to users with access to browser developer tools.
- **Production Architecture:** For a public or multi-tenant production environment:
  1. Route all AI recommendation requests through an authenticated backend server (Node.js/Express, Python/FastAPI, or Cloud Functions).
  2. Maintain the Google Gemini API key as a protected server-side environment secret.
  3. Implement token rate limiting and CORS protection.

---

## 13. License & Hackathon Attribution

Developed for collegiate and hackathon presentation demonstrating smart cities and IoT water stewardship.

*DropWise: See the Flow. Spot the Problem. Save the Water.*
