// Authored edits for supplied classroom messages, not a free-writing grammar parser.
export const kindNames = {
  subject: "adding who or what",
  verb: "completing the verb",
  dependent: "finishing a dependent thought",
  runon: "separating or joining complete thoughts",
  complete: "recognizing a sentence that already works",
};

export const models = [
  {
    title: "Give a fragment what it needs",
    before: "The volunteers working outside.",
    after: "The volunteers are working outside.",
    why: "Working alone does not complete the verb here. Adding are tells what the volunteers are doing. Other fragments may need who or what, or a main thought after words such as because.",
  },
  {
    title: "Give complete thoughts a proper join",
    before: "The gate is locked, we need the key.",
    after: "The gate is locked. We need the key.",
    why: "Each part could stand alone. A comma alone does not join them correctly here. You can also write: The gate is locked, so we need the key. Or: The gate is locked; we need the key.",
  },
  {
    title: "Some sentences need no repair",
    before: "Please wait here.",
    after: "Please wait here.",
    why: "A direction can have an understood you. A long sentence can also be complete: The volunteers packed the boxes and carried them to the van after lunch. Length alone does not make a run-on.",
  },
];

function option(id, label, text, correct, feedback) {
  return { id, label, text, correct, feedback };
}

function fragment(id, kind, text, context, clue, choices) {
  return {
    id: `repairs-${id}`,
    kind,
    text,
    context,
    clue,
    mode: "words",
    choices: [
      ...choices.map((c) => option(...c)),
      option("keep", "Keep the draft as written", text, false, clue),
    ],
  };
}

function runon(id, left, right, splice, link, context) {
  const leftWords = left.split(" ");
  const text = `${left}${splice ? "," : ""} ${right}.`;
  return {
    id: `repairs-${id}`,
    kind: "runon",
    mode: "join",
    text,
    context,
    link,
    words: text.slice(0, -1).split(" "),
    boundary: leftWords.length,
    clue: `“${left}” and “${right}” can each stand alone. Choose the space after “${leftWords.at(-1)}”. Use a period and capital, a semicolon, or a comma with ${link}. A comma by itself is not enough here.`,
  };
}

function complete(id, text, context, clue, wrong) {
  return {
    id: `repairs-${id}`,
    kind: "complete",
    mode: "words",
    text,
    context,
    clue,
    choices: [
      option("keep", "Keep the draft as written", text, true, clue),
      ...wrong.map((c) => option(...c)),
    ],
  };
}

