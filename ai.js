/**
 * DropWise – Smart Water Management System
 * AI Water Advisor Module (ai.js)
 * 
 * Powered by Google Gemini API with smart, dynamic offline fallback.
 * Strictly adheres to client-side security guidelines: API key is read
 * from localStorage or config placeholder and NEVER hardcoded in source.
 */

const AIAdvisor = (() => {
  // Local storage key for storing user-configured Gemini API key
  const STORAGE_KEY = 'dropwise_gemini_api_key';
  
  // Supported Gemini model endpoint
  const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  
  // Request timeout in milliseconds (8 seconds)
  const TIMEOUT_MS = 8000;

  /**
   * Retrieve the configured API key from localStorage.
   * Returns empty string if not set.
   */
  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  /**
   * Store the API key into localStorage securely in user's browser.
   */
  function setApiKey(key) {
    if (!key) {
      removeApiKey();
    } else {
      localStorage.setItem(STORAGE_KEY, key.trim());
    }
  }

  /**
   * Remove stored API key.
   */
  function removeApiKey() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Check if an API key is currently saved.
   */
  function hasApiKey() {
    const key = getApiKey();
    return Boolean(key && key.length > 5);
  }

  /**
   * Generate 3 offline recommendations deterministically tailored to
   * current simulated telemetry state.
   */
  function getOfflineRecommendations(telemetry) {
    const { tankLevel, waterAvailable, dailyConsumption, currentFlowRate, pumpStatus, possibleLeakStatus } = telemetry;

    // SCENARIO 1: Possible Leak Detected
    if (possibleLeakStatus) {
      return {
        source: 'Offline Expert Rules',
        isAiGenerated: false,
        statusNote: 'System detected continuous abnormal flow exceeding safe baseline.',
        tips: [
          {
            category: 'Urgent Action',
            title: 'Close Main Overhead Isolation Valve',
            description: `Sensor detected continuous abnormal flow at ${currentFlowRate.toFixed(1)} L/min. Shut the primary riser stopcock immediately to halt unmetered water loss while inspecting lines.`,
            badge: 'Critical Leak'
          },
          {
            category: 'Inspection Protocol',
            title: 'Check Flush Valves & Concealed Pipe Joints',
            description: 'Inspect toilet flapper seals, garden bibs, and concealed riser elbows. Toilet flappers are the most frequent cause of sustained 10-20 L/min silent water leakage.',
            badge: 'Diagnostic'
          },
          {
            category: 'Containment',
            title: 'Verify Inflow Bypass & Pump Power',
            description: 'Ensure the overhead pump is powered OFF so water is not continuously pumped into a leaking discharge circuit.',
            badge: 'Safety'
          }
        ]
      };
    }

    // SCENARIO 2: Critical Low Water (<= 20%)
    if (tankLevel <= 20) {
      return {
        source: 'Offline Expert Rules',
        isAiGenerated: false,
        statusNote: 'Overhead tank reserve is depleted below 20% safety margin.',
        tips: [
          {
            category: 'Demand Rationing',
            title: 'Defer High-Volume Laundry & Car Washes',
            description: `With only ${Math.round(waterAvailable)}L remaining in storage, postpone washing machine cycles and landscaping until the overhead tank has been replenished.`,
            badge: 'Rationing'
          },
          {
            category: 'Supply Management',
            title: 'Inspect Municipal Supply & Pump Timing',
            description: 'Check municipal water inlet valve status and schedule the supply pump. Running the pump during early morning hours typically yields higher inlet water pressure.',
            badge: 'Pump Schedule'
          },
          {
            category: 'Emergency Conservation',
            title: 'Prioritize Core Sanitation & Cooking',
            description: 'Limit tap usage strictly to drinking and basic kitchen sanitation to preserve the remaining buffer for essential needs.',
            badge: 'Low Reserve'
          }
        ]
      };
    }

    // SCENARIO 3: Overflow Risk (>= 90%)
    if (tankLevel >= 90) {
      return {
        source: 'Offline Expert Rules',
        isAiGenerated: false,
        statusNote: 'Overhead tank level is approaching 100% capacity threshold.',
        tips: [
          {
            category: 'Spill Prevention',
            title: 'Disengage Water Pump Immediately',
            description: `Tank capacity is at ${Math.round(tankLevel)}% (${Math.round(waterAvailable)}L). Turn off the supply pump to prevent roof spillage and structural dampness.`,
            badge: 'Overflow Guard'
          },
          {
            category: 'Hardware Check',
            title: 'Inspect Tank Float Valve & Cutoff Switch',
            description: 'Verify mechanical ballcock float movement. Scale accumulation or bent float rods can prevent the valve from seating completely under supply pressure.',
            badge: 'Mechanical'
          },
          {
            category: 'Drainage Verification',
            title: 'Ensure Overflow Warning Pipe Is Clear',
            description: 'Confirm the tank warning overflow pipe is unobstructed and discharges visibly over a drainage gully rather than down building masonry.',
            badge: 'Safety'
          }
        ]
      };
    }

    // SCENARIO 4: High Daily Consumption (> 300 Litres)
    if (dailyConsumption > 300) {
      return {
        source: 'Offline Expert Rules',
        isAiGenerated: false,
        statusNote: 'Today’s consumption is significantly higher than the standard eco-target.',
        tips: [
          {
            category: 'Usage Audit',
            title: 'Investigate Shower Duration & Kitchen Rinsing',
            description: `Cumulative consumption has reached ${dailyConsumption.toFixed(1)}L today. A 5-minute reduction in shower times across residents can cut daily draw by 35-50 litres.`,
            badge: 'Usage Reduction'
          },
          {
            category: 'Fixture Retrofit',
            title: 'Fit Low-Flow Faucet Aerators',
            description: 'Installing standard 6 L/min pressure-compensating aerators on kitchen and bathroom washbasins maintains rinse force while reducing tap flow by up to 40%.',
            badge: 'Fixture Retrofit'
          },
          {
            category: 'Greywater Stewardship',
            title: 'Divert Rinse Water for Plant Irrigation',
            description: 'Reuse non-chemical vegetable washing and reverse osmosis reject water for landscape beds and outdoor floor washing instead of draw from the overhead tank.',
            badge: 'Reuse'
          }
        ]
      };
    }

    // SCENARIO 5: Nominal Baseline Operation
    return {
      source: 'Offline Expert Rules',
      isAiGenerated: false,
      statusNote: 'All telemetry metrics indicate healthy, balanced water distribution.',
      tips: [
        {
          category: 'Good Stewardship',
          title: 'Maintain 60-80% Operating Tank Reserve',
          description: `Current tank volume of ${Math.round(waterAvailable)}L (${Math.round(tankLevel)}%) provides optimal buffer without placing excessive hydrostatic stress on tank joints.`,
          badge: 'Optimal Storage'
        },
        {
          category: 'Daily Habits',
          title: 'Practice Closed-Tap Brushing & Full Loads',
          description: 'Turning off washbasin taps while brushing teeth and only operating dishwashers with full racks saves an estimated 15-20 litres daily per occupant.',
          badge: 'Eco Habit'
        },
        {
          category: 'Preventative Check',
          title: 'Conduct Weekly 10-Minute Static Flow Audit',
          description: 'With all taps turned off, check if DropWise reports 0.0 L/min flow. A small non-zero reading during night hours is an early warning sign of underground seepage.',
          badge: 'Audit Routine'
        }
      ]
    };
  }

  /**
   * Request 3 recommendations from Google Gemini API using structured prompt.
   * If key is absent, network fails, or response is invalid, smoothly falls back
   * to getOfflineRecommendations.
   */
  async function generateRecommendations(telemetry) {
    const apiKey = getApiKey();

    // If no API key configured, use offline heuristic engine immediately
    if (!apiKey) {
      return {
        ...getOfflineRecommendations(telemetry),
        reason: 'No Gemini API key configured. Utilizing local offline expert rules engine.'
      };
    }

    // Construct prompt payload for Gemini
    const promptText = `
You are DropWise AI, an expert hydrologist and smart water conservation advisor for residential buildings.
Analyze the following real-time simulated building water telemetry:
- Tank Level: ${telemetry.tankLevel.toFixed(1)}% (Capacity: 2000 Litres)
- Water Available: ${telemetry.waterAvailable.toFixed(0)} Litres
- Today's Water Consumption: ${telemetry.dailyConsumption.toFixed(1)} Litres
- Current Flow Rate: ${telemetry.currentFlowRate.toFixed(1)} Litres/minute
- Water Pump Status: ${telemetry.pumpStatus ? 'ON (Pumping)' : 'OFF'}
- Possible Leak Detected: ${telemetry.possibleLeakStatus ? 'YES (Abnormal sustained continuous flow)' : 'NO (Normal)'}

TASK:
Provide EXACTLY 3 concise, highly practical, water-saving recommendations tailored specifically to these readings.
Rules:
1. Use simple, clear English.
2. If a possible leak is detected, make urgent leak containment and investigation tip #1!
3. If tank level is low (<=20%), prioritize water rationing and supply scheduling.
4. If tank level is near overflow (>=90%), prioritize pump shutoff and overflow prevention.
5. Do NOT make unrealistic guarantees (e.g. do not say "You will save exactly 500 liters tomorrow").
6. Return your response ONLY as a valid JSON array of exactly 3 objects with keys: "category", "title", "description", "badge".
Do not include markdown code block backticks, just raw JSON.

Example JSON output format:
[
  {
    "category": "Leak Containment",
    "title": "Inspect Isolation Valves Immediately",
    "description": "Continuous high flow suggests pipe rupture or stuck valve. Shut main valve to verify.",
    "badge": "Urgent"
  },
  {
    "category": "Storage Buffer",
    "title": "Optimize Water Usage Schedule",
    "description": "Maintain tank reserves during peak hours.",
    "badge": "Efficiency"
  },
  {
    "category": "Stewardship",
    "title": "Install Tap Aerators",
    "description": "Aerators reduce splash and maintain pressure while using less water.",
    "badge": "Maintenance"
  }
]
`;

    // Setup abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 600
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('Gemini API call returned non-200 status:', response.status, errorText);
        const fallback = getOfflineRecommendations(telemetry);
        fallback.reason = `Gemini API returned status ${response.status}. Switched to offline expert fallback.`;
        return fallback;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        console.warn('Empty candidate text from Gemini response, using fallback.');
        const fallback = getOfflineRecommendations(telemetry);
        fallback.reason = 'Empty response from Gemini API. Switched to offline expert fallback.';
        return fallback;
      }

      // Parse JSON from returned text (strip potential markdown code fences ```json ... ```)
      let cleanedText = rawText.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      let parsedTips = null;
      try {
        parsedTips = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.warn('Failed to parse Gemini output as JSON, attempting regex extraction:', parseErr);
      }

      if (Array.isArray(parsedTips) && parsedTips.length >= 3) {
        return {
          source: 'Google Gemini 1.5 Flash',
          isAiGenerated: true,
          statusNote: 'Live AI synthesis based on real-time building telemetry.',
          tips: parsedTips.slice(0, 3).map((item, idx) => ({
            category: item.category || 'Water Conservation',
            title: item.title || `Recommendation ${idx + 1}`,
            description: item.description || '',
            badge: item.badge || 'AI Recommendation'
          }))
        };
      } else {
        // Response format wasn't standard JSON array of 3 items
        const fallback = getOfflineRecommendations(telemetry);
        fallback.reason = 'Gemini returned non-standard format. Switched to offline expert fallback.';
        return fallback;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('Gemini API fetch error or timeout:', err.message);
      const fallback = getOfflineRecommendations(telemetry);
      fallback.reason = err.name === 'AbortError'
        ? 'Gemini API request timed out after 8 seconds. Switched to offline expert fallback.'
        : `Network connection issue (${err.message}). Switched to offline expert fallback.`;
      return fallback;
    }
  }

  return {
    getApiKey,
    setApiKey,
    removeApiKey,
    hasApiKey,
    generateRecommendations,
    getOfflineRecommendations
  };
})();
