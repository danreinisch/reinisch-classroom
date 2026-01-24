
(function(){
  try{
    const h = window.innerHeight || 900;
    if(h < 820) document.body.classList.add("compact");
  }catch(e){}
})();


// ---- MIQ v12 boot marker ----
try { console.log("[MIQ] v12 app.js loaded ✅"); } catch(e) {}
try {
  const status = document.getElementById("rcLoaderStatus");
  if(status) status.textContent = "Status: app.js loaded ✅ (v12 initializing…)";
} catch(e) {}
window.addEventListener("DOMContentLoaded", () => {
  try {
    const loader = document.getElementById("rcLoader");
    if(loader) loader.style.display = "none";
  } catch(e) {}
});


    /*****************************************************************
      TEXT-TO-SPEECH (Web Speech API)
    ******************************************************************/
    const TTS = { enabled: true, rate: 1.0, pitch: 1.0, volume: 1.0 };
    const HINTS = { enabled: true };

    function speak(text){
      if(!TTS.enabled) return;
      if(!text || !String(text).trim()) return;
      try{
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text));
        u.rate = TTS.rate; u.pitch = TTS.pitch; u.volume = TTS.volume;
        window.speechSynthesis.speak(u);
      }catch(e){}
    }
    function stopSpeak(){ try{ window.speechSynthesis.cancel(); }catch(e){} }

    /*****************************************************************
      DATA: SCENARIOS
    ******************************************************************/
    
    /*****************************************************************
      DATA: CHOICES + ROLE-SPECIFIC SCRIPTS
      - "sub" is OPTIONAL hint text shown only when Hints are ON
    ******************************************************************/
    function goodChoice(label, sub, delta, score, fb, log){
      return { label, sub, delta, score, fbTone:"good", fb, log };
    }
    function warnChoice(label, sub, delta, score, fb, log){
      return { label, sub, delta, score, fbTone:"warn", fb, log };
    }
    function badChoice(label, sub, delta, score, fb, log){
      return { label, sub, delta, score, fbTone:"bad", fb, log };
    }

    function makeScriptGroceryCashier(){
      return [
        {
          id:"intro",
          title:"First impression",
          text:"Hi! I’m Ms. Rivera, the front-end manager. Thanks for coming in. Ready to start your cashier interview?",
          choices:[
            goodChoice("Yes, thank you for having me today.", "Professional and confident.", {pro:+8,cus:+2,team:+1,acc:+0}, +10,
              "Great start—polite and confident.", "Strong opener: polite + confident."),
            warnChoice("Yeah… sure.", "Sounds unsure—try confident.", {pro:-4,cus:-1,team:+0,acc:+0}, +1,
              "Try sounding more confident: ‘Yes, thank you for meeting with me.’", "Confidence matters at the start."),
            badChoice("Can we hurry? I don’t like interviews.", "Too negative too soon.", {pro:-10,cus:-3,team:-1,acc:+0}, -6,
              "Even if you’re nervous, keep it positive and respectful.", "Keep it positive—even if nervous."),
            goodChoice("Good afternoon! I’m excited to learn about the job.", "Friendly + motivated.", {pro:+6,cus:+6,team:+1,acc:+0}, +12,
              "Nice energy—friendly and ready.", "Great first impression: friendly and motivated.")
          ],
          next:"why"
        },
        {
          id:"why",
          title:"Why this job?",
          text:"Why do you want to work at FreshMart as a cashier?",
          choices:[
            goodChoice("I like helping people, and I’m careful with details like prices and change.", "Customer service + accuracy.", {pro:+6,cus:+7,team:+1,acc:+6}, +14,
              "That fits cashier work perfectly: helpful and accurate.", "Great: helpful + accurate."),
            warnChoice("I just need a job.", "Add skills + attitude.", {pro:-2,cus:+0,team:+0,acc:+0}, +2,
              "That’s honest, but add what you’ll bring: reliability, politeness, learning fast.", "Tip: show what you bring to the job."),
            goodChoice("I’m dependable and I want experience working with customers.", "Good reason + growth.", {pro:+7,cus:+4,team:+1,acc:+1}, +12,
              "Solid. Dependability and customer experience matter.", "Good: dependable + wants experience."),
            badChoice("Because it looks easy.", "Cashiering isn’t ‘easy’—it’s skill.", {pro:-7,cus:-2,team:+0,acc:-2}, -4,
              "Cashiers juggle accuracy, speed, and people skills.", "Avoid calling jobs ‘easy.’")
          ],
          next:"reliable"
        },
        {
          id:"reliable",
          title:"Reliability check",
          text:"You’re scheduled at 4:00. Your ride texts that they’ll be 15 minutes late. What do you do?",
          choices:[
            goodChoice("Call the store right away and explain. Then arrive as soon as possible.", "Communicate early.", {pro:+8,cus:+0,team:+6,acc:+0}, +14,
              "Perfect—early communication shows responsibility.", "Strong reliability: communicate early."),
            warnChoice("Show up late and explain after.", "Too late—call first.", {pro:-3,cus:+0,team:-3,acc:+0}, +1,
              "Better to call as soon as you know you’ll be late.", "Call early if you’ll be late."),
            badChoice("Don’t go in. It’s not my fault.", "Still your responsibility.", {pro:-10,cus:+0,team:-6,acc:+0}, -8,
              "Even if it’s not your fault, you must communicate and show up.", "Always communicate and try to get there."),
            goodChoice("Ask for another ride AND call the store to update them.", "Problem-solving + communication.", {pro:+7,cus:+0,team:+6,acc:+0}, +15,
              "Excellent—solved the problem and communicated.", "Great: solves + communicates.")
          ],
          next:"scan"
        },
        {
          id:"scan",
          title:"Barcode won’t scan",
          text:"A box of cereal won’t scan. The line is waiting. What’s your best move?",
          choices:[
            goodChoice("Try again, check the barcode, then type the code or use lookup if trained.", "Accurate + efficient.", {pro:+4,cus:+3,team:+1,acc:+8}, +14,
              "Yes—retry, verify, then use approved backup steps.", "Great: verify then use proper backup."),
            badChoice("Guess the price to keep the line moving.", "Fast… and wrong.", {pro:-8,cus:-3,team:+0,acc:-12}, -10,
              "Never guess prices. Accuracy protects the customer and store.", "Never guess—verify."),
            warnChoice("Set it aside and scan everything else without telling the customer.", "Communicate.", {pro:-2,cus:-2,team:+0,acc:+0}, +1,
              "Tell the customer what you’re doing so they don’t feel ignored.", "Communicate what you’re doing."),
            goodChoice("Ask a coworker for a price check if needed, while staying polite.", "Uses teamwork.", {pro:+3,cus:+5,team:+6,acc:+3}, +12,
              "Good—get help and keep the customer informed.", "Good: teamwork + communication.")
          ],
          next:"bag"
        },
        {
          id:"bag",
          title:"Bagging basics",
          text:"You’re bagging eggs, bread, canned soup, and cleaning spray. What do you do?",
          choices:[
            goodChoice("Put cans on bottom, eggs/bread on top, and separate chemicals from food.", "Safety + common sense.", {pro:+2,cus:+6,team:+1,acc:+7}, +15,
              "Exactly. Heavy bottom, fragile top, chemicals separate.", "Great bagging: heavy bottom + fragile top + separate chemicals."),
            warnChoice("Bag it all together but be careful.", "Still risky.", {pro:+0,cus:+1,team:+0,acc:-2}, +4,
              "Even careful bagging should separate chemicals from food.", "Separate chemicals from food."),
            badChoice("Put the eggs on the bottom so they don’t fall out.", "Egg massacre.", {pro:-4,cus:-6,team:+0,acc:-4}, -6,
              "Fragile items go on top or in a separate bag.", "Fragile items belong on top."),
            goodChoice("Ask the customer if they want certain items double-bagged.", "Customer-focused.", {pro:+2,cus:+7,team:+0,acc:+3}, +12,
              "Nice—customer preference matters (and prevents rips).", "Good: asks customer preference.")
          ],
          next:"coupon"
        },
        {
          id:"coupon",
          title:"Coupons + price checks",
          text:"A customer hands you a coupon and says the shelf sign showed a different price. What do you do first?",
          choices:[
            goodChoice("Stay calm, listen, and request a price check if needed.", "Verify politely.", {pro:+4,cus:+9,team:+3,acc:+4}, +15,
              "Yes—listen and verify. No arguing.", "Great: calm + verify."),
            badChoice("Tell them the register is always correct.", "Not always… and it escalates.", {pro:-6,cus:-10,team:-1,acc:+0}, -8,
              "Better: verify the price and use store process.", "Don’t argue—verify."),
            warnChoice("Take the coupon even if it looks expired to avoid conflict.", "Accuracy matters.", {pro:-2,cus:+1,team:+0,acc:-6}, +1,
              "You can be kind while following rules—ask a supervisor if unsure.", "Follow policy; ask for help."),
            goodChoice("Explain you’ll check the coupon rules and call a supervisor if unsure.", "Professional + policy.", {pro:+6,cus:+5,team:+5,acc:+3}, +13,
              "Good: honest, polite, uses support.", "Good: follows policy + asks for help.")
          ],
          next:"rush"
        },
        {
          id:"rush",
          title:"Rush hour",
          text:"The line is getting long and you feel pressured. What matters most?",
          choices:[
            goodChoice("Be fast AND accurate. If I’m unsure, I’ll ask for help.", "Speed with accuracy.", {pro:+5,cus:+3,team:+4,acc:+6}, +14,
              "Perfect: speed matters, but accuracy matters more.", "Great: fast + accurate + asks for help."),
            warnChoice("Speed only. Accuracy later.", "Accuracy isn’t optional.", {pro:-2,cus:+0,team:+0,acc:-6}, +2,
              "Wrong prices and wrong change create bigger problems.", "Accuracy is always part of the job."),
            badChoice("Panic quietly and hope nobody notices mistakes.", "They notice.", {pro:-8,cus:-3,team:-2,acc:-8}, -8,
              "If you feel overwhelmed, take a breath and ask for help.", "Calm down and ask for help."),
            goodChoice("Keep a calm voice, scan carefully, and thank customers for waiting.", "Customer service during stress.", {pro:+4,cus:+8,team:+1,acc:+3}, +13,
              "That’s what pros do—calm and polite under pressure.", "Great: calm + polite under pressure.")
          ],
          next:"mistake"
        },
        {
          id:"mistake",
          title:"If you make a mistake",
          text:"You realize you scanned an item twice. What do you do?",
          choices:[
            goodChoice("Apologize, fix it using the correct store process, and ask for help if needed.", "Honest + fixes it.", {pro:+8,cus:+6,team:+3,acc:+6}, +15,
              "Exactly—own it and fix it correctly.", "Great: owns mistake + fixes properly."),
            warnChoice("Ignore it unless the customer notices.", "Trust matters.", {pro:-4,cus:-3,team:+0,acc:-3}, 0,
              "Better to fix mistakes quickly—customers notice totals.", "Fix mistakes right away."),
            badChoice("Delete a random item to ‘balance it out’.", "Nope.", {pro:-10,cus:-6,team:+0,acc:-10}, -10,
              "Never ‘balance’ by guessing—fix the real error.", "Never delete random items."),
            goodChoice("Call a supervisor for a void if I’m not trained, and keep the customer informed.", "Correct escalation.", {pro:+6,cus:+5,team:+6,acc:+3}, +12,
              "Good judgement—use training and keep the customer updated.", "Good: calls supervisor appropriately.")
          ],
          next:"task"
        },
        { id:"task", title:"Accuracy check: Make change", text:"Quick money task. Build the correct change to continue.", task:true, next:"theft" },

        {
          id:"theft",
          title:"Loss prevention",
          text:"You think a customer might be trying to steal or scam. What should you do?",
          choices:[
            goodChoice("Stay polite, follow policy, and quietly alert a manager.", "Safety + policy.", {pro:+7,cus:+2,team:+7,acc:+2}, +12,
              "Correct—never accuse. Follow the process.", "Great: polite + alert manager."),
            badChoice("Accuse them loudly so they stop.", "Unsafe + unprofessional.", {pro:-10,cus:-8,team:-3,acc:+0}, -10,
              "Don’t accuse. Get a manager/security.", "Never accuse—get a manager."),
            warnChoice("Do nothing because it’s not my job.", "You still report concerns.", {pro:-3,cus:+0,team:-4,acc:+0}, +1,
              "Report concerns to a manager—quietly.", "Quietly report concerns."),
            goodChoice("Ask a manager for help with a ‘policy question’ to slow things down calmly.", "Smart de-escalation.", {pro:+6,cus:+3,team:+6,acc:+1}, +11,
              "Nice—keeps it calm and gets support.", "Smart: calm + gets support.")
          ],
          next:"ask"
        },
        {
          id:"ask",
          title:"Your turn",
          text:"The interview is ending. What’s a strong question to ask the manager?",
          choices:[
            goodChoice("How does cashier training work, and what should I learn first?", "Shows you care about learning.", {pro:+7,cus:+2,team:+2,acc:+1}, +11,
              "Great question—focused on training and success.", "Strong: asks about training."),
            warnChoice("How soon can I take breaks?", "Valid… but not best first question.", {pro:-2,cus:+0,team:+0,acc:+0}, +2,
              "Better: ask about training, expectations, or schedule first.", "Better questions: training and expectations."),
            goodChoice("What does a great cashier do during busy times?", "Role-specific and smart.", {pro:+6,cus:+2,team:+2,acc:+2}, +12,
              "Excellent—shows you want to do it right.", "Great: asks about ‘great performance’."),
            badChoice("So… do I have the job or not?", "Too pushy.", {pro:-6,cus:-2,team:+0,acc:+0}, -2,
              "Stay professional. Ask about next steps instead.", "Ask about next steps politely.")
          ],
          next:"close"
        },
        {
          id:"close",
          title:"Closing pitch",
          text:"Give a strong final sentence: why should we hire you?",
          choices:[
            goodChoice("I’m reliable, respectful, and accurate. I’ll stay calm and ask for help when needed.", "Hiring answer.", {pro:+8,cus:+6,team:+4,acc:+7}, +18,
              "That’s a strong closing—reliable, calm, accurate.", "Great close: reliable + calm + accurate."),
            warnChoice("I’ll try my best.", "Too vague.", {pro:-1,cus:+1,team:+0,acc:+0}, +3,
              "Add specifics: accuracy, customer service, reliability.", "Add specific strengths."),
            goodChoice("I’m friendly with customers and careful with scanning and change.", "Role-specific strengths.", {pro:+6,cus:+7,team:+1,acc:+6}, +16,
              "Excellent—friendly and accurate fits the job.", "Great: friendly + accurate."),
            badChoice("I won’t cause problems.", "Low bar.", {pro:-5,cus:-2,team:+0,acc:+0}, -1,
              "Aim higher: say what you WILL do well.", "Say what you’ll do well.")
          ],
          next:"results"
        },
        { id:"results", title:"Results!", text:"Let’s see how interview-ready you are.", results:true }
      ];
    }

    function makeScriptCafeteriaCashier(){
      return [
        {
          id:"intro",
          title:"Welcome to the cafeteria",
          text:"Hi! I’m Mr. Jenkins. We need someone who can be kind, fast, and accurate. Ready?",
          choices:[
            goodChoice("Yes sir—thank you for meeting with me.", "Respectful start.", {pro:+8,cus:+2,team:+1,acc:+0}, +10,
              "Great—respectful and confident.", "Great opener: respectful + confident."),
            warnChoice("Yeah. I guess.", "Confidence helps.", {pro:-4,cus:-1,team:+0,acc:+0}, +1,
              "Try a confident greeting next time.", "Confidence helps at the start."),
            goodChoice("Absolutely. I’m ready to learn and work hard.", "Strong attitude.", {pro:+6,cus:+5,team:+2,acc:+1}, +12,
              "Nice—good attitude matters here.", "Good: ready to learn + work hard."),
            badChoice("As long as nobody yells at me.", "Negative framing.", {pro:-8,cus:-2,team:+0,acc:+0}, -4,
              "Keep it positive. You can say you stay calm under pressure.", "Keep it positive.")
          ],
          next:"foodsafe"
        },
        {
          id:"foodsafe",
          title:"Food safety",
          text:"In the cafeteria, what’s the best rule to follow every day?",
          choices:[
            goodChoice("Wash hands, keep surfaces clean, and follow rules for gloves/hair nets.", "Correct priorities.", {pro:+6,cus:+1,team:+2,acc:+4}, +12,
              "Yes—clean hands and clean station matter.", "Great: hygiene + rules."),
            warnChoice("Just don’t drop food.", "Too narrow.", {pro:-2,cus:+0,team:+0,acc:-1}, +2,
              "Food safety includes hands, surfaces, and clean procedures.", "Food safety is more than not dropping food."),
            badChoice("If it looks clean, it’s fine.", "Nope.", {pro:-6,cus:+0,team:+0,acc:-4}, -5,
              "We follow procedures, not guesses.", "Follow procedures, not guesses."),
            goodChoice("Follow directions from kitchen staff and keep my area clean.", "Teamwork + cleanliness.", {pro:+5,cus:+1,team:+5,acc:+2}, +11,
              "Good—listen and keep it clean.", "Good: listens + keeps area clean.")
          ],
          next:"account"
        },
        {
          id:"account",
          title:"Student account issue",
          text:"A student says: “I don’t have money on my account.” What’s the best response?",
          choices:[
            goodChoice("Speak quietly, check the account, and follow the cafeteria process.", "Respect + privacy.", {pro:+7,cus:+8,team:+3,acc:+3}, +14,
              "Exactly—privacy and process.", "Great: quiet + checks account + follows process."),
            badChoice("Say it loudly so the line knows to move on.", "Embarrassing.", {pro:-8,cus:-10,team:+0,acc:+0}, -9,
              "We protect student privacy. Keep your voice low.", "Protect privacy."),
            warnChoice("Skip them and tell them to go away.", "Needs respect.", {pro:-4,cus:-6,team:+0,acc:+0}, -1,
              "Be respectful and follow the plan (ask supervisor if unsure).", "Be respectful and follow the plan."),
            goodChoice("Ask a supervisor if you’re unsure, and keep the student treated with respect.", "Good judgement.", {pro:+6,cus:+6,team:+6,acc:+1}, +12,
              "Good—ask for help, stay respectful.", "Good: asks for help + respectful.")
          ],
          next:"speed"
        },
        {
          id:"speed",
          title:"Keep the line moving",
          text:"Lunch line is packed. How do you keep things moving without mistakes?",
          choices:[
            goodChoice("One student at a time, repeat the total, and stay calm and accurate.", "Speed with control.", {pro:+5,cus:+2,team:+1,acc:+8}, +14,
              "Perfect—fast but accurate.", "Great: calm + accurate."),
            warnChoice("Go super fast and hope it’s right.", "Risky.", {pro:-1,cus:+0,team:+0,acc:-6}, +2,
              "Mistakes slow the line more later.", "Accuracy prevents bigger delays."),
            badChoice("Yell at students to hurry up.", "Nope.", {pro:-10,cus:-10,team:-2,acc:+0}, -10,
              "Keep a calm tone. You can be firm without yelling.", "No yelling—stay calm."),
            goodChoice("If I’m unsure, I’ll pause and ask for help rather than guess.", "Better to ask than guess.", {pro:+6,cus:+1,team:+6,acc:+5}, +12,
              "Yes—asking prevents bigger problems.", "Good: asks instead of guessing.")
          ],
          next:"allergy"
        },
        {
          id:"allergy",
          title:"Allergy note",
          text:"A student says they have a food allergy and asks if something is safe. What do you do?",
          choices:[
            goodChoice("Don’t guess. Ask kitchen staff/supervisor and follow allergy procedures.", "Safety first.", {pro:+7,cus:+4,team:+6,acc:+4}, +15,
              "Correct—never guess with allergies.", "Great: doesn’t guess, asks staff."),
            warnChoice("Tell them it’s probably fine.", "Not safe.", {pro:-4,cus:+0,team:+0,acc:-6}, -2,
              "Allergies require certainty and procedure.", "Never say ‘probably’ with allergies."),
            badChoice("Ignore them because the line is long.", "Safety is non-negotiable.", {pro:-8,cus:-8,team:+0,acc:-4}, -8,
              "Safety comes first. Get help quickly.", "Safety first—even during rush."),
            goodChoice("Ask them to wait a moment while you confirm with staff.", "Clear communication.", {pro:+6,cus:+5,team:+4,acc:+2}, +12,
              "Good—clear and safe.", "Good: communicates and checks.")
          ],
          next:"behavior"
        },
        {
          id:"behavior",
          title:"Cranky customer",
          text:"A student is rude and says, “This place is slow.” How do you respond?",
          choices:[
            goodChoice("Stay calm: ‘Thanks for waiting. I’ll help you next.’", "Professional tone.", {pro:+6,cus:+8,team:+1,acc:+0}, +12,
              "That’s professional and calm.", "Great: calm and polite."),
            warnChoice("Match their attitude so they stop.", "Escalates.", {pro:-4,cus:-6,team:+0,acc:+0}, -1,
              "Keep your tone calm and respectful.", "Don’t match attitude—stay calm."),
            badChoice("Argue with them in front of everyone.", "Not it.", {pro:-10,cus:-10,team:-2,acc:+0}, -10,
              "Never argue. Use calm, short responses.", "Don’t argue—stay calm."),
            goodChoice("Use a calm voice and focus on the next step of the process.", "Keep it moving.", {pro:+5,cus:+4,team:+1,acc:+2}, +10,
              "Nice—calm and task-focused.", "Good: calm and task-focused.")
          ],
          next:"mistake"
        },
        {
          id:"mistake",
          title:"If you mess up",
          text:"You charged the wrong meal type. What do you do?",
          choices:[
            goodChoice("Fix it using the approved process and let the supervisor know if needed.", "Own it + fix it.", {pro:+7,cus:+3,team:+4,acc:+7}, +14,
              "Yes—own it and fix it correctly.", "Great: owns and fixes."),
            warnChoice("Ignore it so the line stays fast.", "Errors snowball.", {pro:-3,cus:-2,team:+0,acc:-4}, 0,
              "Fixing now prevents bigger issues later.", "Fix it now, not later."),
            badChoice("Blame the student.", "Unprofessional.", {pro:-8,cus:-8,team:-2,acc:+0}, -8,
              "Stay professional. Fix the error.", "No blame—fix it."),
            goodChoice("Ask for help if you’re unsure how to correct it.", "Good judgement.", {pro:+6,cus:+2,team:+6,acc:+4}, +12,
              "Good—ask for help rather than guessing.", "Ask for help instead of guessing.")
          ],
          next:"task"
        },
        { id:"task", title:"Accuracy check: Make change", text:"Quick money task. Build correct change to continue.", task:true, next:"team" },
        {
          id:"team",
          title:"Teamwork with kitchen staff",
          text:"Kitchen staff asks you to slow the line for a moment while they restock milk. What do you do?",
          choices:[
            goodChoice("Communicate to students calmly and follow staff directions.", "Teamwork + communication.", {pro:+6,cus:+5,team:+8,acc:+1}, +13,
              "Great—calm communication keeps things smooth.", "Good: communicates and follows staff directions."),
            warnChoice("Ignore them because students will complain.", "Teamwork matters.", {pro:-3,cus:-1,team:-5,acc:+0}, 0,
              "Better: brief explanation to students and follow the plan.", "Follow staff direction and communicate."),
            badChoice("Argue with staff in front of students.", "Bad look.", {pro:-8,cus:-4,team:-10,acc:+0}, -10,
              "Handle disagreements privately and respectfully.", "Don’t argue in public."),
            goodChoice("Ask the supervisor what to say, then calmly manage the line.", "Uses support.", {pro:+5,cus:+3,team:+6,acc:+1}, +11,
              "Good—uses support and stays calm.", "Good: uses support.")
          ],
          next:"ask"
        },
        {
          id:"ask",
          title:"Ask a smart question",
          text:"What’s a strong question to ask at the end?",
          choices:[
            goodChoice("How will I be trained on accounts and meal rules?", "Role-specific training question.", {pro:+7,cus:+2,team:+2,acc:+2}, +11,
              "Great—shows you want to learn the system.", "Strong: training on accounts/rules."),
            warnChoice("Can I leave early if it’s slow?", "Not ideal timing.", {pro:-2,cus:+0,team:+0,acc:+0}, +1,
              "Ask about training and expectations first.", "Better: ask about training/expectations."),
            goodChoice("What does a great cafeteria cashier do during a rush?", "Performance-focused.", {pro:+6,cus:+1,team:+2,acc:+2}, +11,
              "Excellent—focused on doing well.", "Great: asks about great performance."),
            badChoice("Do I get free snacks?", "Nope.", {pro:-8,cus:+0,team:+0,acc:+0}, -6,
              "Stay professional—ask about expectations and training.", "Stay professional.")
          ],
          next:"close"
        },
        {
          id:"close",
          title:"Closing pitch",
          text:"One sentence: why should we hire you?",
          choices:[
            goodChoice("I’m reliable, respectful, and accurate. I’ll treat students with kindness and follow rules.", "Perfect fit.", {pro:+8,cus:+8,team:+3,acc:+6}, +18,
              "That’s a great cafeteria closing.", "Great close: kind + accurate + follows rules."),
            warnChoice("I’ll do whatever you tell me.", "Needs confidence.", {pro:+1,cus:+0,team:+1,acc:+0}, +4,
              "Add your strengths: calm, accurate, respectful.", "Add strengths, not just obedience."),
            goodChoice("I stay calm under pressure and I’m careful with money and totals.", "Role-specific.", {pro:+6,cus:+2,team:+1,acc:+8}, +16,
              "Excellent—calm + accurate.", "Great: calm + accurate."),
            badChoice("I won’t mess up much.", "Low bar.", {pro:-4,cus:-1,team:+0,acc:+0}, -1,
              "Say what you WILL do well.", "Say what you’ll do well.")
          ],
          next:"results"
        },
        { id:"results", title:"Results!", text:"Let’s see how interview-ready you are.", results:true }
      ];
    }


    function makeScriptBarista(){
      return [
        {
          id:"intro",
          title:"Coffee shop interview",
          text:"Hey! I’m Ava. We get busy fast in the mornings. Ready to practice a barista interview?",
          choices:[
            goodChoice("Yes—thank you for meeting with me!", "Friendly + confident.", {pro:+6,cus:+7,team:+1,acc:+0}, +11,
              "Great vibe—friendly and ready.", "Great opener: friendly and ready."),
            warnChoice("Um… yeah.", "Try stronger confidence.", {pro:-3,cus:-1,team:+0,acc:+0}, +1,
              "Try: ‘Yes, thank you for meeting with me.’", "Confidence helps."),
            badChoice("Are you going to teach me everything? I don’t know anything.", "Too negative.", {pro:-7,cus:-2,team:+0,acc:+0}, -4,
              "Better: say you’re ready to learn and follow recipes.", "Say you’re ready to learn."),
            goodChoice("Absolutely—I'm excited to learn your drink menu and do things the right way.", "Learning mindset.", {pro:+7,cus:+4,team:+2,acc:+2}, +12,
              "Nice—shows you’ll learn the menu and follow standards.", "Good: wants to learn the menu.")
          ],
          next:"about"
        },
        {
          id:"about",
          title:"Tell me about you",
          text:"Tell me about yourself in 1–2 sentences.",
          choices:[
            goodChoice("I’m dependable, I learn fast, and I like working with people.", "Short and strong.", {pro:+7,cus:+4,team:+2,acc:+1}, +12,
              "Great—reliable and people-focused.", "Good: dependable + learns fast."),
            warnChoice("I don’t know what to say.", "You can prepare a simple line.", {pro:-3,cus:-1,team:+0,acc:+0}, 0,
              "Try: dependable + friendly + ready to learn.", "Practice a simple 1–2 sentence intro."),
            goodChoice("I’m calm under pressure, and I’m careful about following directions and recipes.", "Job-specific strengths.", {pro:+6,cus:+2,team:+1,acc:+7}, +12,
              "Nice—calm + follows recipes.", "Good: calm + follows recipes."),
            badChoice("I’m just here because my friend works here.", "Not a great pitch.", {pro:-6,cus:-2,team:+0,acc:+0}, -2,
              "Better to share your strengths and reliability.", "Focus on your strengths.")
          ],
          next:"service"
        },
        {
          id:"service",
          title:"Customer service in a café",
          text:"What does great customer service look like in a coffee shop?",
          choices:[
            goodChoice("Greet people, repeat the order, and communicate wait times politely.", "Clear and calm.", {pro:+5,cus:+10,team:+1,acc:+2}, +14,
              "Yes—repeat orders and communicate delays.", "Great: repeats order + communicates wait."),
            warnChoice("Just be fast.", "Speed matters, but clarity matters too.", {pro:+0,cus:+1,team:+0,acc:+0}, +5,
              "Add: polite greeting, repeat order, stay calm.", "Add polite + repeat order."),
            badChoice("If they’re rude, I’ll be rude back.", "No.", {pro:-10,cus:-10,team:-2,acc:+0}, -10,
              "Keep a calm tone even when customers aren’t.", "Don’t match rudeness."),
            goodChoice("Be friendly, listen, and fix problems respectfully.", "Solid.", {pro:+6,cus:+8,team:+1,acc:+1}, +12,
              "Great—listen and solve respectfully.", "Good: listens and solves.")
          ],
          next:"order"
        },
        {
          id:"order",
          title:"Order accuracy",
          text:"Customer orders: ‘Iced vanilla latte… oat milk… and light ice.’ What’s your best habit?",
          choices:[
            goodChoice("Repeat the order back and label it clearly before making it.", "Accuracy habit.", {pro:+4,cus:+5,team:+1,acc:+9}, +14,
              "Perfect—repeat + label clearly.", "Great: repeats and labels."),
            warnChoice("Make it from memory so you’re faster.", "Risky with modifications.", {pro:+0,cus:+0,team:+0,acc:-4}, +3,
              "Modifications need clarity—repeat and label.", "Repeat and label modifications."),
            badChoice("If you forget, just guess.", "No guessing.", {pro:-8,cus:-3,team:+0,acc:-10}, -10,
              "No guessing. Ask or remake correctly.", "Never guess—ask."),
            goodChoice("If I’m unsure, ask a teammate or check the recipe card.", "Uses training.", {pro:+6,cus:+2,team:+6,acc:+5}, +12,
              "Yes—use the recipe card or ask for help.", "Good: checks recipe card/asks.")
          ],
          next:"allergy"
        },
        {
          id:"allergy",
          title:"Allergy moment",
          text:"Customer says: ‘I have a dairy allergy—can you make this safe?’ What do you do?",
          choices:[
            goodChoice("Don’t guess. Ask a supervisor and follow allergy procedures.", "Safety first.", {pro:+7,cus:+6,team:+6,acc:+3}, +15,
              "Correct—no guessing with allergies.", "Great: follows allergy procedure."),
            warnChoice("Say ‘probably’ and use almond milk.", "Still risky.", {pro:-4,cus:-2,team:+0,acc:-4}, -2,
              "Allergies require clear procedures and equipment awareness.", "No ‘probably’ with allergies."),
            badChoice("Tell them to order something else.", "Unhelpful.", {pro:-6,cus:-8,team:+0,acc:+0}, -6,
              "Offer to get help and do it safely.", "Be helpful and safe."),
            goodChoice("Explain you’ll check the safe steps and keep them updated.", "Good communication.", {pro:+6,cus:+7,team:+2,acc:+1}, +12,
              "Nice—clear and safe.", "Good: communicates and checks.")
          ],
          next:"safety"
        },
        {
          id:"safety",
          title:"Safety with equipment",
          text:"The steam wand is hot and can burn. What do you do?",
          choices:[
            goodChoice("Follow training, keep hands clear, wipe/purge after use, and stay focused.", "Safe procedure.", {pro:+7,cus:+0,team:+2,acc:+5}, +12,
              "Correct—follow the safety routine.", "Great: follows safety routine."),
            warnChoice("Be careful and hope nothing happens.", "Need procedure.", {pro:-1,cus:+0,team:+0,acc:-2}, +2,
              "Safety is procedures, not hope.", "Use procedures, not hope."),
            badChoice("Rush it because customers are waiting.", "Unsafe.", {pro:-8,cus:+0,team:+0,acc:-4}, -6,
              "Safety comes first. Burns slow you down more.", "Safety first."),
            goodChoice("Ask for help if I’m not trained yet.", "Good judgement.", {pro:+6,cus:+0,team:+6,acc:+1}, +10,
              "Yes—ask for help rather than guessing.", "Good: asks if not trained.")
          ],
          next:"clean"
        },
        {
          id:"clean",
          title:"Cleanliness",
          text:"What should you do when there are no customers for a few minutes?",
          choices:[
            goodChoice("Wipe counters, restock cups/lids, and prep for the next rush.", "Pro move.", {pro:+6,cus:+1,team:+2,acc:+3}, +12,
              "Exactly—clean and restock.", "Great: cleans and restocks."),
            warnChoice("Relax and wait until someone tells you.", "Be proactive.", {pro:-2,cus:+0,team:+0,acc:+0}, +2,
              "Look for tasks: wipe, restock, dishes, labels.", "Be proactive."),
            badChoice("Use my phone.", "Not on shift.", {pro:-8,cus:+0,team:+0,acc:+0}, -6,
              "Stay professional and productive.", "Stay off phone."),
            goodChoice("Ask a coworker what needs done next.", "Team communication.", {pro:+5,cus:+0,team:+6,acc:+0}, +10,
              "Good—communicates and stays busy.", "Good: asks what needs done.")
          ],
          next:"rush"
        },
        {
          id:"rush",
          title:"Morning rush",
          text:"Five drinks are waiting, and a customer asks ‘How much longer?’ What’s best?",
          choices:[
            goodChoice("Give a calm estimate and thank them for waiting.", "Communication wins.", {pro:+5,cus:+9,team:+1,acc:+0}, +12,
              "Yes—calm estimate and gratitude.", "Great: clear wait-time communication."),
            warnChoice("Say ‘I don’t know’ and keep working.", "Too dismissive.", {pro:-2,cus:-3,team:+0,acc:+0}, 0,
              "Try a short estimate or ask a teammate to check.", "Give a short estimate politely."),
            badChoice("Snap: ‘Can’t you see we’re busy?’", "Nope.", {pro:-8,cus:-10,team:-1,acc:+0}, -10,
              "Keep it calm and professional.", "Stay calm and professional."),
            goodChoice("Ask a teammate to update them while you keep making drinks correctly.", "Teamwork.", {pro:+4,cus:+5,team:+8,acc:+2}, +11,
              "Good teamwork during rush.", "Good: teamwork and accuracy.")
          ],
          next:"mistake"
        },
        {
          id:"mistake",
          title:"Wrong drink made",
          text:"You made a drink and realize it’s the wrong size. What do you do?",
          choices:[
            goodChoice("Own it, remake it correctly, and communicate the wait time politely.", "Honest + fixes.", {pro:+8,cus:+7,team:+2,acc:+7}, +15,
              "Correct—remake and communicate.", "Great: owns it and remakes."),
            warnChoice("Give it anyway and hope they don’t notice.", "They notice.", {pro:-4,cus:-4,team:+0,acc:-6}, -1,
              "Better to remake than disappoint.", "Remake rather than hope."),
            badChoice("Blame the customer for ordering wrong.", "Nope.", {pro:-10,cus:-10,team:-2,acc:+0}, -10,
              "Stay respectful. Fix the drink.", "Don’t blame—fix it."),
            goodChoice("Ask a teammate to help remake while you take the next order.", "Teamwork under pressure.", {pro:+5,cus:+4,team:+8,acc:+4}, +13,
              "Nice—keeps the line moving and fixes the issue.", "Good: teamwork to fix fast.")
          ],
          next:"task"
        },
        { id:"task", title:"Accuracy check: Make change", text:"Quick money task. Build correct change to continue.", task:true, next:"availability" },
        {
          id:"availability",
          title:"Schedule reality",
          text:"This café needs early mornings and weekends. What’s a good answer?",
          choices:[
            goodChoice("I can do early shifts and weekends. If something changes, I’ll communicate early.", "Reliable.", {pro:+8,cus:+1,team:+4,acc:+0}, +12,
              "Great—availability + communication.", "Good: available and communicates."),
            warnChoice("I can work… maybe. Depends.", "Too vague.", {pro:-2,cus:+0,team:+0,acc:+0}, +2,
              "Be clear about what you CAN do.", "Be clear about availability."),
            badChoice("I can’t do mornings or weekends.", "Probably not a fit.", {pro:-6,cus:+0,team:+0,acc:+0}, -4,
              "If that’s true, the job may not fit.", "This job often needs mornings/weekends."),
            goodChoice("I can work some mornings, and I’m flexible with notice.", "Reasonable.", {pro:+6,cus:+0,team:+3,acc:+0}, +10,
              "Good—clear and flexible.", "Good: clear and flexible.")
          ],
          next:"ask"
        },
        {
          id:"ask",
          title:"Your question",
          text:"Pick a strong question to ask the interviewer.",
          choices:[
            goodChoice("How do you train new baristas on recipes and equipment?", "Shows learning mindset.", {pro:+7,cus:+2,team:+2,acc:+2}, +11,
              "Great question—training-focused.", "Strong: training question."),
            warnChoice("How soon do I get free drinks?", "Not ideal now.", {pro:-2,cus:+0,team:+0,acc:+0}, +1,
              "Ask about training, expectations, and schedule first.", "Ask about training/expectations."),
            goodChoice("What does a great barista do during the busiest hour?", "Performance-focused.", {pro:+6,cus:+1,team:+2,acc:+2}, +11,
              "Excellent—focused on doing well.", "Great: asks about great performance."),
            badChoice("So… do I have the job?", "Too pushy.", {pro:-6,cus:-2,team:+0,acc:+0}, -2,
              "Ask about next steps instead.", "Ask about next steps politely.")
          ],
          next:"close"
        },
        {
          id:"close",
          title:"Closing pitch",
          text:"Why should we hire you as a barista?",
          choices:[
            goodChoice("I’m friendly, accurate with recipes, and I can stay calm during a rush.", "Exactly the job.", {pro:+7,cus:+7,team:+2,acc:+7}, +18,
              "That’s a hiring answer for a café.", "Great close: friendly + accurate + calm."),
            warnChoice("Because coffee is cool.", "Not a skills pitch.", {pro:+0,cus:+0,team:+0,acc:+0}, +3,
              "Add job skills: accuracy, communication, cleanliness.", "Add skills, not vibes."),
            goodChoice("I learn fast, follow training, and ask questions when I’m unsure.", "Trainable and safe.", {pro:+8,cus:+2,team:+5,acc:+4}, +14,
              "Great—trainable, safe, and accurate.", "Good: trainable and asks questions."),
            badChoice("I’ll try not to mess up.", "Low bar.", {pro:-4,cus:-2,team:+0,acc:+0}, -1,
              "Say what you WILL do well.", "Say what you’ll do well.")
          ],
          next:"results"
        },
        { id:"results", title:"Results!", text:"Let’s see how interview-ready you are.", results:true }
      ];
    }



    function makeScriptMovieConcessions(){
      return [
        {
          id:"intro",
          title:"StarLite interview",
          text:"Hey, I’m Jordan. We run tickets and concessions. It gets loud and busy. Ready?",
          choices:[
            goodChoice("Yes—thanks for meeting with me.", "Calm + professional.", {pro:+8,cus:+2,team:+1,acc:+0}, +10,
              "Strong start.", "Good opener."),
            warnChoice("Yeah. Whatever.", "Too casual.", {pro:-6,cus:-2,team:+0,acc:+0}, -1,
              "Try a respectful greeting.", "Use a respectful greeting."),
            goodChoice("Absolutely. I’m ready to be friendly and work fast without mistakes.", "Great goal.", {pro:+6,cus:+6,team:+1,acc:+4}, +12,
              "Nice—fast and accurate.", "Good: fast + accurate."),
            badChoice("Only if I don’t have to clean anything.", "Cleaning is part of it.", {pro:-8,cus:+0,team:+0,acc:+0}, -6,
              "Concessions requires cleaning and safety.", "Cleaning is part of the job.")
          ],
          next:"about"
        },
        {
          id:"about",
          title:"Tell me about you",
          text:"Tell me about yourself and why you’d be good here.",
          choices:[
            goodChoice("I’m dependable, I stay calm, and I can be friendly with customers.", "Good fit.", {pro:+7,cus:+6,team:+2,acc:+1}, +12,
              "Great—dependable and calm.", "Good: dependable + calm."),
            warnChoice("I just want to work somewhere.", "Add skills.", {pro:-2,cus:+0,team:+0,acc:+0}, +2,
              "Add your strengths: friendly, accurate, reliable.", "Add strengths."),
            goodChoice("I’m good at following rules and I learn routines quickly.", "Role fit.", {pro:+7,cus:+1,team:+2,acc:+4}, +11,
              "Nice—rules and routines matter here.", "Good: follows rules."),
            badChoice("I don’t really like talking to people.", "Not a fit.", {pro:-10,cus:-10,team:+0,acc:+0}, -10,
              "This job is customer-facing.", "Customer-facing role.")
          ],
          next:"policy"
        },
        {
          id:"policy",
          title:"Age rating policy",
          text:"A group tries to buy tickets for an R-rated movie and looks underage. What do you do?",
          choices:[
            goodChoice("Follow policy: ask for ID or call a supervisor.", "Policy + safety.", {pro:+7,cus:+2,team:+6,acc:+2}, +12,
              "Correct—policy and supervisor support.", "Great: follows policy."),
            badChoice("Sell the tickets anyway to avoid conflict.", "Policy violation.", {pro:-8,cus:-2,team:+0,acc:-4}, -8,
              "Follow policy every time.", "Follow policy."),
            warnChoice("Argue with them loudly.", "Keep it calm.", {pro:-4,cus:-4,team:-1,acc:+0}, -1,
              "Stay calm and use policy language.", "Stay calm and use policy."),
            goodChoice("Explain calmly: ‘We need an adult/ID for this rating.’", "Clear communication.", {pro:+6,cus:+5,team:+1,acc:+1}, +10,
              "Good—calm explanation.", "Good: calm explanation.")
          ],
          next:"order"
        },
        {
          id:"order",
          title:"Wrong snack given",
          text:"You gave nachos, but they ordered popcorn. What do you do?",
          choices:[
            goodChoice("Apologize and fix it immediately using the correct process.", "Own it + fix.", {pro:+8,cus:+8,team:+2,acc:+6}, +15,
              "Correct—apologize and fix.", "Great: owns and fixes."),
            warnChoice("Swap it quietly without telling anyone.", "Use proper process.", {pro:-2,cus:+0,team:+0,acc:-2}, +2,
              "Use proper procedure for food handling.", "Use proper procedure."),
            badChoice("Blame them for ordering wrong.", "No.", {pro:-10,cus:-10,team:-2,acc:+0}, -10,
              "Stay respectful and fix it.", "Don’t blame—fix it."),
            goodChoice("Ask a coworker to remake while you keep the line moving.", "Teamwork.", {pro:+5,cus:+4,team:+8,acc:+3}, +12,
              "Nice—teamwork keeps it smooth.", "Good: teamwork keeps line moving.")
          ],
          next:"spill"
        },
        {
          id:"spill",
          title:"Safety: spilled soda",
          text:"A customer spills a large soda near the counter. What’s best?",
          choices:[
            goodChoice("Block the area, get help, and clean it safely to prevent slipping.", "Safety first.", {pro:+6,cus:+4,team:+6,acc:+2}, +13,
              "Yes—prevent slips, then clean.", "Great: prevents slips."),
            warnChoice("Ignore it until the rush ends.", "Danger.", {pro:-4,cus:-2,team:+0,acc:+0}, -2,
              "Spills are urgent—people can slip.", "Spills are urgent."),
            badChoice("Tell the customer to clean it themselves.", "Not customer service.", {pro:-8,cus:-10,team:+0,acc:+0}, -10,
              "Stay respectful and handle it safely.", "Handle it respectfully."),
            goodChoice("Call a coworker while you keep customers informed.", "Teamwork.", {pro:+4,cus:+5,team:+7,acc:+0}, +11,
              "Good teamwork under pressure.", "Good: teamwork under pressure.")
          ],
          next:"rush"
        },
        {
          id:"rush",
          title:"Busy moment",
          text:"The line is long and someone complains about waiting. What do you do?",
          choices:[
            goodChoice("Stay calm: ‘Thanks for waiting—I’ll help you next.’", "Professional.", {pro:+6,cus:+9,team:+1,acc:+0}, +12,
              "Great—calm and polite.", "Good: calm and polite."),
            warnChoice("Ignore them and keep working.", "Acknowledge politely.", {pro:-2,cus:-3,team:+0,acc:+0}, 0,
              "A short polite response helps.", "Acknowledge politely."),
            badChoice("Snap back at them.", "Nope.", {pro:-8,cus:-10,team:-1,acc:+0}, -10,
              "Keep it calm—don’t escalate.", "Don’t escalate."),
            goodChoice("Give a quick estimate and thank them for waiting.", "Helpful.", {pro:+5,cus:+8,team:+0,acc:+0}, +11,
              "Nice—clear and polite.", "Good: clear and polite.")
          ],
          next:"clean"
        },
        {
          id:"clean",
          title:"Cleaning and reset",
          text:"Between movie shows, what’s important?",
          choices:[
            goodChoice("Keep areas clean, wipe counters, and restock items safely.", "Exactly.", {pro:+6,cus:+1,team:+4,acc:+2}, +11,
              "Yes—clean and restock.", "Great: clean + restock."),
            warnChoice("Only restock. Cleaning can wait.", "Cleaning matters.", {pro:-2,cus:-1,team:+0,acc:+0}, +2,
              "Cleaning is part of safety and customer experience.", "Cleaning matters."),
            badChoice("Leave it for the next shift.", "Not teamwork.", {pro:-6,cus:-2,team:-6,acc:+0}, -6,
              "Do your part to reset for the next group.", "Do your part."),
            goodChoice("Ask what needs done and help the team reset fast.", "Team mindset.", {pro:+5,cus:+0,team:+8,acc:+0}, +10,
              "Nice—team reset matters.", "Good: team reset.")
          ],
          next:"availability"
        },
        {
          id:"availability",
          title:"Schedule fit",
          text:"This job is nights, weekends, and holidays sometimes. What’s a good answer?",
          choices:[
            goodChoice("I can work evenings and weekends, and I’ll communicate early if anything changes.", "Reliable.", {pro:+8,cus:+0,team:+3,acc:+0}, +12,
              "Great—clear and reliable.", "Good: clear availability."),
            warnChoice("Maybe. I’ll see.", "Too vague.", {pro:-2,cus:+0,team:+0,acc:+0}, +2,
              "Be clear about what you can do.", "Be clear."),
            badChoice("No weekends. Ever.", "Probably not a fit.", {pro:-6,cus:+0,team:+0,acc:+0}, -4,
              "That may not match theater needs.", "Theater needs weekends."),
            goodChoice("I’m flexible with notice, and I can cover some weekends.", "Reasonable.", {pro:+6,cus:+0,team:+2,acc:+0}, +10,
              "Good—clear and flexible.", "Good: flexible.")
          ],
          next:"task"
        },
        { id:"task", title:"Accuracy check: Make change", text:"Quick money task. Build correct change to continue.", task:true, next:"ask" },
        {
          id:"ask",
          title:"Your question",
          text:"Pick the best question to ask the manager.",
          choices:[
            goodChoice("How will I be trained on ticket rules and concessions procedures?", "Training-focused.", {pro:+7,cus:+1,team:+2,acc:+2}, +11,
              "Great question.", "Strong: asks about training."),
            warnChoice("How soon do I get free popcorn?", "Not now.", {pro:-2,cus:+0,team:+0,acc:+0}, +1,
              "Ask about training and expectations first.", "Ask about expectations."),
            goodChoice("What does a great concessions worker do during rush times?", "Performance-focused.", {pro:+6,cus:+1,team:+2,acc:+2}, +11,
              "Excellent—focused on doing well.", "Great: asks about great performance."),
            badChoice("So… do I have the job?", "Too pushy.", {pro:-6,cus:-2,team:+0,acc:+0}, -2,
              "Ask about next steps instead.", "Ask about next steps.")
          ],
          next:"close"
        },
        {
          id:"close",
          title:"Closing pitch",
          text:"Why should we hire you for tickets/concessions?",
          choices:[
            goodChoice("I’m friendly, I follow rules, and I stay calm when it’s busy.", "Perfect fit.", {pro:+7,cus:+8,team:+2,acc:+4}, +16,
              "Strong closing for a theater.", "Great: calm + friendly + follows rules."),
            warnChoice("I like movies.", "Not enough.", {pro:+0,cus:+0,team:+0,acc:+0}, +3,
              "Add skills: accuracy, cleanliness, customer service.", "Add skills."),
            goodChoice("I can keep orders accurate, clean spills safely, and work as a team.", "Role-specific.", {pro:+8,cus:+4,team:+6,acc:+6}, +18,
              "Excellent—safety, accuracy, teamwork.", "Great: safety + accuracy + teamwork."),
            badChoice("I won’t complain about weekends.", "Odd pitch.", {pro:-2,cus:+0,team:+0,acc:+0}, 0,
              "Say what you do well instead.", "Say strengths.")
          ],
          next:"results"
        },
        { id:"results", title:"Results!", text:"Let’s see how interview-ready you are.", results:true }
      ];
    }



    function makeScriptRetailClothing(){
      return [
        {
          id:"intro",
          title:"Sales associate interview",
          text:"Hi, I’m Ms. Chen. This job is customer service and keeping the store organized. Ready?",
          choices:[
            goodChoice("Yes, thank you for your time today.", "Professional start.", {pro:+8,cus:+2,team:+1,acc:+0}, +10,
              "Great start.", "Good opener."),
            warnChoice("Yeah, sure.", "Could be stronger.", {pro:-2,cus:-1,team:+0,acc:+0}, +2,
              "Try a more confident greeting.", "Confidence helps."),
            goodChoice("Absolutely. I’m friendly and I like staying organized.", "Fits retail.", {pro:+6,cus:+6,team:+1,acc:+2}, +12,
              "Nice—friendly and organized matters.", "Good: friendly + organized."),
            badChoice("I don’t really like people.", "Retail is people.", {pro:-10,cus:-10,team:+0,acc:+0}, -10,
              "Retail is customer service—keep it positive.", "Retail is people.")
          ],
          next:"why"
        },
        {
          id:"why",
          title:"Why retail?",
          text:"Why do you want to work in a clothing store?",
          choices:[
            goodChoice("I like helping customers, and I’m good at keeping things neat and organized.", "Good fit.", {pro:+6,cus:+7,team:+1,acc:+2}, +13,
              "Great—helpful and organized.", "Good: helpful + organized."),
            warnChoice("I just need money.", "Add skills.", {pro:-2,cus:+0,team:+0,acc:+0}, +2,
              "Add what you’ll bring: friendliness, reliability, organization.", "Add strengths."),
            goodChoice("I’m dependable and I want experience working with customers.", "Solid.", {pro:+7,cus:+4,team:+1,acc:+1}, +12,
              "Nice—dependable and customer focused.", "Good: dependable + customer focus."),
            badChoice("Because it seems easy.", "Retail is work.", {pro:-6,cus:-2,team:+0,acc:-1}, -4,
              "Retail requires patience, policy, and organization.", "Avoid calling it easy.")
          ],
          next:"help"
        },
        {
          id:"help",
          title:"Helping a customer",
          text:"A customer says: ‘I need jeans, but I’m not sure what size.’ What do you do?",
          choices:[
            goodChoice("Ask questions, suggest options, and stay respectful.", "Helpful approach.", {pro:+5,cus:+9,team:+1,acc:+1}, +14,
              "Great—questions and respect.", "Great: asks questions and helps."),
            warnChoice("Point to the jeans wall and walk away.", "Not enough help.", {pro:-3,cus:-6,team:+0,acc:+0}, -1,
              "Offer help: ask size range or suggest fitting room.", "Offer real help."),
            badChoice("Say ‘I don’t know’ and ignore them.", "Nope.", {pro:-8,cus:-10,team:+0,acc:+0}, -10,
              "Be helpful or get someone who can help.", "Be helpful."),
            goodChoice("Offer fitting room help and explain how sizes run.", "Practical.", {pro:+6,cus:+8,team:+1,acc:+1}, +13,
              "Excellent—practical and supportive.", "Good: fitting room support.")
          ],
          next:"fitting"
        },
        {
          id:"fitting",
          title:"Fitting room policy",
          text:"Customer wants to take 20 items into the fitting room. Policy is 8 items max. What do you do?",
          choices:[
            goodChoice("Explain politely and help them choose 8, offering to hold the rest.", "Policy + service.", {pro:+7,cus:+7,team:+2,acc:+1}, +13,
              "Perfect—kind and policy-based.", "Great: polite + follows policy."),
            warnChoice("Let them do it so they don’t get mad.", "Policy matters.", {pro:-3,cus:+0,team:+0,acc:-2}, 0,
              "Policies exist for a reason—be polite and follow them.", "Follow policy politely."),
            badChoice("Say ‘No’ in a rude tone.", "Tone matters.", {pro:-6,cus:-8,team:+0,acc:+0}, -6,
              "Be calm and respectful.", "Be calm and respectful."),
            goodChoice("Ask a supervisor for support if they argue.", "Good judgement.", {pro:+6,cus:+3,team:+6,acc:+0}, +10,
              "Good—get support if needed.", "Good: asks for help if conflict.")
          ],
          next:"returns"
        },
        {
          id:"returns",
          title:"Return without receipt",
          text:"Customer wants a return but has no receipt. What do you do?",
          choices:[
            goodChoice("Stay polite and follow store policy. Ask a supervisor if unsure.", "Policy + respect.", {pro:+7,cus:+6,team:+6,acc:+2}, +13,
              "Correct—policy and supervisor support.", "Great: follows policy."),
            badChoice("Refund them anyway to avoid conflict.", "Policy violation.", {pro:-8,cus:+0,team:+0,acc:-4}, -8,
              "Follow policy every time.", "Follow policy."),
            warnChoice("Tell them ‘No’ and walk away.", "Needs customer service.", {pro:-4,cus:-6,team:+0,acc:+0}, -1,
              "Explain politely and offer options (store credit, supervisor).", "Explain options politely."),
            goodChoice("Explain options calmly (store credit, exchange, supervisor check).", "Solution-focused.", {pro:+6,cus:+8,team:+2,acc:+1}, +12,
              "Great—polite and solutions.", "Good: solutions + calm.")
          ],
          next:"discount"
        },
        {
          id:"discount",
          title:"Customer asks for a discount",
          text:"A customer says: ‘Can you give me a discount?’ What’s best?",
          choices:[
            goodChoice("Be polite and follow policy—ask a manager if there’s a promotion.", "Policy + respect.", {pro:+6,cus:+7,team:+5,acc:+1}, +12,
              "Good—polite and policy-based.", "Great: policy + manager."),
            badChoice("Say yes and change the price yourself.", "Nope.", {pro:-8,cus:+0,team:+0,acc:-6}, -8,
              "Follow policy for discounts.", "Follow discount policy."),
            warnChoice("Say ‘No’ in a rude tone.", "Tone matters.", {pro:-3,cus:-5,team:+0,acc:+0}, -1,
              "Polite tone matters—offer to check promotions.", "Use a polite tone."),
            goodChoice("Explain you can’t change prices, but you can check current deals.", "Helpful and firm.", {pro:+7,cus:+6,team:+1,acc:+1}, +11,
              "Nice—helpful while holding policy.", "Good: helpful and firm.")
          ],
          next:"organize"
        },
        {
          id:"organize",
          title:"Slow moment",
          text:"It’s slow—no customers. What should you do?",
          choices:[
            goodChoice("Fold, straighten displays, and restock sizes while staying ready to greet customers.", "Perfect.", {pro:+6,cus:+2,team:+2,acc:+4}, +12,
              "Exactly—stay productive and ready.", "Great: organizes and stays ready."),
            warnChoice("Stand around until someone tells you what to do.", "Be proactive.", {pro:-2,cus:+0,team:+0,acc:+0}, +2,
              "Look for tasks: folding, returns, fitting rooms.", "Be proactive."),
            badChoice("Go on your phone.", "Not during shifts.", {pro:-8,cus:+0,team:+0,acc:+0}, -6,
              "Stay professional—ask what needs done.", "Stay off phone."),
            goodChoice("Check fitting rooms and put items back in correct spots.", "Good detail work.", {pro:+5,cus:+1,team:+1,acc:+5}, +11,
              "Good—returns and fitting rooms matter.", "Good: handles fitting room items.")
          ],
          next:"theft"
        },
        {
          id:"theft",
          title:"Possible shoplifting",
          text:"You think someone might be stealing. What should you do?",
          choices:[
            goodChoice("Stay polite and alert a manager/security quietly.", "Safety + policy.", {pro:+7,cus:+1,team:+8,acc:+0}, +12,
              "Correct—don’t accuse.", "Great: quietly alert manager."),
            badChoice("Confront and accuse them loudly.", "Unsafe.", {pro:-10,cus:-6,team:-3,acc:+0}, -10,
              "Don’t accuse. Follow the process.", "Never accuse—follow process."),
            warnChoice("Do nothing because it’s not your job.", "Still report concerns.", {pro:-3,cus:+0,team:-4,acc:+0}, +1,
              "Report concerns to a manager quietly.", "Quietly report concerns."),
            goodChoice("Ask a manager a ‘policy question’ to get support calmly.", "Smart de-escalation.", {pro:+6,cus:+2,team:+6,acc:+0}, +10,
              "Nice—keeps it calm.", "Good: calm + gets support.")
          ],
          next:"task"
        },
        { id:"task", title:"Accuracy check: Make change", text:"Quick money task. Build correct change to continue.", task:true, next:"ask" },
        {
          id:"ask",
          title:"Your question",
          text:"Pick a strong question to ask at the end.",
          choices:[
            goodChoice("How do you train new associates on returns and fitting room rules?", "Training question.", {pro:+7,cus:+1,team:+2,acc:+2}, +11,
              "Great question—training-focused.", "Strong: asks about training."),
            warnChoice("How soon do I get a raise?", "Not ideal right now.", {pro:-2,cus:+0,team:+0,acc:+0}, +1,
              "Ask about training and expectations first.", "Ask about expectations."),
            goodChoice("What does a great associate do on a busy weekend?", "Performance-focused.", {pro:+6,cus:+1,team:+2,acc:+2}, +11,
              "Excellent—focused on doing well.", "Great: asks about great performance."),
            badChoice("Do I have the job?", "Too pushy.", {pro:-6,cus:-2,team:+0,acc:+0}, -2,
              "Ask about next steps instead.", "Ask about next steps politely.")
          ],
          next:"close"
        },
        {
          id:"close",
          title:"Closing pitch",
          text:"Why should we hire you as a sales associate?",
          choices:[
            goodChoice("I’m friendly, organized, and I follow store policies and procedures.", "Strong retail close.", {pro:+7,cus:+7,team:+2,acc:+3}, +16,
              "Great closing for retail.", "Great: friendly + organized + policy."),
            warnChoice("I like clothes.", "Nice, but add skills.", {pro:+0,cus:+0,team:+0,acc:+0}, +3,
              "Add organization, customer service, and policy.", "Add skills."),
            goodChoice("I’ll keep the store neat and help customers find what they need.", "Job-specific.", {pro:+6,cus:+8,team:+1,acc:+2}, +14,
              "Excellent—customers and organization.", "Good: customers + organization."),
            badChoice("Because I won’t cause drama.", "Odd pitch.", {pro:-2,cus:+0,team:+0,acc:+0}, 0,
              "Say positive strengths instead.", "Say strengths.")
          ],
          next:"results"
        },
        { id:"results", title:"Results!", text:"Let’s see how interview-ready you are.", results:true }
      ];
    }



    function makeScriptLibraryAssistant(){
      return [
        {
          id:"intro",
          title:"Library interview",
          text:"Hi, I’m Mr. Patel. This job is calm, organized, and helpful. Ready to begin?",
          choices:[
            goodChoice("Yes, thank you for meeting with me.", "Respectful start.", {pro:+8,cus:+2,team:+1,acc:+0}, +10,
              "Great start.", "Good opener."),
            warnChoice("Yeah.", "Could be stronger.", {pro:-2,cus:-1,team:+0,acc:+0}, +2,
              "Try a more professional greeting.", "Be more professional."),
            goodChoice("Absolutely. I explain things calmly and I like organizing.", "Role fit.", {pro:+7,cus:+4,team:+1,acc:+4}, +12,
              "Nice—calm and organized fits.", "Good: calm + organized."),
            badChoice("I don’t like rules.", "Library is rules.", {pro:-8,cus:-4,team:+0,acc:+0}, -6,
              "Libraries require rules and respect.", "Rules matter here.")
          ],
          next:"about"
        },
        {
          id:"about",
          title:"Tell me about you",
          text:"Tell me about yourself in 1–2 sentences.",
          choices:[
            goodChoice("I’m dependable, calm, and I like helping people find what they need.", "Strong and clear.", {pro:+7,cus:+7,team:+1,acc:+1}, +13,
              "Great—dependable and helpful.", "Good: dependable + helpful."),
            warnChoice("I don’t know.", "You can prepare a simple line.", {pro:-3,cus:-1,team:+0,acc:+0}, 0,
              "Try: calm + organized + helpful.", "Practice a simple intro."),
            goodChoice("I’m organized and careful, and I follow directions and rules.", "Good for library work.", {pro:+8,cus:+1,team:+1,acc:+4}, +12,
              "Nice—organized and rule-following.", "Good: organized + follows rules."),
            badChoice("I’m just here because someone made me.", "Not a pitch.", {pro:-6,cus:-2,team:+0,acc:+0}, -3,
              "Focus on your strengths.", "Focus on strengths.")
          ],
          next:"privacy"
        },
        {
          id:"privacy",
          title:"Privacy",
          text:"A patron asks what books someone else checked out. What do you do?",
          choices:[
            goodChoice("Protect privacy and explain you can’t share other patrons’ info.", "Correct.", {pro:+8,cus:+3,team:+2,acc:+2}, +12,
              "Correct—privacy rules matter.", "Great: protects privacy."),
            badChoice("Tell them if you know the person.", "Still not allowed.", {pro:-8,cus:+0,team:+0,acc:-2}, -8,
              "Privacy rules apply to everyone.", "Privacy rules apply to everyone."),
            warnChoice("Ignore them and walk away.", "Explain politely.", {pro:-3,cus:-4,team:+0,acc:+0}, -1,
              "Explain politely and offer to help them find a book instead.", "Explain politely."),
            goodChoice("Offer to help them place a hold or find similar books instead.", "Redirects helpfully.", {pro:+6,cus:+7,team:+1,acc:+1}, +11,
              "Nice redirect—helpful and private.", "Good: redirects helpfully.")
          ],
          next:"quiet"
        },
        {
          id:"quiet",
          title:"Quiet reminder",
          text:"A group is talking loudly. What do you do?",
          choices:[
            goodChoice("Approach calmly and ask them to lower their voices.", "Calm and respectful.", {pro:+6,cus:+6,team:+1,acc:+0}, +12,
              "Great—calm and respectful.", "Good: calm reminder."),
            warnChoice("Stare at them until they stop.", "Too passive.", {pro:-1,cus:-1,team:+0,acc:+0}, +2,
              "Use a calm, polite reminder.", "Use a calm reminder."),
            badChoice("Yell: ‘Be quiet!’", "Not the vibe.", {pro:-8,cus:-8,team:+0,acc:+0}, -8,
              "Stay calm and respectful.", "No yelling—stay calm."),
            goodChoice("If it continues, ask a supervisor for support.", "Uses policy.", {pro:+6,cus:+2,team:+6,acc:+0}, +10,
              "Good—policy support if needed.", "Good: asks supervisor if needed.")
          ],
          next:"computer"
        },
        {
          id:"computer",
          title:"Computer help",
          text:"A patron can’t print a document. You’re not sure how the printer works. What do you do?",
          choices:[
            goodChoice("Ask a librarian or check the help steps before guessing.", "Accuracy + honesty.", {pro:+7,cus:+4,team:+6,acc:+3}, +12,
              "Perfect—ask for help rather than guessing.", "Good: asks for help."),
            warnChoice("Try random buttons until it works.", "Could break it.", {pro:-3,cus:-1,team:+0,acc:-4}, 0,
              "Better to ask or follow steps.", "Follow steps or ask."),
            badChoice("Tell them you can’t help and walk away.", "Not helpful.", {pro:-6,cus:-8,team:+0,acc:+0}, -6,
              "Offer to find someone who can help.", "Find help for them."),
            goodChoice("Say ‘Let me check the steps’ and keep them updated.", "Good communication.", {pro:+6,cus:+7,team:+2,acc:+2}, +11,
              "Great—helpful and clear.", "Good: communicates and checks steps.")
          ],
          next:"fines"
        },
        {
          id:"fines",
          title:"Upset patron",
          text:"A patron is upset about a late fee. What’s best?",
          choices:[
            goodChoice("Stay calm, listen, and explain the policy or get a librarian if needed.", "De-escalation.", {pro:+7,cus:+8,team:+4,acc:+0}, +13,
              "Yes—calm and policy-based.", "Great: calm + policy + support."),
            warnChoice("Tell them ‘That’s the rule’ and stop talking.", "Tone matters.", {pro:-3,cus:-4,team:+0,acc:+0}, -1,
              "Explain respectfully and offer next steps.", "Explain respectfully."),
            badChoice("Argue with them.", "Nope.", {pro:-8,cus:-10,team:-2,acc:+0}, -10,
              "Stay calm and bring in support.", "Don’t argue."),
            goodChoice("Offer to connect them with someone who can review the account.", "Helpful redirect.", {pro:+6,cus:+7,team:+4,acc:+0}, +12,
              "Good—helpful and calm.", "Good: redirects to support.")
          ],
          next:"shelving"
        },
        {
          id:"shelving",
          title:"Organization",
          text:"When shelving books, what matters most?",
          choices:[
            goodChoice("Put items in the correct section and order, even if it takes a bit longer.", "Accuracy first.", {pro:+6,cus:+1,team:+1,acc:+8}, +13,
              "Correct—accuracy helps everyone find books.", "Great: correct order."),
            warnChoice("Speed only.", "Wrong shelves create bigger problems.", {pro:-2,cus:+0,team:+0,acc:-6}, +1,
              "Wrong shelving makes books ‘disappear.’", "Accuracy prevents missing books."),
            badChoice("Put it anywhere—close enough.", "Not a library.", {pro:-6,cus:-2,team:+0,acc:-8}, -6,
              "Libraries need correct placement.", "Correct placement matters."),
            goodChoice("Ask for help if I’m unsure where it goes.", "Good judgement.", {pro:+6,cus:+0,team:+6,acc:+3}, +11,
              "Yes—ask instead of guessing.", "Good: asks instead of guessing.")
          ],
          next:"safety"
        },
        {
          id:"safety",
          title:"Safety with carts",
          text:"You’re moving a heavy book cart. What should you do?",
          choices:[
            goodChoice("Push slowly, watch corners, and ask for help if it’s too heavy.", "Safe.", {pro:+6,cus:+0,team:+4,acc:+2}, +10,
              "Correct—safe movement matters.", "Great: safe cart handling."),
            warnChoice("Move fast so you’re done quickly.", "Risky.", {pro:-2,cus:+0,team:+0,acc:-1}, +1,
              "Safety over speed.", "Safety over speed."),
            badChoice("Pull it backward without looking.", "Danger.", {pro:-6,cus:+0,team:+0,acc:-2}, -6,
              "Watch your path and corners.", "Watch your path."),
            goodChoice("Ask where to take it if you’re unsure.", "Communicates.", {pro:+5,cus:+0,team:+6,acc:+0}, +9,
              "Good—communicate.", "Good: communicates.")
          ],
          next:"task"
        },
        { id:"task", title:"Accuracy check: Sort returns", text:"Quick organizing task. Sort the items into the correct bins.", task:true, next:"ask" },
        {
          id:"ask",
          title:"Your question",
          text:"Pick a strong question to ask at the end.",
          choices:[
            goodChoice("How do you train new assistants on shelving and privacy rules?", "Training-focused.", {pro:+7,cus:+1,team:+2,acc:+2}, +11,
              "Great question.", "Strong: training question."),
            warnChoice("How soon do I get promoted?", "Not ideal now.", {pro:-2,cus:+0,team:+0,acc:+0}, +1,
              "Ask about training and expectations first.", "Ask about expectations."),
            goodChoice("What does a great library assistant do every day?", "Performance-focused.", {pro:+6,cus:+1,team:+2,acc:+2}, +11,
              "Excellent—focused on doing well.", "Great: asks about great performance."),
            badChoice("Do I have the job?", "Too pushy.", {pro:-6,cus:-2,team:+0,acc:+0}, -2,
              "Ask about next steps instead.", "Ask about next steps politely.")
          ],
          next:"close"
        },
        {
          id:"close",
          title:"Closing pitch",
          text:"Why should we hire you as a library assistant?",
          choices:[
            goodChoice("I’m calm, respectful, and organized. I follow rules and help people politely.", "Perfect library close.", {pro:+8,cus:+7,team:+2,acc:+4}, +16,
              "Great closing for a library.", "Great: calm + organized + polite."),
            warnChoice("Because I like books.", "Nice, but add skills.", {pro:+0,cus:+0,team:+0,acc:+0}, +3,
              "Add organization, calm customer service, and privacy.", "Add skills."),
            goodChoice("I can sort and shelve accurately, and I ask for help when I’m unsure.", "Job-specific.", {pro:+7,cus:+2,team:+6,acc:+5}, +14,
              "Excellent—organization and good judgement.", "Good: organized + asks for help."),
            badChoice("I won’t talk much.", "Not the point.", {pro:-2,cus:-2,team:+0,acc:+0}, 0,
              "You can be quiet AND helpful and respectful.", "Be helpful, not silent.")
          ],
          next:"results"
        },
        { id:"results", title:"Results!", text:"Let’s see how interview-ready you are.", results:true }
      ];
    }


    const SCENARIOS = [
      {
        key: "grocery_cashier",
        name: "Grocery Store — Cashier",
        interviewer: "Ms. Rivera",
        org: "FreshMart Grocery",
        jobTitle: "Cashier",
        meta: "Shift: afternoons • Uniform: apron • Skills: friendly + accurate",
        jobBullets: [
          "Greet customers and scan items carefully.",
          "Bag items safely (heavy items on bottom).",
          "Handle coupons and price checks politely.",
          "Ask for help if you’re unsure (manager or coworker)."
        ],
        taskType: "money",
        moneyScenario: { due: 13.47, paid: 20.00 },
        script: makeScriptGroceryCashier()
      },
      {
        key: "school_cafe",
        name: "School Cafeteria — Cashier",
        interviewer: "Mr. Jenkins",
        org: "Lincoln County Cafeteria",
        jobTitle: "Cafeteria Cashier",
        meta: "Shift: lunch periods • Uniform: hair net + apron • Skills: fast + accurate + kind",
        jobBullets: [
          "Count money and give correct change.",
          "Keep the line moving while being polite.",
          "Follow cafeteria rules (food safety, clean station).",
          "Handle student accounts privately and respectfully."
        ],
        taskType: "money",
        moneyScenario: { due: 15.91, paid: 20.00 },
        script: makeScriptCafeteriaCashier()
      },
      {
        key: "coffee_barista",
        name: "Coffee Shop — Barista",
        interviewer: "Ava",
        org: "Bean & Bloom Café",
        jobTitle: "Barista",
        meta: "Shift: mornings • Uniform: tee + apron • Skills: friendly + multitasking",
        jobBullets: [
          "Repeat orders back to confirm accuracy.",
          "Follow recipes and label modifications.",
          "Communicate wait times politely during rushes.",
          "Keep equipment and counters clean and safe."
        ],
        taskType: "money",
        moneyScenario: { due: 8.65, paid: 10.00 },
        script: makeScriptBarista()
      },
      {
        key: "movie_concessions",
        name: "Movie Theater — Tickets/Concessions",
        interviewer: "Jordan",
        org: "StarLite Cinema",
        jobTitle: "Concessions Associate",
        meta: "Shift: evenings/weekends • Uniform: polo • Skills: friendly + quick + clean",
        jobBullets: [
          "Handle payments accurately at tickets or snacks.",
          "Follow safety rules (hot items, spills).",
          "Keep the snack counter clean and stocked.",
          "Use calm customer service when busy."
        ],
        taskType: "money",
        moneyScenario: { due: 12.25, paid: 20.00 },
        script: makeScriptMovieConcessions()
      },
      {
        key: "retail_clothing",
        name: "Clothing Store — Sales Associate",
        interviewer: "Ms. Chen",
        org: "StyleStreet Apparel",
        jobTitle: "Sales Associate",
        meta: "Shift: afternoons/weekends • Uniform: neat clothes • Skills: friendly + helpful + organized",
        jobBullets: [
          "Help customers find sizes and items.",
          "Fold/organize displays and returns.",
          "Handle checkout and returns politely.",
          "Follow store policy and ask for help when unsure."
        ],
        taskType: "money",
        moneyScenario: { due: 27.18, paid: 30.00 },
        script: makeScriptRetailClothing()
      },
      {
        key: "library_assistant",
        name: "Library — Assistant",
        interviewer: "Mr. Patel",
        org: "Oakwood Public Library",
        jobTitle: "Library Assistant",
        meta: "Shift: afternoons • Uniform: neat/quiet • Skills: helpful + organized + calm",
        jobBullets: [
          "Help patrons find books and use services.",
          "Protect patron privacy.",
          "Sort returns into correct areas.",
          "Keep a calm, respectful tone."
        ],
        taskType: "sort",
        sortScenario: {
          bins: ["Fiction", "Nonfiction", "Media"],
          items: [
            { text: "Harry Potter (book)", bin: "Fiction" },
            { text: "World Atlas (book)", bin: "Nonfiction" },
            { text: "DVD: Moana", bin: "Media" },
            { text: "Captain Underpants (book)", bin: "Fiction" }
          ]
        },
        script: makeScriptLibraryAssistant()
      }
    ];