export const bank = {
  practice: [
    fragment(
      "practice-1",
      "subject",
      "Carried the instruments to the stage.",
      "Write a complete sentence about what the musicians did.",
      "Carried tells what happened, but this draft does not say who carried the instruments. Add the musicians as the subject.",
      [
        [
          "when",
          "Add After lunch at the start",
          "After lunch carried the instruments to the stage.",
          false,
          "After lunch tells when. The sentence still needs who carried the instruments.",
        ],
        [
          "who",
          "Add The musicians at the start",
          "The musicians carried the instruments to the stage.",
          true,
          "The musicians tells who. Carried tells what they did. The thought is complete.",
        ],
        [
          "more",
          "Add carefully at the end",
          "Carried the instruments to the stage carefully.",
          false,
          "Carefully tells how. It does not tell who carried the instruments.",
        ],
      ]
    ),
    fragment(
      "practice-2",
      "verb",
      "The students waiting by the door.",
      "Tell what the students are doing right now in a complete sentence.",
      "The students tells who. Waiting needs a helping verb here: are waiting.",
      [
        [
          "verb",
          "Add are before waiting",
          "The students are waiting by the door.",
          true,
          "Are waiting is a complete verb. The sentence now tells what the students are doing.",
        ],
        [
          "where",
          "Add outside at the end",
          "The students waiting by the door outside.",
          false,
          "Outside adds a place. Waiting still needs a helping verb here.",
        ],
        [
          "when",
          "Add Today at the start",
          "Today the students waiting by the door.",
          false,
          "Today tells when. It does not complete the verb waiting.",
        ],
      ]
    ),
    fragment(
      "practice-3",
      "dependent",
      "Because the field was wet.",
      "Explain why the team practiced inside. Keep the reason and add what the team did.",
      "Because introduces a reason that leaves us waiting for the main thought. Add the team practiced inside after the reason.",
      [
        [
          "extra",
          "Add very before wet",
          "Because the field was very wet.",
          false,
          "Very adds detail, but because still leaves the main thought unfinished.",
        ],
        [
          "period",
          "Put a period after Because",
          "Because. The field was wet.",
          false,
          "Because by itself is still a fragment. Splitting off that word does not finish the thought.",
        ],
        [
          "main",
          "Add , the team practiced inside at the end",
          "Because the field was wet, the team practiced inside.",
          true,
          "The team practiced inside completes the thought. The comma follows the opening because clause.",
        ],
      ]
    ),
    runon(
      "practice-4",
      "The library is open",
      "we can return the books",
      false,
      "so",
      "Make the two related thoughts clear. Keep both ideas."
    ),
    complete(
      "practice-5",
      "Please place the folder on the desk.",
      "Review this classroom direction. Keep the meaning; change it only if it is incomplete or joined incorrectly.",
      "This is a complete direction. The subject you is understood, and place tells the action. It can stay as written.",
      [
        [
          "split",
          "Put a period after folder",
          "Please place the folder. On the desk.",
          false,
          "On the desk would be a fragment. Keep the place with the direction.",
        ],
        [
          "because",
          "Add Because at the start",
          "Because please place the folder on the desk.",
          false,
          "Adding Because does not improve this complete direction.",
        ],
      ]
    ),
    fragment(
      "practice-6",
      "subject",
      "Delivered the meals before noon.",
      "Write a complete sentence saying that the volunteers delivered the meals.",
      "The draft needs who delivered the meals. Add the volunteers.",
      [
        [
          "who",
          "Add The volunteers at the start",
          "The volunteers delivered the meals before noon.",
          true,
          "The volunteers is the subject. Delivered tells what they did.",
        ],
        [
          "when",
          "Add Yesterday at the start",
          "Yesterday delivered the meals before noon.",
          false,
          "Yesterday gives a time, but not who delivered the meals.",
        ],
        [
          "more",
          "Add safely at the end",
          "Delivered the meals before noon safely.",
          false,
          "Safely adds how, but the sentence still needs a subject.",
        ],
      ]
    ),
    fragment(
      "practice-7",
      "verb",
      "The cashier counting the change.",
      "Tell what the cashier is doing now.",
      "Counting needs is here to make the complete verb is counting.",
      [
        [
          "when",
          "Add Now at the start",
          "Now the cashier counting the change.",
          false,
          "Now gives a time, but it does not complete the verb.",
        ],
        [
          "verb",
          "Add is before counting",
          "The cashier is counting the change.",
          true,
          "Is counting tells what the cashier is doing.",
        ],
        [
          "more",
          "Add carefully at the end",
          "The cashier counting the change carefully.",
          false,
          "Carefully tells how. The verb still needs is here.",
        ],
      ]
    ),
    fragment(
      "practice-8",
      "dependent",
      "When the timer rings.",
      "Explain that we will check the food when the timer rings.",
      "When sets up a time. Add what will happen: we will check the food.",
      [
        [
          "main",
          "Add , we will check the food at the end",
          "When the timer rings, we will check the food.",
          true,
          "The main thought we will check the food finishes the message.",
        ],
        [
          "more",
          "Add loudly at the end",
          "When the timer rings loudly.",
          false,
          "Loudly adds detail, but we are still waiting to learn what will happen.",
        ],
        [
          "period",
          "Put a period after timer",
          "When the timer. Rings.",
          false,
          "This splits the unfinished thought into two fragments.",
        ],
      ]
    ),
    runon(
      "practice-9",
      "The printer is empty",
      "we need more paper",
      true,
      "so",
      "Repair this note without dropping either thought."
    ),
    complete(
      "practice-10",
      "The workers cleaned the tables and stacked the chairs before closing.",
      "Review this report. A long sentence may already be complete.",
      "The workers is the subject for both cleaned and stacked. And joins two actions. This is one complete sentence, not a run-on.",
      [
        [
          "split",
          "Put a period before before closing",
          "The workers cleaned the tables and stacked the chairs. Before closing.",
          false,
          "Before closing cannot stand alone here. It belongs with the completed actions.",
        ],
        [
          "because",
          "Add Because at the start",
          "Because the workers cleaned the tables and stacked the chairs before closing.",
          false,
          "Because makes the reader wait for a main thought that is no longer supplied.",
        ],
      ]
    ),
  ],
  check: [
    fragment(
      "check-1",
      "subject",
      "Repaired the flat tire after school.",
      "Write a complete sentence saying that my neighbor repaired the tire.",
      "The draft has an action but no subject. Add my neighbor to tell who repaired the tire.",
      [
        [
          "when",
          "Add Yesterday at the start",
          "Yesterday repaired the flat tire after school.",
          false,
          "Yesterday tells when, but not who did the repair.",
        ],
        [
          "more",
          "Add carefully at the end",
          "Repaired the flat tire after school carefully.",
          false,
          "Carefully does not supply a subject.",
        ],
        [
          "who",
          "Add My neighbor at the start",
          "My neighbor repaired the flat tire after school.",
          true,
          "My neighbor is the subject. Repaired tells the action.",
        ],
      ]
    ),
    fragment(
      "check-2",
      "verb",
      "The delivery driver checking the address.",
      "Tell what the driver is doing now in a complete sentence.",
      "Checking needs is here. The delivery driver is checking the address is complete.",
      [
        [
          "verb",
          "Add is before checking",
          "The delivery driver is checking the address.",
          true,
          "Is checking completes the verb and tells what the driver is doing.",
        ],
        [
          "where",
          "Add outside at the end",
          "The delivery driver checking the address outside.",
          false,
          "Outside does not complete the verb checking.",
        ],
        [
          "when",
          "Add Today at the start",
          "Today the delivery driver checking the address.",
          false,
          "Today gives a time, but a helping verb is still missing.",
        ],
      ]
    ),
    fragment(
      "check-3",
      "dependent",
      "Although the line was long.",
      "Say that we waited patiently even though the line was long. Keep both ideas.",
      "Although introduces an unfinished contrast. Add we waited patiently as the main thought.",
      [
        [
          "extra",
          "Add very before long",
          "Although the line was very long.",
          false,
          "The contrast still needs its main thought. Very only adds detail.",
        ],
        [
          "main",
          "Add , we waited patiently at the end",
          "Although the line was long, we waited patiently.",
          true,
          "We waited patiently completes the contrast introduced by Although.",
        ],
        [
          "period",
          "Put a period after Although",
          "Although. The line was long.",
          false,
          "Although alone remains a fragment.",
        ],
      ]
    ),
    runon(
      "check-4",
      "The door was heavy",
      "the handle moved easily",
      true,
      "but",
      "Keep both observations and make their connection clear."
    ),
    complete(
      "check-5",
      "Our class sorted the donations and packed them into labeled boxes after lunch.",
      "Review this report without dropping information. Change it only if needed.",
      "Our class is the subject for sorted and packed. And connects two actions by that subject. The length does not make this a run-on.",
      [
        [
          "split",
          "Put a period after donations",
          "Our class sorted the donations. And packed them into labeled boxes after lunch.",
          false,
          "And packed them into labeled boxes after lunch is missing its subject as a separate sentence.",
        ],
        [
          "because",
          "Add Because at the start",
          "Because our class sorted the donations and packed them into labeled boxes after lunch.",
          false,
          "Because turns the report into an unfinished dependent thought.",
        ],
      ]
    ),
    fragment(
      "check-6",
      "subject",
      "Organized the supplies for the art club.",
      "Say that the club members organized the supplies in a complete sentence.",
      "Add the club members to tell who organized the supplies.",
      [
        [
          "who",
          "Add The club members at the start",
          "The club members organized the supplies for the art club.",
          true,
          "The club members supplies the subject for organized.",
        ],
        [
          "when",
          "Add Before class at the start",
          "Before class organized the supplies for the art club.",
          false,
          "Before class gives a time, but the draft still does not tell who organized the supplies.",
        ],
        [
          "more",
          "Add neatly at the end",
          "Organized the supplies for the art club neatly.",
          false,
          "Neatly tells how, not who.",
        ],
      ]
    ),
    fragment(
      "check-7",
      "verb",
      "The passengers standing near the exit.",
      "Tell what the passengers are doing now.",
      "Standing needs are to complete the verb in this sentence.",
      [
        [
          "when",
          "Add Today at the start",
          "Today the passengers standing near the exit.",
          false,
          "Today does not complete the verb.",
        ],
        [
          "more",
          "Add quietly at the end",
          "The passengers standing near the exit quietly.",
          false,
          "Quietly tells how, but standing still needs are here.",
        ],
        [
          "verb",
          "Add are before standing",
          "The passengers are standing near the exit.",
          true,
          "Are standing tells what the passengers are doing.",
        ],
      ]
    ),
    fragment(
      "check-8",
      "dependent",
      "If the store closes early.",
      "Explain that we will shop tomorrow if the store closes early. Keep the condition.",
      "If introduces a condition. Add we will shop tomorrow to finish the thought.",
      [
        [
          "main",
          "Add , we will shop tomorrow at the end",
          "If the store closes early, we will shop tomorrow.",
          true,
          "The sentence now gives both the condition and what we will do.",
        ],
        [
          "more",
          "Add today at the end",
          "If the store closes early today.",
          false,
          "Today adds a time, but the condition still lacks its main thought.",
        ],
        [
          "period",
          "Put a period after If",
          "If. The store closes early.",
          false,
          "If is not a complete sentence by itself.",
        ],
      ]
    ),
    runon(
      "check-9",
      "The path is clear",
      "the group can continue",
      false,
      "so",
      "Write both related ideas clearly."
    ),
    complete(
      "check-10",
      "Keep your receipt.",
      "Review this complete store direction; edit only if necessary.",
      "This is a complete direction with an understood you. Keep supplies the action and your receipt tells what to keep.",
      [
        [
          "split",
          "Put a period after Keep",
          "Keep. Your receipt.",
          false,
          "Your receipt would be a fragment. Keep it attached to the direction.",
        ],
        [
          "because",
          "Add Because at the start",
          "Because keep your receipt.",
          false,
          "Because does not improve this complete direction.",
        ],
      ]
    ),
  ],
  simpler: [
    fragment(
      "simpler-1",
      "subject",
      "Fixed the chair.",
      "Write that the custodian fixed the chair.",
      "Add the custodian to tell who fixed it.",
      [
        [
          "who",
          "Add The custodian at the start",
          "The custodian fixed the chair.",
          true,
          "The custodian tells who fixed the chair.",
        ],
        [
          "more",
          "Add quickly at the end",
          "Fixed the chair quickly.",
          false,
          "Quickly tells how. The sentence still needs who.",
        ],
      ]
    ),
    fragment(
      "simpler-2",
      "verb",
      "The child smiling.",
      "Tell what the child is doing now.",
      "Add is before smiling to complete the verb.",
      [
        [
          "more",
          "Add happily at the end",
          "The child smiling happily.",
          false,
          "Happily adds how, but is is still needed here.",
        ],
        [
          "verb",
          "Add is before smiling",
          "The child is smiling.",
          true,
          "Is smiling completes the verb.",
        ],
      ]
    ),
    fragment(
      "simpler-3",
      "dependent",
      "Because it rained.",
      "Explain that we stayed inside because it rained.",
      "Add the main thought we stayed inside after the reason.",
      [
        [
          "main",
          "Add , we stayed inside at the end",
          "Because it rained, we stayed inside.",
          true,
          "We stayed inside completes the thought introduced by Because.",
        ],
        [
          "more",
          "Add yesterday at the end",
          "Because it rained yesterday.",
          false,
          "Yesterday gives a time, but the reason still needs a main thought.",
        ],
      ]
    ),
    runon(
      "simpler-4",
      "It is cold",
      "we need coats",
      false,
      "so",
      "Keep both ideas and give them a proper join."
    ),
    complete(
      "simpler-5",
      "Stand here.",
      "Review this direction. Edit only if needed.",
      "Stand here is a complete direction. You is understood.",
      [
        [
          "because",
          "Add Because at the start",
          "Because stand here.",
          false,
          "Adding Because does not improve this direction.",
        ],
        [
          "split",
          "Put a period after Stand",
          "Stand. Here.",
          false,
          "Here alone is not the complete direction asked for.",
        ],
      ]
    ),
    fragment(
      "simpler-6",
      "subject",
      "Washed the cups.",
      "Say that the helper washed the cups.",
      "Add the helper to name who washed the cups.",
      [
        [
          "more",
          "Add carefully at the end",
          "Washed the cups carefully.",
          false,
          "Carefully does not tell who washed the cups.",
        ],
        [
          "who",
          "Add The helper at the start",
          "The helper washed the cups.",
          true,
          "The helper supplies the subject.",
        ],
      ]
    ),
    fragment(
      "simpler-7",
      "verb",
      "The fans cheering.",
      "Tell what the fans are doing now.",
      "Add are before cheering.",
      [
        [
          "verb",
          "Add are before cheering",
          "The fans are cheering.",
          true,
          "Are cheering is a complete verb.",
        ],
        [
          "more",
          "Add loudly at the end",
          "The fans cheering loudly.",
          false,
          "Loudly adds detail but does not complete the verb.",
        ],
      ]
    ),
    fragment(
      "simpler-8",
      "dependent",
      "When class ends.",
      "Say that we will leave when class ends.",
      "Add we will leave to finish what When sets up.",
      [
        [
          "more",
          "Add today at the end",
          "When class ends today.",
          false,
          "Today does not tell what will happen when class ends.",
        ],
        [
          "main",
          "Add , we will leave at the end",
          "When class ends, we will leave.",
          true,
          "We will leave completes the thought.",
        ],
      ]
    ),
    runon(
      "simpler-9",
      "The bag is full",
      "we need another",
      true,
      "so",
      "Keep both thoughts in this short message."
    ),
    complete(
      "simpler-10",
      "The dog ran and jumped.",
      "Review this sentence. Change it only if needed.",
      "The dog is the subject for ran and jumped. The sentence is complete.",
      [
        [
          "split",
          "Put a period after ran",
          "The dog ran. And jumped.",
          false,
          "And jumped is missing its subject when separated from the dog.",
        ],
        [
          "because",
          "Add Because at the start",
          "Because the dog ran and jumped.",
          false,
          "Because creates an unfinished dependent thought.",
        ],
      ]
    ),
  ],
  apply: [
    fragment(
      "apply-1",
      "dependent",
      "Because the bus was delayed.",
      "Write a message to your supervisor: explain that I will arrive late because the bus was delayed. Keep both ideas.",
      "The reason beginning with Because needs its main thought: I will arrive late.",
      [
        [
          "main",
          "Add , I will arrive late at the end",
          "Because the bus was delayed, I will arrive late.",
          true,
          "The message now tells both why and what will happen. I stays capitalized.",
        ],
        [
          "more",
          "Add this morning at the end",
          "Because the bus was delayed this morning.",
          false,
          "This morning adds when, but the message still needs what will happen.",
        ],
        [
          "period",
          "Put a period after Because",
          "Because. The bus was delayed.",
          false,
          "Because alone is a fragment, and the arrival information is still missing.",
        ],
      ]
    ),
    runon(
      "apply-2",
      "The meeting room is ready",
      "the guests can come in",
      true,
      "so",
      "Repair this workplace message. Keep both the room update and the invitation."
    ),
    complete(
      "apply-3",
      "Please bring your identification and sign in at the front desk.",
      "Review a visitor instruction. Keep all the instructions; edit only if needed.",
      "This is a complete direction with an understood you. Bring and sign in share that subject. It can stay as written.",
      [
        [
          "split",
          "Put a period before at the front desk",
          "Please bring your identification and sign in. At the front desk.",
          false,
          "At the front desk would be a fragment. It belongs with the instructions.",
        ],
        [
          "because",
          "Add Because at the start",
          "Because please bring your identification and sign in at the front desk.",
          false,
          "The original direction is complete. Adding Because does not help.",
        ],
      ]
    ),
    fragment(
      "apply-4",
      "verb",
      "The technician testing the alarm.",
      "Write a complete maintenance update about what the technician is doing now.",
      "Add is to make the complete verb is testing.",
      [
        [
          "more",
          "Add carefully at the end",
          "The technician testing the alarm carefully.",
          false,
          "Carefully tells how, but is is still needed here.",
        ],
        [
          "verb",
          "Add is before testing",
          "The technician is testing the alarm.",
          true,
          "Is testing completes this update.",
        ],
        [
          "when",
          "Add Now at the start",
          "Now the technician testing the alarm.",
          false,
          "Now gives a time but does not complete the verb.",
        ],
      ]
    ),
    runon(
      "apply-5",
      "The form is complete",
      "the signature is missing",
      false,
      "but",
      "Keep both facts and show the contrast in this office note."
    ),
  ],
};

