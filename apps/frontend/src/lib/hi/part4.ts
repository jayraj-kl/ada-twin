// Hindi, part 4: the Cost and Docs tabs, the results tables and the
// redesign's changes.
export const PART4: Record<string, string> = {
  "Agent decisions": "एजेंटों के फ़ैसले",
  "In progress": "प्रगति में",
  "{0} {1} in progress at {2}": "{2} पर {0} {1} प्रगति में",
  "Cost rates": "लागत दरें",
  "(₹ per {0})": "(₹ प्रति {0})",
  "Save rates": "दरें सहेजें",
  "Rates are kept in rupees. Ones you type are marked as set by you.":
    "दरें रुपयों में रखी जाती हैं। जो आप लिखते हैं, वे \"आपने तय किया\" के रूप में दिखती हैं।",
  "Not set": "तय नहीं",
  "What this shift cost": "इस शिफ्ट की लागत",
  Currency: "मुद्रा",
  "Rates are kept in rupees; dollars at {0}.":
    "दरें रुपयों में रखी जाती हैं; डॉलर इस दर पर: {0}।",
  "Set the four rates above to see what this shift cost.":
    "इस शिफ्ट की लागत देखने के लिए ऊपर की चारों दरें तय करें।",
  "The shift could not be measured: {0}": "शिफ्ट मापी नहीं जा सकी: {0}",
  "This run has no crew work counted. Run the shift again to cost it.":
    "इस रन में टीम का काम नहीं गिना गया। इसकी लागत देखने के लिए शिफ्ट फिर से चलाएँ।",
  "Measuring the shift with and without each machine's breakdowns{0}…":
    "हर मशीन की खराबियों के साथ और बिना शिफ्ट माप रहे हैं{0}…",
  "Cost feedback": "लागत पर राय",
  "Gemini is writing the feedback…": "Gemini राय लिख रहा है…",
  "The feedback could not be written ({0}). The figures below stand on their own.":
    "राय नहीं लिखी जा सकी ({0})। नीचे के आँकड़े अपने आप में पूरे हैं।",
  "be traced to these figures:": "इन आँकड़ों से मेल नहीं खा सकीं:",
  "Every number in it traces to the figures below.":
    "इसकी हर संख्या नीचे के आँकड़ों से मेल खाती है।",
  "Where the shift lost money": "शिफ्ट में पैसा कहाँ गया",
  "Per shift, as": "प्रति शिफ्ट, जैसा",
  "ran it, averaged over": "ने चलाया, औसत",
  "days.": "दिनों का।",
  "a year at": "साल में,",
  "shifts.": "शिफ्टों पर।",
  "Breakdowns, machine by machine": "खराबियाँ, मशीन के हिसाब से",
  "What each machine's breakdowns cost a shift: the output gained when only its failures are taken out, plus its repairs. Together they need not add up to the output lost, since breakdowns overlap.":
    "हर मशीन की खराबियों की प्रति शिफ्ट लागत: सिर्फ़ उसकी खराबियाँ हटाने पर बढ़ा उत्पादन, और उसकी मरम्मत। खराबियाँ साथ-साथ होती हैं, इसलिए इनका जोड़ ज़रूरी नहीं कि खोए उत्पादन के बराबर हो।",
  "Agents against standard rules": "एजेंट बनाम मानक नियम",
  "The crew's playbook against standard rules on the same days, per shift;":
    "उन्हीं दिनों पर टीम की प्लेबुक बनाम मानक नियम, प्रति शिफ्ट;",
  "a year.": "साल में।",
  "Once the crew's playbook is written, it is compared with standard rules here.":
    "टीम की प्लेबुक लिखी जाने पर उसकी तुलना यहाँ मानक नियमों से होगी।",
  "No agents ran this shift. Put a crew on the floor in the Agents step to compare.":
    "इस शिफ्ट में कोई एजेंट नहीं था। तुलना के लिए एजेंट चरण में फ़्लोर पर टीम लगाएँ।",
  "Output lost to breakdowns": "खराबियों से खोया उत्पादन",
  "{0} {1} not made": "{0} {1} नहीं बने",
  "Repair and service labour": "मरम्मत और सर्विस की मज़दूरी",
  "{0} {1} lost, {2} crew-hours, {3} repairs":
    "{0} {1} खोए, {2} टीम-घंटे, {3} मरम्मत",
  "The shift as run by {0}, averaged over {1} days: shipped {2} {3}; with no breakdowns it would ship {4}.":
    "{0} द्वारा चलाई गई शिफ्ट, {1} दिनों का औसत: {2} {3} भेजे गए; बिना खराबी के {4} भेजे जाते।",
  "{0}: {1} per shift ({2}).": "{0}: प्रति शिफ्ट {1} ({2})।",
  "Total lost: {0} per shift, {1} a year at {2} shifts.":
    "कुल नुकसान: प्रति शिफ्ट {0}, {2} शिफ्टों पर साल में {1}।",
  "Breakdowns at {0}: {1} per shift ({2}).":
    "{0} की खराबियाँ: प्रति शिफ्ट {1} ({2})।",
  "The agents' playbook against standard rules on the same days: {0} {1} per shift, {2} a year ({3}).":
    "उन्हीं दिनों पर एजेंटों की प्लेबुक बनाम मानक नियम: प्रति शिफ्ट {1} {0}, साल में {2} ({3})।",
  "No agents' playbook to compare with standard rules.":
    "मानक नियमों से तुलना के लिए एजेंटों की कोई प्लेबुक नहीं।",
  "Total lost per shift": "प्रति शिफ्ट कुल नुकसान",
  "Total lost a year": "साल का कुल नुकसान",
  "Breakdowns at {0}": "{0} की खराबियाँ",
  "Agents vs standard rules, per shift": "एजेंट बनाम मानक नियम, प्रति शिफ्ट",
  "Agents vs standard rules, a year": "एजेंट बनाम मानक नियम, साल में",
  "Agents vs standard rules: {0}": "एजेंट बनाम मानक नियम: {0}",
  "From the shift's measurements": "शिफ्ट के मापों से",
  "Documents behind this sim": "इस सिमुलेशन के पीछे के दस्तावेज़",
  "Every figure this": "इस",
  "sim runs on was read by an agent from these documents, and cites the passage it came from.":
    "सिमुलेशन का हर आँकड़ा एक एजेंट ने इन दस्तावेज़ों से पढ़ा है, और जिस अंश से लिया उसका हवाला देता है।",
  Demo: "डेमो",
  "documents are made up for a fictional plant;":
    "दस्तावेज़ एक काल्पनिक प्लांट के लिए बनाए गए हैं;",
  published: "प्रकाशित",
  "reference sheets carry real figures for each class of equipment.":
    "संदर्भ शीटों में हर तरह के उपकरण के असली आँकड़े हैं।",
  "Checking every citation against its document…":
    "हर हवाले को उसके दस्तावेज़ से जाँच रहे हैं…",
  "{0} of {1} citations verified against their documents.":
    "{1} में से {0} हवाले अपने दस्तावेज़ों से सत्यापित।",
  "Supplied the cost rates in the Cost tab.": "लागत टैब की दरें इसी से आईं।",
  support: "सहायक",
  "Published range for {0}, shown beside this plant's figures.":
    "{0} की प्रकाशित सीमा, इस प्लांट के आँकड़ों के पास दिखाई गई।",
  "No figure was read from it.": "इससे कोई आँकड़ा नहीं पढ़ा गया।",
  "stopped, needs auxiliary": "रुका, सहायक उपकरण चाहिए",
  "no agents ran this shift": "इस शिफ्ट में कोई एजेंट नहीं था",
  "the crew shipped {0} more {1} than standard rules":
    "टीम ने मानक नियमों से {0} ज़्यादा {1} भेजे",
  "the crew shipped {0} fewer {1} than standard rules":
    "टीम ने मानक नियमों से {0} कम {1} भेजे",
  "the crew matched standard rules": "टीम ने मानक नियमों जितना ही किया",
  "With your picked {0}, {1}": "आपके चुने {0} के साथ, {1}",
  "{0}, and the target of {1} was met": "{0}, और {1} का लक्ष्य पूरा हुआ",
  "{0}, but the plant is {1} short of {2}": "{0}, पर प्लांट {2} से {1} पीछे है",
  "Your twin has changed since this run: run the shift again first.":
    "इस रन के बाद आपका ट्विन बदल गया है: पहले शिफ्ट फिर से चलाएँ।",
  "Run with the new picks": "नई पसंद के साथ चलाएँ",
  "Run with changes": "बदलावों के साथ चलाएँ",
  "Run the shift with the picked changes, on a copy of your twin":
    "चुने गए बदलावों के साथ शिफ्ट चलाएँ, आपके ट्विन की एक कॉपी पर",
  "Run again · {0} changed": "फिर से चलाएँ · {0} बदला",
  " Run it again, then run with your changes.":
    " इसे फिर से चलाएँ, फिर अपने बदलावों के साथ चलाएँ।",
  "{0} fewer {1} a shift {2}": "{2} प्रति शिफ्ट {0} कम {1}",
  "on standard rules": "मानक नियमों पर",
  "with your agents": "आपके एजेंटों के साथ",
  "In the run these changes shipped {0}": "रन में इन बदलावों से {0} भेजे गए",
  "New support equipment": "नया सहायक उपकरण",
  "not with your picks": "आपकी पसंद के साथ नहीं",
  "{0} {1} with your picks": "आपकी पसंद के साथ {0} {1}",
  "Remove {0} from the redesign": "{0} को रीडिज़ाइन से हटाएँ",
  "Add {0} to the redesign": "{0} को रीडिज़ाइन में जोड़ें",
  "Picked: click to take it out": "चुना गया: हटाने के लिए क्लिक करें",
  "in your picks": "आपकी पसंद में",
  "{0} to {1} by day": "दिन के हिसाब से {0} से {1}",
  "Estimates are the AI's own; check them before buying.":
    "अनुमान AI के अपने हैं; खरीदने से पहले जाँच लें।",
  "Repairs go first at {0}; otherwise whoever waited longest.":
    "मरम्मत पहले {0} पर; वरना जो सबसे देर से इंतज़ार कर रहा हो।",
  "80% above {0} {1} in progress": "प्रगति में {0} {1} से ऊपर होने पर 80%",
  "{0}: release at {1}, 100% otherwise.": "{0}: {1} पर भेजें, वरना 100%।",
  "Service {0} after every {1} h of work, when a crew is free.":
    "हर {1} घंटे के काम के बाद {0} की सर्विस करें, जब टीम खाली हो।",
  "The crew decided much as the standard rules would, so the playbook is the standard rules.":
    "टीम ने लगभग मानक नियमों जैसे ही फ़ैसले लिए, इसलिए प्लेबुक मानक नियम ही है।",
  "Average work in progress": "प्रगति में औसत काम",
  "Of the {0} target": "{0} के लक्ष्य में से",
  "Averaged over {0} days, each with its own random events, with the lowest and highest day under each figure. ":
    "{0} दिनों का औसत, हर दिन की अपनी अचानक घटनाएँ, हर आँकड़े के नीचे सबसे कम और सबसे ज़्यादा वाला दिन। ",
  "One day of random events. ": "अचानक घटनाओं वाला एक दिन। ",
  "Your agents worked one day for real; their playbook replays how they worked on the rest. ":
    "आपके एजेंटों ने एक दिन सचमुच काम किया; उनकी प्लेबुक बाकी दिनों पर उनका तरीका दोहराती है। ",
  "With your": "आपके",
  picked: "चुने गए",
  ", and what your plant did before them": ", और उनसे पहले आपके प्लांट ने क्या किया",
  "was {0}": "{0} था",
  "real day {0}": "असली दिन {0}",
  Bottleneck: "बाधा",
  "Writing the crew's playbook to replay it on the other days…":
    "बाकी दिनों पर दोहराने के लिए टीम की प्लेबुक लिख रहे हैं…",
  "The crew's playbook could not be written ({0}), so their column is their one real day.":
    "टीम की प्लेबुक नहीं लिखी जा सकी ({0}), इसलिए उनका कॉलम उनका एक असली दिन है।",
  "Their column is their one real day; run the shift again to replay the crew on every day.":
    "उनका कॉलम उनका एक असली दिन है; हर दिन पर टीम को दोहराने के लिए शिफ्ट फिर से चलाएँ।",
  "Replaying the crew's playbook on every day…":
    "हर दिन पर टीम की प्लेबुक दोहरा रहे हैं…",
  "Playbook on the crew's day: {0} {1}; the real crew shipped {2}.":
    "टीम के दिन पर प्लेबुक: {0} {1}; असली टीम ने {2} भेजे।",
  "Playbook on the crew's day: {0} {1}, but the real crew shipped {2}, so treat their averages with care.":
    "टीम के दिन पर प्लेबुक: {0} {1}, पर असली टीम ने {2} भेजे, इसलिए उनके औसत सावधानी से देखें।",
  "Crew playbook": "टीम की प्लेबुक",
  "Suggested changes": "सुझाए गए बदलाव",
  "each on top of your picks, over the same days":
    "हर एक आपकी पसंद के ऊपर, उन्हीं दिनों पर",
  "on its own, and on top of your picks": "अकेले, और आपकी पसंद के ऊपर",
  "each re-simulated on its own, over the same days":
    "हर एक अकेले दोबारा सिम्युलेट, उन्हीं दिनों पर",
  "Re-simulating each change…": "हर बदलाव दोबारा सिम्युलेट कर रहे हैं…",
  "Nothing stands out to change.": "बदलने लायक कुछ ख़ास नहीं दिखा।",
  to: "से",
  "by day": "दिन के हिसाब से",
  "New equipment": "नए उपकरण",
  "the AI's ideas, each re-simulated": "AI के सुझाव, हर एक दोबारा सिम्युलेट",
  "Machines, support equipment or spare parts the plant does not have yet, that would fix what this run shows. The AI searches the web for realistic figures, so it takes a minute.":
    "मशीनें, सहायक उपकरण या स्पेयर पार्ट्स जो प्लांट में अभी नहीं हैं, और जो इस रन की दिखाई समस्या ठीक करेंगे। AI असली आँकड़ों के लिए वेब खोजता है, इसलिए एक मिनट लगता है।",
  "Looking and measuring…": "खोज और माप रहे हैं…",
  "Look for new equipment": "नए उपकरण खोजें",
  "Where each station's time went": "हर स्टेशन का समय कहाँ गया",
  "with your picks and agents": "आपकी पसंद और एजेंटों के साथ",
  "with your picks, standard rules": "आपकी पसंद के साथ, मानक नियम",
  "redesign, standard rules": "रीडिज़ाइन, मानक नियम",
  busy: "व्यस्त",
  "· blocked": "· अटका",
  "· down": "· बंद",
  "Stopped by {0}": "{0} की वजह से रुका",
  blocked: "अटका",
  down: "बंद",
  "stopped by auxiliary": "सहायक उपकरण से रुका",
  "Auxiliary equipment": "सहायक उपकरण",
  "share of the shift down": "शिफ्ट का बंद रहा हिस्सा",
  "needed by": "जिनको ज़रूरत",
  "With your picks. ": "आपकी पसंद के साथ। ",
  "-hour shift,": "-घंटे की शिफ्ट,",
  maintenance: "रखरखाव",
  "agent decisions,": "एजेंटों के फ़ैसले,",
  "adjustments to the twin.": "ट्विन में बदलाव।",
  "No changes yet": "अभी कोई बदलाव नहीं",
  "{0} {1} in the redesign": "रीडिज़ाइन में {0} {1}",
  "Add a suggested change, or tell the assistant below what you would change. Your twin is not touched until you apply the redesign.":
    "कोई सुझाया बदलाव जोड़ें, या नीचे सहायक को बताएँ कि आप क्या बदलेंगे। रीडिज़ाइन लागू करने तक आपका ट्विन नहीं बदलता।",
  "Measuring them together…": "इन्हें साथ में माप रहे हैं…",
  "Together {0} {1} per shift on standard rules; one by one they add up to {2}.":
    "मानक नियमों पर साथ में प्रति शिफ्ट {0} {1}; एक-एक करके इनका जोड़ {2} है।",
  "Looking up costs on the web…": "वेब पर लागत खोज रहे हैं…",
  "Costs from the web": "वेब से लागत",
  "Look up again": "फिर से खोजें",
  "Costs could not be looked up: {0}": "लागत नहीं खोजी जा सकी: {0}",
  "Drop {0}": "{0} हटाएँ",
  Alone: "अकेले",
  "only with the others": "सिर्फ़ बाकियों के साथ",
  "No upfront cost": "शुरुआती लागत नहीं",
  "+ {0} a year": "+ साल में {0}",
  "≈ {0} per extra part": "≈ हर अतिरिक्त पुर्ज़े पर {0}",
};
