// Hindi, part 1: the shell, workspace, agents, capture and the start of the
// plant step. Keyed by the English exactly as the code writes it.
export const PART1: Record<string, string> = {
  Language: "भाषा",
  Twin: "ट्विन",
  "AI models: {0} for text, {1} for images":
    "AI मॉडल: टेक्स्ट के लिए {0}, तस्वीरों के लिए {1}",
  "{0} model: {1}": "{0} मॉडल: {1}",
  "AI models": "AI मॉडल",
  "Runs on": "चलता है",
  "for text and": "टेक्स्ट के लिए और",
  "for images.": "तस्वीरों के लिए।",
  "The models stay in the top bar, to change any time":
    "मॉडल ऊपर की पट्टी में रहते हैं, जब चाहें बदल लें",
  "Got it": "समझ गया",
  "Cannot reach the API": "API तक नहीं पहुँच पा रहे",
  Retry: "फिर से कोशिश करें",
  "Use the defaults": "डिफ़ॉल्ट इस्तेमाल करें",
  "Used for every AI call from this browser.":
    "इस ब्राउज़र से हर AI कॉल के लिए इस्तेमाल होता है।",
  "Your profile": "आपकी प्रोफ़ाइल",
  "Saved in this browser": "इस ब्राउज़र में सहेजा गया",
  "Edit profile": "प्रोफ़ाइल बदलें",
  "Sign out": "साइन आउट",
  "The API answered HTTP {0}": "API ने HTTP {0} लौटाया",
  "Upload 360° panoramas of your floor": "अपने फ़्लोर के 360° पैनोरमा अपलोड करें",
  "List machines and draw the material flow":
    "मशीनें लिखें और माल का प्रवाह बनाएँ",
  "Set the conditions to test against": "परखने के लिए हालात तय करें",
  "Put a crew of AI agents on the floor": "फ़्लोर पर AI एजेंटों की टीम लगाएँ",
  "Run the shift, see what to fix, and redesign the plant":
    "शिफ्ट चलाएँ, देखें क्या ठीक करना है, और प्लांट को फिर से डिज़ाइन करें",
  "The applied changes, most critical first, drawn into your photos":
    "लागू किए गए बदलाव, सबसे ज़रूरी पहले, आपकी तस्वीरों में बनाए हुए",
  "There is nothing at this address.": "इस पते पर कुछ नहीं है।",
  "Back home": "मुख्य पेज पर लौटें",
  "Step {0} of {1}: {2}. Go to another step":
    "चरण {0} / {1}: {2}। किसी दूसरे चरण पर जाएँ",
  "Not reached yet": "अभी यहाँ तक नहीं पहुँचे",
  "This project doesn't exist or was deleted":
    "यह प्रोजेक्ट मौजूद नहीं है या हटा दिया गया",
  "This project couldn't be loaded": "यह प्रोजेक्ट लोड नहीं हो सका",
  "It may have been deleted on another device, or the link is wrong.":
    "हो सकता है इसे किसी दूसरे डिवाइस पर हटा दिया गया हो, या लिंक गलत हो।",
  "The server didn't answer. Check that the API is running, then try again.":
    "सर्वर ने जवाब नहीं दिया। देखें कि API चल रहा है, फिर दोबारा कोशिश करें।",
  "Try again": "फिर से कोशिश करें",
  "Back to the workspace": "वर्कस्पेस पर लौटें",
  Breadcrumb: "रास्ता",
  Workspace: "वर्कस्पेस",
  "A sample plant, not your data": "एक नमूना प्लांट, आपका डेटा नहीं",
  Sandbox: "सैंडबॉक्स",
  "Step 4 · Agents": "चरण 4 · एजेंट",
  "Put a crew on the floor": "फ़्लोर पर टीम लगाएँ",
  "Each agent holds one role and makes that role's decisions during the shift. Their personality changes how they trade output against risk. Roles you leave empty follow standard rules.":
    "हर एजेंट एक भूमिका निभाता है और शिफ्ट के दौरान उस भूमिका के फ़ैसले लेता है। उसका स्वभाव तय करता है कि वह उत्पादन और जोखिम में कैसे संतुलन बनाता है। जो भूमिकाएँ आप खाली छोड़ते हैं, वे मानक नियमों पर चलती हैं।",
  Name: "नाम",
  Role: "भूमिका",
  Personality: "स्वभाव",
  "About them (optional)": "इनके बारे में (वैकल्पिक)",
  "e.g. You have seen the slowest machine fail on hot days.":
    "जैसे: आपने गर्म दिनों में सबसे धीमी मशीन को खराब होते देखा है।",
  "Decides: {0}": "फ़ैसला करता है: {0}",
  Remove: "हटाएँ",
  "Add an agent": "एजेंट जोड़ें",
  "Up to {0} · two agents can share a role":
    "अधिकतम {0} · दो एजेंट एक भूमिका बाँट सकते हैं",
  "Planner and supervisor check in every (minutes)":
    "प्लानर और सुपरवाइज़र हर इतने मिनट में जाँचते हैं",
  "Every role has an agent.": "हर भूमिका के लिए एक एजेंट है।",
  "That role follows": "वह भूमिका चलती है",
  "Those roles follow": "वे भूमिकाएँ चलती हैं",
  "Each check-in is one question to Gemini per agent, so shorter intervals make the run take longer.":
    "हर जाँच पर हर एजेंट Gemini से एक सवाल पूछता है, इसलिए छोटे अंतराल से रन ज़्यादा समय लेता है।",
  "Run the shift": "शिफ्ट चलाएँ",
  Back: "पीछे",
  "Could not read this image": "यह तस्वीर पढ़ी नहीं जा सकी",
  "{0}, 360° panorama": "{0}, 360° पैनोरमा",
  Sample: "नमूना",
  "Remove {0}": "{0} हटाएँ",
  "Room or hall shown": "दिखाया गया कमरा या हॉल",
  "Name this room": "इस कमरे का नाम रखें",
  "Sample worlds": "नमूना दुनिया",
  "Building a 3D world from your own panorama can take a while. To try the app out now, open one of these real plants below. Each opens as a separate sample project. {0}.":
    "अपने पैनोरमा से 3D दुनिया बनने में कुछ समय लग सकता है। ऐप को अभी आज़माने के लिए नीचे दिए असली प्लांट में से कोई एक खोलें। हर एक अलग नमूना प्रोजेक्ट के रूप में खुलता है। {0}।",
  "360° · 3D world": "360° · 3D दुनिया",
  "Machines in the {0}": "{0} की मशीनें",
  "Support equipment": "सहायक उपकरण",
  "Open the {0} sample": "{0} का नमूना खोलें",
  "Open sample": "नमूना खोलें",
  "Not saved: {0}": "सहेजा नहीं गया: {0}",
  "{0} not usable": "{0} इस्तेमाल लायक नहीं",
  "{0} skipped, not JPG, PNG or WebP": "{0} छोड़ा गया, JPG, PNG या WebP नहीं है",
  "The sample's documents could not be kept: {0}":
    "नमूने के दस्तावेज़ सहेजे नहीं जा सके: {0}",
  "The sample could not be opened: {0}": "नमूना खोला नहीं जा सका: {0}",
  "Step 1 · Capture": "चरण 1 · कैप्चर",
  "Start from photos of your plant": "अपने प्लांट की तस्वीरों से शुरू करें",
  "Bring the 360° panoramas your 3D world is built from, one per room or hall, and describe how material moves through the floor.":
    "वे 360° पैनोरमा लाएँ जिनसे आपकी 3D दुनिया बनती है, हर कमरे या हॉल का एक, और बताएँ कि माल फ़्लोर पर कैसे आगे बढ़ता है।",
  "Panoramas and process": "पैनोरमा और प्रक्रिया",
  "Sample plant": "नमूना प्लांट",
  "· read-only, not your data": "· सिर्फ़ पढ़ने के लिए, आपका डेटा नहीं",
  "Delete sample": "नमूना हटाएँ",
  "Drop 360° panoramas, paste them, or click to choose":
    "360° पैनोरमा यहाँ छोड़ें, पेस्ट करें, या चुनने के लिए क्लिक करें",
  "JPG, PNG or WebP · 2:1 ratio · up to 20 MB each":
    "JPG, PNG या WebP · 2:1 अनुपात · हर एक 20 MB तक",
  "Add more panoramas": "और पैनोरमा जोड़ें",
  "How does material move through your floor?":
    "आपके फ़्लोर पर माल कैसे आगे बढ़ता है?",
  "optional, but the flow we draft is much better with it":
    "वैकल्पिक, पर इससे हमारा बनाया प्रवाह कहीं बेहतर होता है",
  "e.g. Raw parts arrive at the saws, go to the two lathes, wait on a rack, then get washed and packed.":
    "जैसे: कच्चे पुर्ज़े आरी पर आते हैं, दो लेथ पर जाते हैं, रैक पर रुकते हैं, फिर धुलकर पैक होते हैं।",
  "Sample description · {0}": "नमूने का विवरण · {0}",
  "Add panoramas": "पैनोरमा जोड़ें",
  "No panoramas yet": "अभी कोई पैनोरमा नहीं",
  "Open the sample twin": "नमूना ट्विन खोलें",
  "Add a 2:1 panorama first": "पहले 2:1 पैनोरमा जोड़ें",
  "Builds a walkable 3D world from your first panorama":
    "आपके पहले पैनोरमा से घूमने लायक 3D दुनिया बनाता है",
  "Continue to the twin": "ट्विन पर आगे बढ़ें",
  "The 3D world could not be built: {0}": "3D दुनिया नहीं बन सकी: {0}",
  "Building your 3D world{0}. World Labs usually takes about 5 minutes; the demo world is used until yours is ready.":
    "आपकी 3D दुनिया बन रही है{0}। World Labs को आम तौर पर करीब 5 मिनट लगते हैं; तब तक डेमो दुनिया इस्तेमाल होती है।",
  "Your own 3D world is ready and used in every step.":
    "आपकी अपनी 3D दुनिया तैयार है और हर चरण में इस्तेमाल होती है।",
  "Drop to add panoramas": "पैनोरमा जोड़ने के लिए यहाँ छोड़ें",
  "{0}. The photos need the world fetched in the capture step.":
    "{0}। तस्वीरों के लिए कैप्चर चरण में दुनिया लानी होगी।",
  "Nano Banana made no drawing. Try saying it differently.":
    "Nano Banana ने कुछ नहीं बनाया। इसे दूसरे शब्दों में कहकर देखें।",
  "Step 6 · New plant": "चरण 6 · नया प्लांट",
  "Nothing applied yet": "अभी कुछ लागू नहीं किया गया",
  "Redesign the plant in Results, then press":
    "नतीजे में प्लांट को फिर से डिज़ाइन करें, फिर दबाएँ",
  "Apply to my twin": "मेरे ट्विन पर लागू करें",
  ". The applied changes are ranked here, and drawn into your photos.":
    "। लागू किए गए बदलाव यहाँ क्रम से दिखते हैं, और आपकी तस्वीरों में बनाए जाते हैं।",
  "Go to Results": "नतीजे पर जाएँ",
  "AdaTwin · Redesign report": "AdaTwin · रीडिज़ाइन रिपोर्ट",
  "{0} · applied {1}": "{0} · {1} को लागू किया",
  "What the redesign changes": "रीडिज़ाइन क्या बदलता है",
  "The changes you applied, most critical first for":
    "आपके लागू किए बदलाव, सबसे ज़रूरी पहले, इसके लिए:",
  ", each measured over": ", हर एक को मापा गया",
  "simulated days.": "सिम्युलेटेड दिनों पर।",
  "On the right, Nano Banana draws them into photos of your plant.":
    "दाईं ओर, Nano Banana इन्हें आपके प्लांट की तस्वीरों में बनाता है।",
  "Applied redesign": "लागू किया गया रीडिज़ाइन",
  Applied: "लागू",
  changes: "बदलाव",
  Print: "प्रिंट",
  Results: "नतीजे",
  "Applied changes": "लागू किए गए बदलाव",
  "The changes could not be measured": "बदलावों को मापा नहीं जा सका",
  "Measuring each change…": "हर बदलाव को माप रहे हैं…",
  "The shift runs {0} days with and without each change, on standard rules.":
    "शिफ्ट मानक नियमों पर {0} दिन चलती है, हर बदलाव के साथ और उसके बिना।",
  "Before, {0} per shift": "पहले, प्रति शिफ्ट {0}",
  "With the redesign": "रीडिज़ाइन के साथ",
  "a shift,": "प्रति शिफ्ट,",
  "-day average": "-दिन का औसत",
  "Scenario targets, before → with the redesign":
    "परिदृश्य के लक्ष्य, पहले → रीडिज़ाइन के साथ",
  Summary: "सारांश",
  Rewrite: "फिर से लिखें",
  "Gemini is writing the report…": "Gemini रिपोर्ट लिख रहा है…",
  "The summary could not be written (": "सारांश नहीं लिखा जा सका (",
  "). The ranking below stands on its own.":
    ")। नीचे दिया क्रम अपने आप में पूरा है।",
  "Write the summary": "सारांश लिखें",
  "No summary yet.": "अभी कोई सारांश नहीं।",
  "1 number couldn't": "1 संख्या",
  "{0} numbers couldn't": "{0} संख्याएँ",
  "be traced to the simulation:": "सिमुलेशन से मेल नहीं खा सकीं:",
};
