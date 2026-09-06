// Original sentence-ending tasks. Context specifies the intended tone;
// where both a calm and an excited reading fit, both endings are accepted.
export const markNames = Object.freeze({
  ".": "period",
  "?": "question mark",
  "!": "exclamation mark",
});
function item(id, text, intent, context, clue) {
  return Object.freeze({
    id: `endings-${id}`,
    text,
    intent,
    context,
    clue,
    accepted: Object.freeze(
      intent === "question"
        ? ["?"]
        : intent === "strong"
          ? ["!"]
          : intent === "flexible"
            ? [".", "!"]
            : ["."]
    ),
  });
}
export const models = Object.freeze([
  {
    text: "The library opens at eight.",
    why: "This calmly gives information. The period ends the statement.",
  },
  {
    text: "When does the library open?",
    why: "This directly asks for information. The question mark shows a question.",
  },
  {
    text: "Watch out for the falling branch!",
    why: "This urgent warning calls for a strong voice. The exclamation mark adds emphasis.",
  },
]);
export const bank = Object.freeze({
  practice: Object.freeze([
    item(
      "practice-1",
      "What time does practice start",
      "question",
      "Ask your coach for the starting time.",
      "The writer wants the coach to answer with a time."
    ),
    item(
      "practice-2",
      "Please put the supplies on the shelf",
      "statement",
      "Give an everyday direction in a calm tone.",
      "A direction can end with a period. This one does not call for shouting."
    ),
    item(
      "practice-3",
      "Watch out for the moving cart",
      "strong",
      "Write an urgent warning so someone notices the danger.",
      "The warning needs strong emphasis because the cart is moving toward someone."
    ),
    item(
      "practice-4",
      "Can we meet after class",
      "question",
      "Ask a classmate whether meeting after class will work.",
      "Can we meet asks for a response, even though it is also a request."
    ),
    item(
      "practice-5",
      "I wonder when the bus will arrive",
      "statement",
      "Calmly state what you are wondering about.",
      "The whole sentence reports a thought. The word when inside it does not make it a direct question."
    ),
    item(
      "practice-6",
      "What a fantastic goal",
      "strong",
      "Show strong excitement as your team scores.",
      "What a fantastic goal expresses excitement. It does not ask someone for information."
    ),
    item(
      "practice-7",
      "Where should this package go",
      "question",
      "Ask a coworker where to put a package.",
      "The writer needs an answer about a place."
    ),
    item(
      "practice-8",
      "The poster explains how to sign up",
      "statement",
      "Calmly tell a friend what the poster explains.",
      "The sentence gives information about the poster, even though it contains how."
    ),
    item(
      "practice-9",
      "We finally finished the project",
      "flexible",
      "Share your success. A calm report or an excited message both fit.",
      "A period gives a calm tone. An exclamation mark adds excitement. Either fits this task."
    ),
  ]),
  check: Object.freeze([
    item(
      "check-1",
      "Could you show me the next step",
      "question",
      "Ask a teacher for help with the next step.",
      "Could you show me is a direct question, including when it is used as a polite request."
    ),
    item(
      "check-2",
      "The sign tells us where to park",
      "statement",
      "Calmly explain what information the sign gives.",
      "Where is inside a statement about the sign. The writer is not directly asking where to park."
    ),
    item(
      "check-3",
      "What an amazing performance",
      "strong",
      "Express strong excitement after the concert.",
      "This is an excited reaction, not a request for an answer."
    ),
    item(
      "check-4",
      "Is this the correct entrance",
      "question",
      "Ask someone to confirm which entrance to use.",
      "Is this asks for confirmation."
    ),
    item(
      "check-5",
      "Please return the key before lunch",
      "statement",
      "Give a routine reminder in a calm tone.",
      "A calm direction uses a period here."
    ),
    item(
      "check-6",
      "Stay away from the broken glass",
      "strong",
      "Write a forceful warning about an immediate hazard.",
      "The context asks for a strong warning, so the ending should add emphasis."
    ),
    item(
      "check-7",
      "How much does the ticket cost",
      "question",
      "Ask the ticket seller for the price.",
      "The writer needs an answer about the cost."
    ),
    item(
      "check-8",
      "She asked whether the store was open",
      "statement",
      "Calmly report what someone asked earlier.",
      "This reports a question. It does not ask that question directly."
    ),
    item(
      "check-9",
      "Our group won the contest",
      "strong",
      "Send a message that shows strong excitement about the win.",
      "A period would be calmer; this task explicitly asks for strong excitement."
    ),
  ]),
  simpler: Object.freeze([
    item(
      "simpler-1",
      "Are you ready",
      "question",
      "Ask someone if they are ready.",
      "This asks for a yes or no answer."
    ),
    item(
      "simpler-2",
      "The door is open",
      "statement",
      "Calmly tell someone about the door.",
      "This gives information in a calm voice."
    ),
    item(
      "simpler-3",
      "Look out",
      "strong",
      "Shout a warning about danger.",
      "An urgent warning needs emphasis in this task."
    ),
    item(
      "simpler-4",
      "Is it raining",
      "question",
      "Ask about the weather.",
      "This asks for an answer."
    ),
    item(
      "simpler-5",
      "The light is green",
      "statement",
      "Calmly describe the traffic light.",
      "This gives information."
    ),
    item(
      "simpler-6",
      "We did it",
      "strong",
      "Show strong excitement after reaching a goal.",
      "The context asks for an excited voice."
    ),
  ]),
  apply: Object.freeze([
    item(
      "apply-1",
      "Would you explain which form to use",
      "question",
      "You need help at an office. Finish this polite request to the receptionist.",
      "The request is phrased as a direct question: Would you explain...?"
    ),
    item(
      "apply-2",
      "The schedule shows when our shift ends",
      "statement",
      "Finish a calm workplace message explaining where to find the ending time.",
      "The message describes information on the schedule. When does not turn it into a direct question."
    ),
    item(
      "apply-3",
      "Keep clear of the falling equipment",
      "strong",
      "Finish an urgent workplace warning about equipment that is falling.",
      "The task asks for a forceful warning about immediate danger."
    ),
    item(
      "apply-4",
      "Your artwork is on display",
      "flexible",
      "Send a friend good news. A calm update or an excited announcement both fit.",
      "A period reports the news calmly. An exclamation mark adds excitement. Both fit."
    ),
    item(
      "apply-5",
      "Which bus goes to the library",
      "question",
      "Ask for travel information at the bus station.",
      "The writer needs an answer about which bus to take."
    ),
    item(
      "apply-6",
      "The email explains how to reset the password",
      "statement",
      "Calmly tell someone where to find the reset instructions.",
      "This describes an email. It does not directly ask how to reset the password."
    ),
  ]),
});
export const allItems = Object.freeze(Object.values(bank).flat());
export function initialEdit() {
  return { ending: null };
}
export function solution(item) {
  return { ending: item.accepted[0] };
}
export function editedText(item, edit, nameMarks = false) {
  const mark = Object.hasOwn(markNames, edit.ending) ? edit.ending : "";
  return (
    item.text + (nameMarks ? (mark ? `, ${markNames[mark]}.` : ". No ending mark selected.") : mark)
  );
}
export function checkEdit(item, edit) {
  const correct = item.accepted.includes(edit.ending);
  let message;
  if (!Object.hasOwn(markNames, edit.ending)) {
    message =
      "Choose one ending for the message. Think about what the writer wants to communicate.";
  } else if (correct) {
    message =
      item.intent === "flexible"
        ? edit.ending === "."
          ? "The period gives this news a calm tone. An exclamation mark would also fit if you wanted excitement."
          : "The exclamation mark gives this news an excited tone. A period would also fit for a calmer report."
        : item.intent === "question"
          ? "The question mark fits this direct question. The writer is asking for a response."
          : item.intent === "strong"
            ? "The exclamation mark adds the strong feeling or urgency requested by this task."
            : "The period fits the calm statement or direction requested by this task.";
  } else {
    message =
      item.intent === "question"
        ? "The writer is directly asking for a response. Read the whole message and choose the ending for a question."
        : item.intent === "strong"
          ? "A period could sound calmer, but this task asks for strong feeling or urgency. Choose the ending that adds emphasis."
          : item.intent === "flexible"
            ? "This message shares news. Choose a calm or excited ending for that news."
            : "This task asks for a calm statement or direction. Read the whole message; a question word inside a statement does not make the whole sentence a question.";
  }
  return { ending: correct, kind: item.intent, correct, message };
}