/*****************************************************************
      STATE
    ******************************************************************/
    const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
    const $ = (id)=>document.getElementById(id);

    const DENOMS = [
      { label:"$10", value:10.00 },
      { label:"$5", value:5.00 },
      { label:"$1", value:1.00 },
      { label:"25¢", value:0.25 },
      { label:"10¢", value:0.10 },
      { label:"5¢", value:0.05 },
      { label:"1¢", value:0.01 }
    ];

    let scenario = SCENARIOS[0];

    let totalLevels = 6;
    function updateTotalLevels(){
      try{
        totalLevels = (scenario && Array.isArray(scenario.script))
          ? (scenario.script.filter(n => !n.results).length || 6)
          : 6;
      }catch(e){ totalLevels = 6; }
      const el = document.getElementById("levelTotal");
      if(el) el.textContent = totalLevels;
    }


    let state = {
      level: 1,
      score: 0,
      streak: 0,
      best: 0,
      meters: { pro:50, cus:50, team:50, acc:50 },
      log: [],
      locked: false,
      currentNode: null,
      money: { due:0, paid:0, given:0, stack:[] },
      sort: { selectedItem: null, placed: {}, items: [], bins: [] }
    };

    function bestKey(){ return "miq_best_" + scenario.key; }
    function loadBest(){
      const v = Number(localStorage.getItem(bestKey()) || 0);
      state.best = isFinite(v) ? v : 0;
      $("bestLabel").textContent = state.best;
    }
    function saveBest(){
      if(state.score > state.best){
        state.best = state.score;
        localStorage.setItem(bestKey(), String(state.best));
        $("bestLabel").textContent = state.best;
      }
    }

    /*****************************************************************
      RENDER HELPERS
    ******************************************************************/
    function moneyToStr(x){ return "$" + (Math.round(x*100)/100).toFixed(2); }
    function round2(n){ return Math.round(n*100)/100; }

    function addLog(msg){
      state.log.unshift(msg);
      state.log = state.log.slice(0, 10);
      renderLog();
    }

    function renderLog(){
      const ul = $("logList");
      ul.innerHTML = "";
      if(state.log.length === 0){
        const li = document.createElement("li");
        li.textContent = "Pick answers to build coach notes.";
        ul.appendChild(li);
        return;
      }
      state.log.forEach(item=>{
        const li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      });
    }

    function renderMeters(){
      const m = state.meters;
      $("mPro").textContent = m.pro;
      $("mCus").textContent = m.cus;
      $("mTeam").textContent = m.team;
      $("mAcc").textContent = m.acc;

      $("bPro").style.width = m.pro + "%";
      $("bCus").style.width = m.cus + "%";
      $("bTeam").style.width = m.team + "%";
      $("bAcc").style.width = m.acc + "%";
    }

    function applyDelta(delta){
      const m = state.meters;
      m.pro  = clamp(m.pro  + (delta.pro  || 0), 0, 100);
      m.cus  = clamp(m.cus  + (delta.cus  || 0), 0, 100);
      m.team = clamp(m.team + (delta.team || 0), 0, 100);
      m.acc  = clamp(m.acc  + (delta.acc  || 0), 0, 100);
      renderMeters();
    }

    function setFeedback(tone, text){
      const fb = $("feedback");
      fb.style.display = "flex";
      fb.classList.remove("warn","bad");
      const icon = $("fbIcon");
      if(tone === "good"){ icon.textContent = "✓"; }
      if(tone === "warn"){ icon.textContent = "!"; fb.classList.add("warn"); }
      if(tone === "bad"){ icon.textContent = "×"; fb.classList.add("bad"); }
      $("fbText").innerHTML = text;
    }

    function hideFeedback(){
      const fb = $("feedback");
      fb.style.display = "none";
      fb.classList.remove("warn","bad");
      $("fbText").textContent = "";
    }

    function setNextVisible(v){ $("nextBtn").style.display = v ? "inline-flex" : "none"; }

    function renderJobTicket(){
      $("jobTitle").textContent = scenario.jobTitle;
      $("jobOrg").textContent = scenario.org;
      $("jobMeta").textContent = scenario.meta;

      const ul = $("jobList");
      ul.innerHTML = "";
      scenario.jobBullets.forEach(b=>{
        const li = document.createElement("li");
        li.textContent = b;
        ul.appendChild(li);
      });
    }

    function renderHeader(){
      $("levelLabel").textContent = state.level;
      $("scoreLabel").textContent = state.score;
      $("streakLabel").textContent = state.streak;
    }

    /*****************************************************************
      NODES / FLOW
    ******************************************************************/
    function scriptById(){ return Object.fromEntries(scenario.script.map(n => [n.id, n])); }

    function renderNode(node){
      state.currentNode = node;
      state.locked = false;

      renderHeader();
      hideFeedback();
      setNextVisible(false);

      $("promptTitle").textContent = node.title;
      $("promptText").textContent = node.text;

      $("taskArea").style.display = node.task ? "grid" : "none";
      $("taskMoney").style.display = "none";
      $("taskSort").style.display = "none";
      $("moneyFeedback").style.display = "none";
      $("sortFeedback").style.display = "none";

      const choicesWrap = $("choices");
      choicesWrap.innerHTML = "";

      if(node.results){
        renderResults();
        return;
      }

      if(node.task){
        startTaskForScenario();
        state.locked = true; // lock next until task complete
        setNextVisible(false);
        return;
      }

      node.choices.forEach((c, idx)=>{
        const btn = document.createElement("button");
        btn.className = "choiceBtn";
        btn.type = "button";

        const label = c.label;
        const sub = c.sub || "";

        btn.innerHTML = `
          <div class="badge">${idx+1}</div>
          <div class="choiceText">
            <b>${escapeHtml(label)}</b>
            <span>${escapeHtml(sub)}</span>
          </div>
          <div class="choiceTools">
            <button class="iconBtn" type="button" title="Read this option" aria-label="Read option ${idx+1}">🔊</button>
          </div>
        `;

        const iconBtn = btn.querySelector(".iconBtn");
        iconBtn.addEventListener("click", (e)=>{
          e.stopPropagation();
          const say = (HINTS.enabled && sub) ? `${label}. ${sub}` : `${label}`;
          speak(say);
        });

        btn.addEventListener("click", ()=> choose(c));
        choicesWrap.appendChild(btn);
      });
    }

    function choose(choice){
      if(state.locked) return;
      state.locked = true;

      applyDelta(choice.delta || {});
      state.score = clamp(state.score + (choice.score || 0), -999, 9999);
      $("scoreLabel").textContent = state.score;

      if(choice.fbTone === "good"){ state.streak += 1; }
      else { state.streak = 0; }
      $("streakLabel").textContent = state.streak;

      if(choice.log) addLog(choice.log);

      const titleWord = choice.fbTone === "good" ? "Nice." : choice.fbTone === "warn" ? "Careful." : "Try again.";
      setFeedback(choice.fbTone, `<b>${titleWord}</b> ${escapeHtml(choice.fb)}`);

      setNextVisible(true);
      saveBest();
    }

    function goNext(){
      if(!state.currentNode) return;
      if(state.currentNode.task && state.locked) return;

      const byId = scriptById();
      const nextNode = byId[state.currentNode.next] || byId["results"];

      const max = totalLevels || 6;
      if(nextNode && nextNode.results){
        state.level = max;
      }else{
        state.level = clamp(state.level + 1, 1, max);
      }
      renderNode(nextNode);
    }

    function renderResults(){
      const m = state.meters;
      const avg = Math.round((m.pro + m.cus + m.team + m.acc) / 4);

      const offerThreshold = 70; // adjust if you want easier/harder offers
      const isOffer = avg >= offerThreshold;

      const verdict =
        avg >= 85 ? "🔥 Hire-ready. You’re calm, polite, and accurate."
      : avg >= 70 ? "✅ Strong. You’re ready for real interviews."
      : avg >= 55 ? "🛠️ Close. Pick calmer + more professional answers."
      : "📚 Train mode. Practice respectful, calm, and accurate answers.";

      const strengths = [];
      const improve = [];
      const pick = (val, label) => (val >= 70 ? strengths : improve).push(`${label} (${val})`);
      pick(m.pro, "Professionalism");
      pick(m.cus, "Customer Service");
      pick(m.team, "Teamwork");
      pick(m.acc, "Accuracy");

      const offerText = isOffer
        ? `Congratulations! We’d like to offer you the position of <b>${escapeHtml(scenario.jobTitle)}</b> at <b>${escapeHtml(scenario.org)}</b>.`
        : `Not an offer yet — but you’re building skills. Try again and aim for an average meter of <b>${offerThreshold}+</b>.`;

      const offerBadge = isOffer ? "🎉" : "🧠";

      $("choices").innerHTML = `
        <div class="choiceBtn" style="grid-column: 1 / -1; cursor:default; min-height: 140px;">
          <div class="badge">${offerBadge}</div>
          <div class="choiceText">
            <b>Results for: ${escapeHtml(scenario.name)}</b>
            <span>
              <b>${escapeHtml(verdict)}</b><br><br>
              <b>Average Meter:</b> ${avg}/100<br>
              <b>Strengths:</b> ${escapeHtml(strengths.length ? strengths.join(", ") : "Keep practicing.")}<br>
              <b>Needs Practice:</b> ${escapeHtml(improve.length ? improve.join(", ") : "No big weaknesses detected.")}<br><br>
              ${offerText}
            </span>
          </div>
          <div class="choiceTools">
            <button class="iconBtn" id="readResultsBtn" type="button" title="Read results">🔊</button>
          </div>
        </div>
        ${
          isOffer
            ? `<div class="choiceBtn" style="grid-column: 1 / -1; cursor:default;">
                 <div class="badge">📄</div>
                 <div class="choiceText">
                   <b>Job Offer Letter</b>
                   <span>
                     Dear Candidate,<br>
                     We enjoyed meeting with you today. Based on your interview, we are pleased to offer you the role of <b>${escapeHtml(scenario.jobTitle)}</b>.<br>
                     Start date: next available shift • Training provided • We believe you’ll do great.<br><br>
                     Sincerely,<br>
                     Hiring Team — ${escapeHtml(scenario.org)}
                   </span>
                 </div>
                 <div class="choiceTools">
                   <button class="iconBtn" id="readOfferBtn" type="button" title="Read offer letter">🔊</button>
                 </div>
               </div>`
            : ""
        }
      `;

      $("readResultsBtn").addEventListener("click", ()=>{
        speak(`Results for ${scenario.name}. ${verdict}. Average meter ${avg} out of 100. ${isOffer ? "Congratulations. You have a job offer." : "No job offer yet. Try again."}`);
      });

      const offerBtn = document.getElementById("readOfferBtn");
      if(offerBtn){
        offerBtn.addEventListener("click", ()=>{
          speak(`Job offer letter. Dear Candidate. We enjoyed meeting with you today. We are pleased to offer you the role of ${scenario.jobTitle}. Training provided. Sincerely, Hiring Team, ${scenario.org}.`);
        });
      }

      setFeedback(isOffer ? "good" : "warn", isOffer
        ? "<b>Offer earned.</b> You did it. Try another scenario, or replay to beat your best score."
        : "<b>Almost.</b> Replay and aim for calmer, more professional choices to earn the offer.");

      setNextVisible(false);
      saveBest();
    }

    /*****************************************************************
      TASKS
    ******************************************************************/
    function startTaskForScenario(){
      $("taskArea").style.display = "grid";
      $("taskMoney").style.display = "none";
      $("taskSort").style.display = "none";

      if(scenario.taskType === "money") startMoneyTask();
      else startSortTask();
    }

    function startMoneyTask(){
      $("taskTitle").textContent = "Quick Task: Make Change";
      const due = scenario.moneyScenario?.due ?? 13.47;
      const paid = scenario.moneyScenario?.paid ?? 20.00;
      state.money = { due, paid, given: 0.00, stack: [] };

      $("taskDesc").textContent =
        `Total is ${moneyToStr(due)}. Customer gives ${moneyToStr(paid)}. Build the correct change, then press Check.`;

      $("taskMoney").style.display = "block";
      $("taskSort").style.display = "none";
      $("moneyFeedback").style.display = "none";

      const need = round2(paid - due);
      $("dueLabel").textContent = " " + moneyToStr(due);
      $("paidLabel").textContent = " " + moneyToStr(paid);
      $("needLabel").textContent = " " + moneyToStr(need);
      $("giveLabel").textContent = " " + moneyToStr(state.money.given);

      const row = $("moneyButtons");
      row.innerHTML = "";
      DENOMS.forEach(d=>{
        const b = document.createElement("button");
        b.className = "moneyBtn";
        b.type = "button";
        b.textContent = d.label;
        b.addEventListener("click", ()=> addDenom(d.value));
        row.appendChild(b);
      });

      $("undoMoneyBtn").onclick = undoDenom;
      $("clearMoneyBtn").onclick = clearMoney;
      $("checkMoneyBtn").onclick = checkMoney;
    }

    function addDenom(v){
      state.money.stack.push(v);
      state.money.given = round2(state.money.given + v);
      $("giveLabel").textContent = " " + moneyToStr(state.money.given);
      $("moneyFeedback").style.display = "none";
    }
    function undoDenom(){
      const v = state.money.stack.pop();
      if(v == null) return;
      state.money.given = round2(state.money.given - v);
      $("giveLabel").textContent = " " + moneyToStr(state.money.given);
      $("moneyFeedback").style.display = "none";
    }
    function clearMoney(){
      state.money.stack = [];
      state.money.given = 0.00;
      $("giveLabel").textContent = " " + moneyToStr(state.money.given);
      $("moneyFeedback").style.display = "none";
    }

    function taskFeedback(which, tone, msg){
      const box = $(which);
      box.style.display = "flex";
      box.classList.remove("warn","bad");
      const icon = box.querySelector(".icon");
      if(tone === "good") icon.textContent = "✓";
      if(tone === "warn"){ icon.textContent = "!"; box.classList.add("warn"); }
      if(tone === "bad"){ icon.textContent = "×"; box.classList.add("bad"); }
      box.querySelector("p").innerHTML = msg;
    }

    function checkMoney(){
      const need = round2(state.money.paid - state.money.due);
      const given = round2(state.money.given);

      if(given === need){
        state.meters.acc = clamp(state.meters.acc + 12, 0, 100);
        state.meters.pro = clamp(state.meters.pro + 4, 0, 100);
        renderMeters();

        state.score = clamp(state.score + 16, -999, 9999);
        $("scoreLabel").textContent = state.score;

        addLog("Accuracy win: gave correct change.");
        taskFeedback("moneyFeedback", "good", `<b>Correct!</b> You gave ${moneyToStr(given)}. Nice job staying accurate.`);
        state.locked = false;
        setNextVisible(true);
        saveBest();
      } else if(given < need){
        const diff = round2(need - given);
        state.meters.acc = clamp(state.meters.acc - 2, 0, 100);
        renderMeters();
        taskFeedback("moneyFeedback", "warn", `<b>Not enough.</b> You’re short by ${moneyToStr(diff)}. Add more.`);
      } else {
        const diff = round2(given - need);
        state.meters.acc = clamp(state.meters.acc - 3, 0, 100);
        renderMeters();
        taskFeedback("moneyFeedback", "warn", `<b>Too much.</b> You gave ${moneyToStr(diff)} extra. Undo or Clear and try again.`);
      }
    }

    function startSortTask(){
      $("taskTitle").textContent = "Quick Task: Sort Returns";
      const s = scenario.sortScenario;
      state.sort = { selectedItem: null, placed: {}, items: s.items.map(x=>({...x})), bins: s.bins.slice() };

      $("taskDesc").textContent =
        "Click an item, then click the correct bin. When all items are placed, press Check.";

      $("taskSort").style.display = "block";
      $("taskMoney").style.display = "none";
      $("sortFeedback").style.display = "none";

      renderSortUI();
      $("resetSortBtn").onclick = resetSort;
      $("checkSortBtn").onclick = checkSort;
    }

    function renderSortUI(){
      const itemsDiv = $("sortItems");
      const binsDiv = $("sortBins");
      itemsDiv.innerHTML = "";
      binsDiv.innerHTML = "";

      state.sort.items.forEach((it, idx)=>{
        const b = document.createElement("button");
        b.className = "itemBtn";
        b.type = "button";
        b.textContent = state.sort.placed[idx] ? `✅ ${it.text}` : it.text;
        if(state.sort.selectedItem === idx) b.classList.add("selected");
        b.addEventListener("click", ()=>{
          state.sort.selectedItem = idx;
          renderSortUI();
          speak(it.text);
        });
        itemsDiv.appendChild(b);
      });

      state.sort.bins.forEach(bin=>{
        const b = document.createElement("button");
        b.className = "binBtn";
        b.type = "button";
        b.textContent = bin;
        b.addEventListener("click", ()=> placeSelectedInto(bin));
        binsDiv.appendChild(b);
      });
    }

    function placeSelectedInto(bin){
      const idx = state.sort.selectedItem;
      if(idx == null) return;
      state.sort.placed[idx] = bin;
      state.sort.selectedItem = null;
      renderSortUI();
      $("sortFeedback").style.display = "none";
      speak(`Placed into ${bin}`);
    }

    function resetSort(){
      state.sort.placed = {};
      state.sort.selectedItem = null;
      renderSortUI();
      $("sortFeedback").style.display = "none";
    }

    function checkSort(){
      const total = state.sort.items.length;
      const placedCount = Object.keys(state.sort.placed).length;
      if(placedCount < total){
        taskFeedback("sortFeedback", "warn", `<b>Almost.</b> Place all items into a bin first.`);
        return;
      }

      let correct = 0;
      state.sort.items.forEach((it, idx)=>{ if(state.sort.placed[idx] === it.bin) correct++; });

      if(correct === total){
        state.meters.acc = clamp(state.meters.acc + 10, 0, 100);
        state.meters.team = clamp(state.meters.team + 4, 0, 100);
        renderMeters();

        state.score = clamp(state.score + 16, -999, 9999);
        $("scoreLabel").textContent = state.score;

        addLog("Accuracy win: sorted returns correctly.");
        taskFeedback("sortFeedback", "good", `<b>Correct!</b> All items sorted correctly. Nice organization.`);
        state.locked = false;
        setNextVisible(true);
        saveBest();
      } else {
        state.meters.acc = clamp(state.meters.acc - 2, 0, 100);
        renderMeters();
        taskFeedback("sortFeedback", "warn", `<b>Not quite.</b> You got ${correct} out of ${total}. Reset and try again.`);
      }
    }

    /*****************************************************************
      READ BUTTONS
    ******************************************************************/
    function readPrompt(){
      const node = state.currentNode || { title: $("promptTitle").textContent, text: $("promptText").textContent };
      speak(`${node.title}. ${node.text}`);
    }
    function readChoices(){
      if(!state.currentNode || !state.currentNode.choices) return;
      const lines = state.currentNode.choices.map((c,i)=> {
        const hint = (HINTS.enabled && c.sub) ? ` ${c.sub}` : ``;
        return `Option ${i+1}. ${c.label}.${hint}`;
      });
      speak(lines.join(" "));
    }
    function readScreen(){ readPrompt(); setTimeout(()=> readChoices(), 650); }
    function readJob(){
      const lines = [
        `Job ticket. ${scenario.jobTitle} at ${scenario.org}. ${scenario.meta}.`,
        "Key duties:",
        ...scenario.jobBullets
      ];
      speak(lines.join(" "));
    }
    function readMeters(){
      const m = state.meters;
      speak(`Skill meters. Professionalism ${m.pro}. Customer Service ${m.cus}. Teamwork ${m.team}. Accuracy ${m.acc}.`);
    }
    function readCoach(){
      const text = state.log.length ? state.log.join(". ") : "No coach notes yet.";
      speak(`Coach notes. ${text}`);
    }
    function readFeedback(){
      const fb = $("fbText").textContent || $("fbText").innerText || "";
      speak(fb.trim() ? fb : "No feedback yet.");
    }
    function readTask(){
      speak(`${$("taskTitle").textContent}. ${$("taskDesc").textContent}`);
    }

    /*****************************************************************
      SCENARIO SWITCH + RESET
    ******************************************************************/
    function setScenario(key){
      const next = SCENARIOS.find(s=>s.key===key) || SCENARIOS[0];
      scenario = next;
      renderJobTicket();
      loadBest();
      resetGame();
    }

    function resetGame(){
      stopSpeak();
      updateTotalLevels();
      state.level = 1;
      state.score = 0;
      state.streak = 0;
      state.meters = { pro:50, cus:50, team:50, acc:50 };
      state.log = [];
      state.locked = false;

      renderHeader();
      renderMeters();
      renderLog();
      hideFeedback();
      setNextVisible(false);

      const byId = scriptById();
      renderNode(byId["intro"]);
    }

    /*****************************************************************
      INIT
    ******************************************************************/
    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, (c)=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
      }[c]));
    }

    const sel = $("scenarioSelect");
    SCENARIOS.forEach(s=>{
      const opt = document.createElement("option");
      opt.value = s.key;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", ()=> setScenario(sel.value));

    $("nextBtn").addEventListener("click", goNext);
    $("newInterviewBtn").addEventListener("click", ()=> resetGame());
    $("clearBtn").addEventListener("click", ()=>{
      localStorage.removeItem(bestKey());
      resetGame();
      loadBest();
    });

    $("toggleVoiceBtn").addEventListener("click", ()=>{
      TTS.enabled = !TTS.enabled;
      $("toggleVoiceBtn").textContent = TTS.enabled ? "🔊 Voice: ON" : "🔇 Voice: OFF";
      $("toggleVoiceBtn").setAttribute("aria-pressed", TTS.enabled ? "true" : "false");
      if(!TTS.enabled) stopSpeak();
    });


    // Text size toggle (helps readability)
    function applyTextSize(mode){
      const root = document.documentElement;
      const isBig = (mode === "big");
      root.classList.toggle("bigText", isBig);
      try{ localStorage.setItem("miq_textSize", isBig ? "big" : "normal"); }catch(e){}
      $("textSizeBtn").textContent = isBig ? "🔎 Text: BIG" : "🔎 Text: Normal";
    }

    function applyHints(mode){
      const on = (mode !== "off");
      HINTS.enabled = on;
      document.body.classList.toggle("hintsOff", !on);
      try{ localStorage.setItem("miq_hints", on ? "on" : "off"); }catch(e){}
      $("hintsBtn").textContent = on ? "💡 Hints: ON" : "💡 Hints: OFF";
    }

    // Load saved text size preference
    try{
      const saved = localStorage.getItem("miq_textSize") || "normal";
      applyTextSize(saved === "big" ? "big" : "normal");
    }catch(e){
      applyTextSize("normal");
    }

    // Load saved hints preference
    try{
      const savedHints = localStorage.getItem("miq_hints") || "off";
      applyHints(savedHints === "off" ? "off" : "on");
    }catch(e){
      applyHints("off");
    }

    $("textSizeBtn").addEventListener("click", ()=>{
      const isBigNow = document.documentElement.classList.contains("bigText");
      applyTextSize(isBigNow ? "normal" : "big");
    });

    $("hintsBtn").addEventListener("click", ()=>{
      applyHints(HINTS.enabled ? "off" : "on");
    });

    $("readPromptBtn").addEventListener("click", readPrompt);
    $("readChoicesBtn").addEventListener("click", readChoices);
    $("readScreenBtn").addEventListener("click", readScreen);
    $("readJobBtn").addEventListener("click", readJob);
    $("readMetersBtn").addEventListener("click", readMeters);
    $("readCoachBtn").addEventListener("click", readCoach);
    $("readFeedbackBtn").addEventListener("click", readFeedback);
    $("readTaskBtn").addEventListener("click", readTask);

    renderJobTicket();
    loadBest();
    resetGame();
  