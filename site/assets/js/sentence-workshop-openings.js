// Authored sentence openings and attached final clauses, not a general grammar parser.
export const kindNames = {
  response: "separating introductory words",
  clause: "finding the end of an opening clause",
  final: "keeping an attached final clause with the main message",
  short: "recognizing an optional comma after a short opening",
};

export const directions =
  "Read the whole message. Choose a blank space to add a comma; choose a comma to remove it. Check where the opening ends and the main message begins. Some messages need no changes. In the short-opening examples, a comma may be optional. The words and final period stay in place.";

export const models = [
  {
    title: "Separate a response word",
    text: "Yes, I can help with the project.",
    why: "Yes gives the response. The rest tells what the writer can do. A comma separates Yes from the main message. No used as a response works the same way.",
  },
  {
    title: "Find the whole opening clause",
    text: "When the bell rings, put away your materials.",
    why: "When the bell rings tells when. It leaves us waiting for the main direction. Put the comma after the whole opening, not right after When.",
  },
  {
    title: "Notice when the order changes",
    text: "Put away your materials when the bell rings.",
    why: "The direction comes first. When the bell rings follows it and tells exactly when to act. Keep that time clause attached without a comma here. A word like when does not always need a comma beside it.",
  },
  {
    title: "Allow a short opening to flow",
    text: "After lunch we will return the books.",
    why: "After lunch is a short time phrase. This clear sentence works as written. After lunch, we will return the books is also correct. Either choice is accepted in this lesson's short-opening examples.",
  },
];

function item(id, kind, first, second, context, initial = []) {
  const boundary = first.split(" ").length;
  return {
    id: `openings-${id}`,
    kind,
    first,
    second,
    boundary,
    context,
    initial,
    words: `${first} ${second}`.split(" "),
    required: ["response", "clause"].includes(kind) ? [boundary] : [],
    optional: kind === "short" ? boundary : null,
  };
}

export const bank = {
  practice: [
    item(
      "practice-1",
      "response",
      "Yes",
      "we have room for another helper",
      "Reply to someone asking to join the cleanup crew."
    ),
    item(
      "practice-2",
      "clause",
      "When the bell rings",
      "put away your materials",
      "Edit this classroom direction. Keep the whole time clause together."
    ),
    item(
      "practice-3",
      "final",
      "Put away your materials",
      "when the bell rings",
      "The same direction now starts with the action. The ending tells exactly when to act."
    ),
    item(
      "practice-4",
      "short",
      "After lunch",
      "we will return the books",
      "Review this simple plan. Keep it as written or add a comma after the short opening."
    ),
    item(
      "practice-5",
      "response",
      "No",
      "the library is closed this evening",
      "Answer a question about whether the library is open.",
      [3]
    ),
    item(
      "practice-6",
      "clause",
      "If the office is closed",
      "leave the form in the mailbox",
      "Explain what to do if no one is at the office."
    ),
    item(
      "practice-7",
      "final",
      "Leave the form in the mailbox",
      "if the office is closed",
      "The condition at the end tells when this direction applies. Keep it attached."
    ),
    item(
      "practice-8",
      "short",
      "Before practice",
      "we will fill our bottles",
      "Check this team reminder. The short opening can have a comma or flow into the message.",
      [2]
    ),
  ],
  check: [
    item(
      "check-1",
      "response",
      "Yes",
      "I can bring the extra chairs",
      "Reply to a request for chairs."
    ),
    item(
      "check-2",
      "clause",
      "Before you leave the room",
      "turn off the lights",
      "Edit this closing-time reminder."
    ),
    item(
      "check-3",
      "final",
      "Turn off the lights",
      "before you leave the room",
      "The ending specifies when to turn off the lights. Review the message as written."
    ),
    item(
      "check-4",
      "short",
      "After school",
      "we will meet by the library",
      "Review this meeting plan. Use either valid style for its short time opening.",
      [2]
    ),
    item(
      "check-5",
      "response",
      "No",
      "we do not need more paper",
      "Reply to someone offering to bring paper.",
      [1]
    ),
    item(
      "check-6",
      "clause",
      "If your appointment time changes",
      "call the front desk",
      "Make the condition and the action clear in this appointment reminder.",
      [1]
    ),
    item(
      "check-7",
      "final",
      "Call the front desk",
      "if your appointment time changes",
      "The condition tells when a call is needed. Keep it attached to the action.",
      [4]
    ),
    item(
      "check-8",
      "short",
      "In the morning",
      "we will check the schedule",
      "Review the plan for tomorrow. A comma after this short opening is optional."
    ),
    item(
      "check-9",
      "response",
      "Yes",
      "the supervisor can show you the task",
      "Reply to a new helper asking for a demonstration.",
      [2]
    ),
    item(
      "check-10",
      "clause",
      "When the delivery truck arrives",
      "open the side door",
      "Edit this instruction for the delivery helper."
    ),
    item(
      "check-11",
      "final",
      "Open the side door",
      "when the delivery truck arrives",
      "The final clause gives the time to open the door.",
      [5]
    ),
    item(
      "check-12",
      "short",
      "Before dinner",
      "we will set the table",
      "Check this short plan. Keep its words together.",
      [1]
    ),
  ],
  simpler: [
    item("simpler-1", "response", "Yes", "I can carry that box", "Try a shorter reply."),
    item(
      "simpler-2",
      "clause",
      "When you are ready",
      "raise your hand",
      "Find the end of the opening before the direction begins."
    ),
    item(
      "simpler-3",
      "final",
      "Raise your hand",
      "when you are ready",
      "Here the ending tells when to raise your hand.",
      [3]
    ),
    item(
      "simpler-4",
      "short",
      "After class",
      "we can talk",
      "Try this short time opening. Either comma choice works."
    ),
    item(
      "simpler-5",
      "response",
      "No",
      "we cannot stay after class",
      "Give a clear reply to an invitation."
    ),
    item(
      "simpler-6",
      "clause",
      "If you need help",
      "ask a teacher",
      "Separate the whole condition from the direction."
    ),
    item(
      "simpler-7",
      "final",
      "Ask a teacher",
      "if you need help",
      "The ending tells when to ask. Check whether any comma is needed."
    ),
    item(
      "simpler-8",
      "short",
      "At noon",
      "we will eat",
      "Keep this short plan or use its optional opening comma.",
      [2]
    ),
  ],
  apply: [
    item(
      "apply-1",
      "response",
      "Yes",
      "I can help at the school event",
      "Send a reply confirming that you can volunteer."
    ),
    item(
      "apply-2",
      "clause",
      "Before your shift begins",
      "check the work schedule",
      "Edit a reminder for a new worker.",
      [1]
    ),
    item(
      "apply-3",
      "final",
      "Contact the clinic",
      "if you need to change your appointment",
      "Send this reminder. The ending gives the condition for contacting the clinic.",
      [3]
    ),
    item(
      "apply-4",
      "short",
      "After the meeting",
      "we will put away the chairs",
      "Review this cleanup plan before sharing it. Either valid short-opening style works."
    ),
  ],
};

