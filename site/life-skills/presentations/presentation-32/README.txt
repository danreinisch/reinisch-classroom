Mastercard Interview Prep (Presentation Slot)

Drop BOTH files into:
  site/life-skills/presentations/presentation-31/
(or whichever presentation folder you want to use)

Required files:
  1) entry.html   (this is what the Life Skills presentation shell loads)
  2) mastercard_interview_prep_stephanie.html (the actual module)

Why this works:
- The shell expects an entry.html for the slot.
- entry.html is a safe fragment that embeds the full module in an iframe.

Quick test after deploy:
- Open /life-skills/presentations/presentation-31/
- In DevTools > Network, verify entry.html is 200 (not 404)
- If the shell still says "No entry HTML found", check it isn't requesting a different filename.