export const allItems = Object.values(bank).flat();
export const initialEdit = () => ({ choice: null, gap: null, join: null });
export const solution = (item) =>
  item.mode === "join"
    ? { choice: null, gap: item.boundary, join: "period" }
    : { choice: item.choices.find((c) => c.correct).id, gap: null, join: null };

export function joinNames(item) {
  return {
    period: "Period + capital",
    semicolon: "Semicolon",
    linked: `Comma + ${item.link}`,
    comma: "Comma only",
  };
}

export function editedText(item, edit, nameMarks = false) {
  if (item.mode === "words")
    return item.choices.find((c) => c.id === edit?.choice)?.text || item.text;
  if (
    !edit ||
    edit.choice === "keep" ||
    !Number.isInteger(edit.gap) ||
    edit.gap < 1 ||
    edit.gap >= item.words.length ||
    !Object.hasOwn(joinNames(item), edit.join)
  )
    return item.text;
  const left = item.words.slice(0, edit.gap).join(" ").replace(/,$/, "");
  let right = item.words.slice(edit.gap).join(" ");
  if (edit.join === "period") right = right[0].toUpperCase() + right.slice(1);
  const marks = { period: ". ", semicolon: "; ", linked: `, ${item.link} `, comma: ", " };
  const names = {
    period: ", period. Capital first letter. ",
    semicolon: ", semicolon. ",
    linked: `, comma, ${item.link}. `,
    comma: ", comma. ",
  };
  return left + (nameMarks ? names : marks)[edit.join] + right + ".";
}