export const allItems = Object.values(bank).flat();
export const initialEdit = (item) => ({ commas: [...item.initial] });
// Demonstrate one valid version; the checker also accepts the optional comma omitted.
export const solution = (item) => ({
  commas: [...item.required, ...(item.optional === null ? [] : [item.optional])],
});

export function editedText(item, edit, nameMarks = false) {
  const selected = Array.isArray(edit?.commas) ? edit.commas : [];
  return (
    item.words
      .map((word, i) => word + (selected.includes(i + 1) ? (nameMarks ? ", comma," : ",") : ""))
      .join(" ") + (nameMarks ? ", period." : ".")
  );
}

export function hint(item) {
  if (item.kind === "response")
    return "Find the word that gives the yes-or-no response. Where does the main message begin?";
  if (item.kind === "clause")
    return "Read the whole opening. It tells when or under what condition to act. Find where the main direction begins; the opening may contain several words.";
  if (item.kind === "final")
    return "Does the action or the time or condition come first? Here the final part tells exactly when the direction applies. Keep those connected parts together.";
  return "Find the short time phrase at the beginning. This message can flow without a comma, or you can place one after the whole opening. Avoid separating words inside either part.";
}

export function clue(item) {
  if (item.kind === "response")
    return `“${item.first}” gives the response. Put a comma after it, before “${item.second}”. Keep the words of the main message together.`;
  if (item.kind === "clause")
    return `The whole opening is “${item.first}”. Place a comma after “${item.words[item.boundary - 1]}”, before the direction “${item.second}”. Do not split the opening itself.`;
  if (item.kind === "final")
    return `“${item.first}” gives the direction first. “${item.second}” follows and specifies when it applies. Keep this final clause attached without a comma here. Remove any commas in this message.`;
  return `“${item.first}” is a short time phrase. This clear message works with no comma or with one after “${item.words[item.boundary - 1]}”. Both choices are accepted; keep the words inside each part together.`;
}

export function checkEdit(item, edit) {
  const result = (correct, message) => ({ correct, kind: item.kind, message });
  const selected = edit?.commas;
  if (
    !Array.isArray(selected) ||
    new Set(selected).size !== selected.length ||
    selected.some((gap) => !Number.isInteger(gap) || gap < 1 || gap >= item.words.length)
  )
    return result(
      false,
      "Use the spaces in the message to add or remove commas, then check again."
    );
  const extra = selected.find((gap) => !item.required.includes(gap) && gap !== item.optional);
  if (extra !== undefined) {
    if (item.kind === "final") return result(false, clue(item));
    if (extra < item.boundary)
      return result(
        false,
        `The comma splits “${item.first}”. Keep that whole opening together. ${item.kind === "short" ? "A comma after it is optional." : "Put the comma after the whole opening."}`
      );
    return result(
      false,
      `The comma after “${item.words[extra - 1]}” splits the main message. Keep “${item.second}” together. Check where the opening ends.`
    );
  }
  if (item.required.some((gap) => !selected.includes(gap))) return result(false, clue(item));
  if (item.kind === "short")
    return result(
      true,
      `${selected.length ? "You used a comma after the short opening." : "You let the short opening flow without a comma."} Both versions are correct in this clear message.`
    );
  return result(true, clue(item));
}
