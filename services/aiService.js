const Equipment = require('../models/Equipment');
const { isDbConnected } = require('../config/db');
const { getFallbackEquipment, filterFallbackEquipment } = require('../config/sampleData');

/**
 * AI Campus Equipment Advisor Engine
 * Features:
 * 1. Live OpenRouter LLM integration with real-time equipment catalog grounding.
 * 2. Academic domain intelligence covering engineering toolkits, lab instruments, and campus lending rules.
 * 3. Structured Markdown output with direct equipment hyperlinks ([Title](/equipment/<id>)).
 * 4. High-quality offline knowledge base for when API keys are unconfigured or networks are disconnected.
 */
async function getAssistantResponse(query, currentUser = null, customApiKey = null) {
  const q = (query || '').trim();

  if (!q) {
    return {
      reply: "👋 **Hello! I am your AI Campus Equipment Advisor.**\n\nI can help you:\n• 🔍 **Find academic gear** (mini drafters, multimeters, scientific calculators, lab coats)\n• 🎒 **Recommend course toolkits** for Engineering Drawing, BEE, Electronics, or Workshop\n• 📍 **Locate campus pickup counters** (Electrical Lab Room 304, Library 2nd Floor, etc.)\n• 🛡️ **Explain UPI security escrow** and how to maintain a 5.0 Trust rating\n\nWhat would you like to search or ask about today?",
      suggestions: [
        'Find a Mini Drafter',
        'Find a Digital Multimeter',
        'Scientific Calculators for Exams',
        'How does college pickup work?'
      ],
      provider: 'local'
    };
  }

  // 1. Fetch available equipment from database for grounding context
  let catalogContext = '';
  let matchingItems = [];
  let allAvailable = [];

  try {
    if (isDbConnected()) {
      allAvailable = await Equipment.find({ status: 'AVAILABLE' })
        .select('title category department condition depositAmount dailyFee location _id')
        .limit(16)
        .lean();
    } else {
      allAvailable = getFallbackEquipment();
    }

    if (allAvailable.length > 0) {
      catalogContext = allAvailable
        .map(i => `- [${i.title}](/equipment/${i._id}) | Category: ${i.category} | Dept: ${i.department} | Condition: ${i.condition} | Daily Fee: ₹${i.dailyFee || 0} | Deposit: ₹${i.depositAmount || 0} (Refundable) | Campus Location: ${i.location}`)
        .join('\n');
    }

    // Search for matches in database based on user's query keywords
    const searchTerms = q.split(/\s+/).filter(t => t.length > 2);
    const regexQueries = searchTerms.map(term => ({
      $or: [
        { title: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { category: { $regex: term, $options: 'i' } },
        { department: { $regex: term, $options: 'i' } }
      ]
    }));

    if (regexQueries.length > 0) {
      matchingItems = await Equipment.find({
        status: 'AVAILABLE',
        $or: [
          { title: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } },
          { department: { $regex: q, $options: 'i' } },
          ...regexQueries
        ]
      }).limit(5).lean();
    }
  } catch (dbErr) {
    console.warn('[AI SERVICE] Database context lookup warning:', dbErr.message);
  }

  // 2. Check for OpenRouter API Key
  const apiKey = (customApiKey || process.env.OPENROUTER_API_KEY || '').trim();
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

  if (apiKey) {
    try {
      const systemPrompt = `You are the expert, helpful AI Campus Equipment Advisor for the "Campus Equipment Lending Exchange".
Your mission is to assist college engineering and science students (both 1st-year juniors needing tools and senior peer lenders sharing equipment).

GUIDELINES FOR YOUR RESPONSES:
1. Be structured, polite, concise, and academically accurate.
2. Use Markdown: use bold text, bullet points, and numbered steps for readability.
3. When recommending or listing equipment, ALWAYS provide direct markdown links using this exact syntax: [Item Title](/equipment/<item_id>). Include its condition, department, daily fee / free status, refundable deposit, and campus pickup location.
4. If asked about lab toolkits or specific subjects (e.g. Engineering Graphics, BEE, Electronics, Workshop, Physics, Chemistry), give a clear list of what tools are required, how to inspect them, and link to any currently available items in the catalog.
5. If asked about platform rules, explain:
   - 4-step borrow flow: Select gear -> Choose return date & pickup spot -> Senior approval -> Collect with Student ID.
   - 100% refundable security deposit via UPI escrow (zero platform fees).
   - Designated campus pickup spots (e.g. Electrical Lab Room 304, Central Library 2nd Floor, Main Building Help Desk).
   - 48-hour return countdown reminder and how returning on time preserves the 5.0 Trust rating.

LIVE CAMPUS CATALOG DATA:
${catalogContext || 'Currently no items listed as available in the database.'}
`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_URL || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'),
          'X-Title': 'Campus Equipment Lending Exchange'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: q }
          ],
          max_tokens: 650,
          temperature: 0.6
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (response.ok) {
        const data = await response.json();
        const aiReply = data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content.trim()
          : null;

        if (aiReply) {
          const suggestions = [];
          if (matchingItems.length > 0) {
            suggestions.push(`View ${matchingItems[0].title}`);
          }
          suggestions.push('Explore Marketplace', 'How does UPI Escrow work?', 'Return Rules & Trust');

          return {
            reply: aiReply,
            suggestions: suggestions.slice(0, 3),
            provider: 'openrouter',
            model: model
          };
        }
      } else {
        const errText = await response.text();
        console.warn(`[OPENROUTER API ERROR ${response.status}]`, errText);
      }
    } catch (apiErr) {
      console.warn('[OPENROUTER API EXCEPTION]', apiErr.message);
    }
  }

  // =========================================================================
  // 3. High-Quality Academic Knowledge Engine (Enhanced Local Response)
  // Active when OpenRouter API is not configured or network fallback is triggered.
  // =========================================================================
  const lowerQ = q.toLowerCase();

  // A. Database Search Matches
  if (matchingItems.length > 0) {
    let reply = `### 🔍 Found Available Campus Equipment for "${q}"\n\n`;
    reply += `Here are the active listings from senior students ready for campus pickup:\n\n`;

    matchingItems.forEach((item, idx) => {
      const feeText = item.dailyFee > 0 ? `₹${item.dailyFee}/day` : 'Free Borrow';
      const depText = item.depositAmount > 0 ? `₹${item.depositAmount} (100% Refundable Deposit)` : 'Zero Deposit';
      reply += `${idx + 1}. **[${item.title}](/equipment/${item._id})**\n`;
      reply += `   • **Department & Category:** ${item.department} &bull; ${item.category}\n`;
      reply += `   • **Condition:** ${item.condition} &bull; **Pricing:** ${feeText} &bull; ${depText}\n`;
      reply += `   • **Pickup Spot:** 📍 ${item.location || 'Electrical Lab - Room 304'}\n`;
      reply += `   • 👉 [Click here to View Details & Request Pickup](/equipment/${item._id})\n\n`;
    });

    reply += `💡 *Tip: Click any item above to pick your preferred return date and college handover slot.*`;

    return {
      reply,
      suggestions: [`View ${matchingItems[0].title}`, 'Explore Marketplace', 'Pickup Locations'],
      provider: 'local-search'
    };
  }

  // B. Engineering Drawing / Mini Drafter / Graphics Query
  if (lowerQ.includes('drafter') || lowerQ.includes('drawing board') || lowerQ.includes('graphics') || /\b(ed|edg)\b/i.test(lowerQ)) {
    let reply = `### 📐 Engineering Drawing & Graphics (EDG) Equipment Guide\n\n`;
    reply += `1st-year engineering students frequently need drafting tools for weekly studio sessions and end-semester drawing exams:\n\n`;
    reply += `• **Mini Drafter:** Essential for parallel lines, perpendicular angles, and isometric projections. Ensure clamps fit standard drawing table edges securely.\n`;
    reply += `• **Drawing Board:** Imperial (B1/B2) or Half-Imperial wooden/laminated boards with smooth edges.\n`;
    reply += `• **Accessories:** Sheet container, 4 drafting clips, 0.5mm 2H/H/HB mechanical pencils, eraser shield, and protractor scale.\n\n`;

    const drafters = allAvailable.filter(i => i.title.toLowerCase().includes('draft') || i.category === 'Drawing Tools');
    if (drafters.length > 0) {
      reply += `**Available in Campus Catalog:**\n`;
      drafters.forEach(d => {
        reply += `• **[${d.title}](/equipment/${d._id})** (${d.department}) — Deposit: ₹${d.depositAmount || 0} [Borrow →](/equipment/${d._id})\n`;
      });
      reply += `\n`;
    } else {
      reply += `💡 *No mini drafters are listed right now. Check back soon or request one from a senior student in Mechanical/Civil departments!*\n\n`;
    }

    reply += `Seniors who have completed 1st-year drawing courses loan these out for 1-week or semester durations with full deposit refunds upon return.`;

    return {
      reply,
      suggestions: ['Search Drafter in Catalog', 'How to borrow an item?', 'Security Deposit Rules'],
      provider: 'local-knowledge'
    };
  }

  // C. Multimeter / BEE / Electronics Lab Query
  if (lowerQ.includes('multimeter') || lowerQ.includes('bee') || lowerQ.includes('circuit') || lowerQ.includes('electronics') || lowerQ.includes('dmm')) {
    let reply = `### ⚡ Electrical & Electronics Lab Equipment Guide\n\n`;
    reply += `For Basic Electrical Engineering (BEE) and Electronic Devices & Circuits (EDC) labs:\n\n`;
    reply += `• **Digital Multimeter (DMM):** Used to measure AC/DC voltage, current, resistance, and continuity checks with buzzer. Always verify probe leads (Red = V/Ω, Black = COM) are undamaged.\n`;
    reply += `• **Breadboard & Jumper Wires:** Solderless 830-point or 400-point tie boards with male-to-male and male-to-female jumper leads.\n`;
    reply += `• **Component Kits:** Resistor color code packs, capacitors, diodes, and 555 timer ICs.\n\n`;

    const electronics = allAvailable.filter(i => i.category === 'Electronics' || i.title.toLowerCase().includes('multimeter'));
    if (electronics.length > 0) {
      reply += `**Available in Campus Catalog:**\n`;
      electronics.forEach(e => {
        reply += `• **[${e.title}](/equipment/${e._id})** (${e.department}) — Deposit: ₹${e.depositAmount || 0} [Borrow →](/equipment/${e._id})\n`;
      });
      reply += `\n`;
    }

    reply += `🛡️ *Safety Precaution: Never measure current (Amps) across a live voltage source without a series load resistance.*`;

    return {
      reply,
      suggestions: ['Search Electronics', 'College Pickup Counters', 'How do I borrow?'],
      provider: 'local-knowledge'
    };
  }

  // D. Calculators / Exam Rules Query
  if (lowerQ.includes('calculator') || lowerQ.includes('calc') || lowerQ.includes('casio') || lowerQ.includes('991')) {
    let reply = `### 🔢 Scientific Calculators & University Exam Regulations\n\n`;
    reply += `Engineering university exam boards strictly govern which calculators are permitted in exam halls:\n\n`;
    reply += `• **Permitted Models:** Non-programmable scientific calculators like **Casio fx-991EX ClassWiz**, **Casio fx-991CW**, **Casio fx-991ES Plus**, or **fx-82MS**.\n`;
    reply += `• **Prohibited in Exams:** Graphing calculators (TI-84/TI-Nspire), programmable memory calculators, or mobile phone apps.\n`;
    reply += `• **Key Functions:** Solving quadratic/cubic equations, matrix operations (up to 4x4), complex numbers, numerical integration, and statistics.\n\n`;

    const calcs = allAvailable.filter(i => i.category === 'Calculators' || i.title.toLowerCase().includes('calculator'));
    if (calcs.length > 0) {
      reply += `**Available in Campus Catalog:**\n`;
      calcs.forEach(c => {
        reply += `• **[${c.title}](/equipment/${c._id})** — Deposit: ₹${c.depositAmount || 0} [Borrow →](/equipment/${c._id})\n`;
      });
      reply += `\n`;
    }

    reply += `Need a calculator for this week's mid-semester or lab exams? Senior students regularly list extra calculators for short-term borrowing!`;

    return {
      reply,
      suggestions: ['Search Calculators', 'Browse Marketplace', 'Return Policies'],
      provider: 'local-knowledge'
    };
  }

  // E. Workshop / Civil Tools (Caliper, Micrometer, Apron)
  if (lowerQ.includes('workshop') || lowerQ.includes('caliper') || lowerQ.includes('micrometer') || lowerQ.includes('apron') || lowerQ.includes('coat')) {
    let reply = `### 🛠️ Mechanical Workshop & Lab Coat Requirements\n\n`;
    reply += `Here is what is typically required for campus workshops, chemistry labs, and measurement experiments:\n\n`;
    reply += `• **Lab Coat / Apron:** Full-sleeve 100% white cotton lab coats for chemistry and biology labs, or heavy-duty dark cotton aprons for machine shops.\n`;
    reply += `• **Vernier Caliper:** Precision internal, external, and depth measurements up to 0.02mm.\n`;
    reply += `• **Micrometer Screw Gauge:** High-accuracy wire gauge and plate thickness measurements (least count 0.01mm).\n`;
    reply += `• **Safety Goggles:** Eye protection for welding, carpentry, and chemical titration.\n\n`;
    reply += `Browse our [Marketplace](/search?category=Workshop+Tools) to see if seniors have listed surplus measuring tools or lab aprons.`;

    return {
      reply,
      suggestions: ['Browse Workshop Tools', 'Explore Marketplace', 'How to borrow?'],
      provider: 'local-knowledge'
    };
  }

  // F. Microcontrollers / IoT (Arduino, Raspberry Pi, Sensors)
  if (lowerQ.includes('arduino') || lowerQ.includes('raspberry') || lowerQ.includes('esp32') || lowerQ.includes('sensor') || lowerQ.includes('iot')) {
    let reply = `### 🤖 Robotics & IoT Hardware Guide\n\n`;
    reply += `Looking to build term projects, hackathon prototypes, or IoT sensor networks?\n\n`;
    reply += `• **Arduino Uno / Mega:** Great for 8-bit digital/analog sensor reading and servo control.\n`;
    reply += `• **ESP32 / NodeMCU (ESP8266):** Integrated Wi-Fi and Bluetooth for cloud-connected IoT projects.\n`;
    reply += `• **Raspberry Pi:** Linux single-board computer for OpenCV computer vision, Python ML, and home automation.\n`;
    reply += `• **Sensor Modules:** Ultrasonic distance (HC-SR04), PIR motion, DHT11 temp/humidity, and servo motors.\n\n`;
    reply += `Check the [Electronics Section](/search?category=Electronics) to borrow microcontroller starter kits from senior robotics club members!`;

    return {
      reply,
      suggestions: ['Search Electronics', 'Explore Marketplace', 'How to borrow?'],
      provider: 'local-knowledge'
    };
  }

  // G. Borrowing Flow & Step-by-Step
  if (lowerQ.includes('how to borrow') || lowerQ.includes('borrow an item') || lowerQ.includes('borrowing process') || lowerQ.includes('step')) {
    return {
      reply: `### 📋 Simple 4-Step Campus Borrow Flow\n\n` +
        `Borrowing academic equipment from senior peers is straightforward and secure:\n\n` +
        `1. **Explore & Select Equipment:** Browse the [Marketplace](/search) and choose the item you need.\n` +
        `2. **Choose Pickup Spot & Return Date:** Pick a convenient college counter (e.g. *Electrical Lab Room 304*, *Central Library 2nd Floor*) and schedule your return deadline.\n` +
        `3. **Senior Approval & Preparation:** The senior student approves your request, confirms availability, and marks the item *Preparing*.\n` +
        `4. **Collect with College ID:** Once marked *Ready for Pickup*, meet at the campus counter, show your College Student ID card, and collect your tool!\n\n` +
        `*Security deposits are held in campus escrow and refunded 100% via UPI as soon as the item is returned safely.*`,
      suggestions: ['Go to Marketplace', 'What is security deposit?', 'Pickup Locations'],
      provider: 'local-knowledge'
    };
  }

  // H. Security Deposit & UPI Escrow System
  if (lowerQ.includes('deposit') || lowerQ.includes('escrow') || lowerQ.includes('upi') || lowerQ.includes('fee') || lowerQ.includes('payment') || lowerQ.includes('money')) {
    return {
      reply: `### 🛡️ Campus UPI Security Escrow Policy\n\n` +
        `To protect expensive lab equipment without putting an unfair financial burden on junior students, our exchange uses an **Escrow Protection Model**:\n\n` +
        `• **Zero Platform Fees:** 100% of student funds go toward the security deposit.\n` +
        `• **Held in Secure Escrow:** The deposit is not given to the lender upfront; it is locked safely in the system during your loan period.\n` +
        `• **100% Automatic UPI Refund:** When you return the equipment in good working condition, the senior lender clicks *Confirm Return*, immediately releasing the deposit back to your UPI account.\n` +
        `• **Free Borrowings:** Many seniors list tools with **₹0 Deposit** for verified campus peers!`,
      suggestions: ['How to borrow?', 'Return Policies', 'Explore Marketplace'],
      provider: 'local-knowledge'
    };
  }

  // I. Return Rules, 48-Hour Reminders & Trust Score
  if (lowerQ.includes('return') || lowerQ.includes('late') || lowerQ.includes('overdue') || lowerQ.includes('trust') || lowerQ.includes('rating') || lowerQ.includes('score')) {
    return {
      reply: `### 🔄 Return Countdown & Campus Trust Score\n\n` +
        `Every member starts with a **5.0 Campus Trust Rating**. Here is how the return cycle functions:\n\n` +
        `• **Dynamic Countdown:** View exactly how many days remain on your active loan in [Returns & Active Loans](/borrow/returns).\n` +
        `• **🔔 48-Hour Return Alert:** Automated in-app alerts remind you when 2 days remain so you can coordinate with the lender.\n` +
        `• **On-Time Returns:** Returning gear punctually increases your Trust Score, earning you priority borrowing privileges.\n` +
        `• **Physical Handover Inspection:** Both borrower and lender check the item together at the college counter to verify cables and working condition.`,
      suggestions: ['View Active Loans', 'Explore Marketplace', 'How does borrowing work?'],
      provider: 'local-knowledge'
    };
  }

  // J. College Pickup Counters
  if (lowerQ.includes('location') || lowerQ.includes('pickup') || lowerQ.includes('where') || lowerQ.includes('spot') || lowerQ.includes('counter')) {
    return {
      reply: `### 📍 Designated College Pickup Counters\n\n` +
        `All handovers take place in verified, safe campus academic areas:\n\n` +
        `1. **Electrical Engineering Lab — Room 304 (3rd Floor)**\n` +
        `2. **Central Library Circulation Desk (2nd Floor)**\n` +
        `3. **Main Administrative Building Help Desk**\n` +
        `4. **Mechanical Workshop Tool Store Counter**\n` +
        `5. **Computer Center / IT Lab Ground Floor**\n` +
        `6. **Main Campus Security Gate (Pass Counter)**\n\n` +
        `*Always bring your official College Student ID card when collecting or returning equipment!*`,
      suggestions: ['How to borrow?', 'Explore Marketplace', 'View Available Gear'],
      provider: 'local-knowledge'
    };
  }

  // K. Default High-Quality Fallback
  return {
    reply: `### 🤖 Campus Equipment Assistant\n\n` +
      `I can help you navigate campus hardware resources, loan tools, and understand exchange guidelines:\n\n` +
      `• **Find Tools:** Ask for *"mini drafter"*, *"multimeter"*, *"scientific calculator"*, or *"Arduino kit"*.\n` +
      `• **Course Toolkits:** Ask for *"tools for 1st year engineering drawing"* or *"BEE lab equipment"*.\n` +
      `• **Policies:** Inquire about *"security deposit refund"*, *"pickup spots"*, or *"48-hour return rules"*.\n\n` +
      `Visit the **[Explore Marketplace](/search)** to browse all current student listings!${!apiKey ? '\n\n💡 *Tip: To activate live OpenRouter LLM generation, set your `OPENROUTER_API_KEY` in `.env` or click the ⚙️ icon in the top header.*' : ''}`,
    suggestions: [
      'Find a Mini Drafter',
      'Find a Digital Multimeter',
      'Calculators for Exams',
      'How does borrowing work?'
    ],
    provider: 'local-knowledge',
    isOpenRouterConfigured: Boolean(apiKey)
  };
}

module.exports = {
  getAssistantResponse,
};