export function checkEdit(item, edit) {
  const result = (correct, message) => ({ correct, kind: item.kind, message });
  if (item.mode === "words") {
    const chosen = item.choices.find((c) => c.id === edit?.choice);
    return chosen
      ? result(chosen.correct, chosen.feedback)
      : result(
          false,
          "Choose an edit, or choose to keep the draft. Read the result before checking."
        );
  }
  if (edit?.choice === "keep")
    return result(
      false,
      "Both thoughts can stand alone, but the draft does not join them correctly. Find where the second complete thought begins."
    );
  if (
    !edit ||
    !Number.isInteger(edit.gap) ||
    edit.gap < 1 ||
    edit.gap >= item.words.length ||
    !Object.hasOwn(joinNames(item), edit.join)
  )
    return result(
      false,
      "Choose the space between the complete thoughts and a way to separate or join them. Read the resulting message."
    );
  if (edit.gap !== item.boundary)
    return result(
      false,
      "This spot does not separate the two complete thoughts. Read each side: can each side stand alone?"
    );
  if (edit.join === "comma")
    return result(
      false,
      "You found where the thoughts meet. A comma alone creates a comma splice here. Add the linking word, use a semicolon, or make two sentences."
    );
  const why = {
    period: "The period ends the first complete thought. The next sentence begins with a capital.",
    semicolon: "The semicolon joins two closely related thoughts that could each stand alone.",
    linked: `The comma and ${item.link} join two complete thoughts. Both ideas are preserved.`,
  };
  return result(true, why[edit.join] + " More than one repair works for this message.");
}
