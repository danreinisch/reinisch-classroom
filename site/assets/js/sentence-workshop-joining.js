// Controlled joins with an explicit writer's purpose, not unrestricted grammar grading.
export const kindNames = {
  addition: "adding another fact",
  contrast: "showing a contrast",
  result: "showing a result",
  shared: "joining actions that share a subject",
};
export const linkNames = { and: "add information", but: "show a contrast", so: "show a result" };
export const directions =
  "Read the writer's purpose and both parts. Choose and, but, or so to express that purpose. Then choose Comma before the link or No comma. Use a comma to join two complete thoughts in this lesson. Keep two actions with a shared subject together without a comma. Read your message before checking. The words and final period stay in place.";
export const models = [
  {
    title: "Add another fact",
    text: "The library has new books, and the computer room has new chairs.",
    why: "And adds a second fact. Each part can be a sentence: each names its own subject and tells something complete. Put a comma before and.",
  },
  {
    title: "Show a contrast",
    text: "We planned to play outside, but the playground was closed.",
    why: "But signals the contrast between the plan and what happened. Both parts can stand alone, so use a comma before but.",
  },
  {
    title: "Show a result",
    text: "The front entrance was blocked, so we used the side door.",
    why: "So makes the result clear: the blocked entrance explains our choice. Both parts are complete thoughts; put the comma before so.",
  },
  {
    title: "Check for a shared subject",
    text: "We packed our bags and waited by the door.",
    why: "We is the subject of both actions: packed and waited. Waited by the door has no subject of its own in this statement. Keep the actions together without a comma. Compare: We packed our bags, and we waited by the door. Repeating we gives the second part its own subject.",
  },
];
function item(id, kind, first, second, link, context, purpose, meaning, subject = null) {
  return {
    id: `joining-${id}`,
    kind,
    first,
    second,
    link,
    context,
    purpose,
    meaning,
    subject,
    comma: kind !== "shared",
  };
}
export const bank = {
  practice: [
    item(
      "practice-1",
      "addition",
      "The art room has new brushes",
      "the music room has new drums",
      "and",
      "Write a school update.",
      "Add another fact about the school.",
      "The second fact adds news about a different room."
    ),
    item(
      "practice-2",
      "contrast",
      "We wanted to use the gym",
      "another class was already inside",
      "but",
      "Explain a change to the class plan.",
      "Show the contrast between our plan and the situation.",
      "The occupied gym gets in the way of the plan."
    ),
    item(
      "practice-3",
      "result",
      "The bus broke down this morning",
      "we arrived at school late",
      "so",
      "Explain a late arrival.",
      "Show that the delay resulted from the breakdown.",
      "The breakdown caused the late arrival."
    ),
    item(
      "practice-4",
      "shared",
      "We packed our lunches",
      "waited by the door",
      "and",
      "Describe the group's preparations.",
      "Add the second action to the first.",
      "The group did both actions.",
      "We"
    ),
    item(
      "practice-5",
      "addition",
      "The cafeteria serves hot meals",
      "the library lends board games",
      "and",
      "Describe two school services.",
      "Add another fact, without claiming a cause or contrast.",
      "These are two separate services the school offers."
    ),
    item(
      "practice-6",
      "contrast",
      "I checked the office twice",
      "the missing folder was still gone",
      "but",
      "Report your search for a folder.",
      "Show that the search did not bring the hoped-for result.",
      "The folder was missing despite the search."
    ),
    item(
      "practice-7",
      "result",
      "Our table needed more chairs",
      "we brought some from the hallway",
      "so",
      "Explain why you moved the chairs.",
      "Show that the need for seats led to the action.",
      "The need for more seats explains bringing chairs."
    ),
    item(
      "practice-8",
      "shared",
      "The helper looked for the key",
      "could not find it",
      "but",
      "Explain an unsuccessful search.",
      "Show the contrast between trying and succeeding.",
      "Looking did not lead to finding the key.",
      "The helper"
    ),
  ],
  check: [
    item(
      "check-1",
      "addition",
      "The workshop offers bike repairs",
      "the store sells used helmets",
      "and",
      "Describe two neighborhood services.",
      "Add a second fact without claiming a cause or contrast.",
      "The helmet information adds another service."
    ),
    item(
      "check-2",
      "contrast",
      "The team practiced every afternoon",
      "the final game was still difficult",
      "but",
      "Describe the team's experience.",
      "Show that the game was difficult despite the practice.",
      "The difficult game contrasts with what practice might lead us to expect."
    ),
    item(
      "check-3",
      "result",
      "The class ran out of paper",
      "the teacher ordered another box",
      "so",
      "Explain a supply order.",
      "Show that running out of paper caused the order.",
      "The lack of paper explains the new order."
    ),
    item(
      "check-4",
      "shared",
      "The volunteers sorted the books",
      "placed them on the shelves",
      "and",
      "Describe two volunteer jobs.",
      "Add the second action to the first.",
      "The volunteers completed both actions.",
      "The volunteers"
    ),
    item(
      "check-5",
      "addition",
      "The park has a walking trail",
      "the pool offers swimming lessons",
      "and",
      "Describe local recreation options.",
      "Add another option without showing a cause or contrast.",
      "The swimming lessons add another recreation option."
    ),
    item(
      "check-6",
      "contrast",
      "We reached the shop before noon",
      "it had already closed for the day",
      "but",
      "Explain why you could not shop.",
      "Show the unexpected contrast between arriving early and finding it closed.",
      "The closure contrasts with the hope of shopping before noon."
    ),
    item(
      "check-7",
      "result",
      "The printer ran out of ink",
      "we sent the report by email",
      "so",
      "Explain how you delivered a report.",
      "Show that the printer problem led to using email.",
      "The lack of ink explains the change in delivery."
    ),
    item(
      "check-8",
      "shared",
      "I followed the directions",
      "still needed help",
      "but",
      "Explain why you asked a question.",
      "Show that you needed help despite following the directions.",
      "Needing help contrasts with the hoped-for result of following directions.",
      "I"
    ),
    item(
      "check-9",
      "addition",
      "My brother likes cooking shows",
      "my sister likes nature programs",
      "and",
      "List two family interests.",
      "Simply add another fact; do not emphasize a difference.",
      "And lists the interests without emphasizing their difference."
    ),
    item(
      "check-10",
      "contrast",
      "The box looked small and light",
      "it was too heavy for one person",
      "but",
      "Describe a surprise during a move.",
      "Show that the weight did not match the appearance.",
      "The heavy weight contrasts with how the box looked."
    ),
    item(
      "check-11",
      "result",
      "The hallway lights stopped working",
      "the custodian brought a flashlight",
      "so",
      "Explain the custodian's choice.",
      "Show that the lighting problem led to the action.",
      "The darkness explains bringing a flashlight."
    ),
    item(
      "check-12",
      "shared",
      "The worker cleaned the counter",
      "put away the supplies",
      "and",
      "Report the closing tasks.",
      "Add the second action to the first.",
      "The worker completed both jobs.",
      "The worker"
    ),
  ],
  simpler: [
    item(
      "simpler-1",
      "addition",
      "The room has a sink",
      "the hall has a fountain",
      "and",
      "Describe two places to get water.",
      "Add another fact.",
      "The fountain is another water source."
    ),
    item(
      "simpler-2",
      "contrast",
      "I brought my library card",
      "the library was closed",
      "but",
      "Explain why your visit did not work out.",
      "Show the contrast between being prepared and finding it closed.",
      "The closure prevents the planned visit."
    ),
    item(
      "simpler-3",
      "result",
      "My shoes were wet",
      "I changed into dry ones",
      "so",
      "Explain a change of shoes.",
      "Show that wet shoes led to the change.",
      "The wet shoes explain the action."
    ),
    item(
      "simpler-4",
      "shared",
      "We washed the cups",
      "dried them",
      "and",
      "Describe the cleanup.",
      "Add the second action.",
      "We did both actions.",
      "We"
    ),
    item(
      "simpler-5",
      "addition",
      "The store sells bread",
      "the market sells fruit",
      "and",
      "Describe two places to buy food.",
      "Add another fact.",
      "The fruit information adds a second shopping option."
    ),
    item(
      "simpler-6",
      "contrast",
      "We had tickets to the show",
      "the show was canceled",
      "but",
      "Explain a disappointing change.",
      "Show the contrast between having tickets and being unable to attend.",
      "The cancellation prevents the visit despite having tickets."
    ),
    item(
      "simpler-7",
      "result",
      "My pencil point broke",
      "I sharpened the pencil",
      "so",
      "Explain what you did during class.",
      "Show that the broken point led to the action.",
      "The broken point explains sharpening the pencil."
    ),
    item(
      "simpler-8",
      "shared",
      "The child searched the bag",
      "found no snack",
      "but",
      "Describe an unsuccessful search.",
      "Show the contrast between searching and finding nothing.",
      "The search did not produce the hoped-for snack.",
      "The child"
    ),
  ],
  apply: [
    item(
      "apply-1",
      "addition",
      "The clinic opens at eight",
      "the pharmacy delivers prescriptions",
      "and",
      "Write a community information note.",
      "Add a second service fact without claiming a cause or contrast.",
      "The delivery information adds another useful service fact."
    ),
    item(
      "apply-2",
      "contrast",
      "I can work on Saturday morning",
      "I have class in the afternoon",
      "but",
      "Send a message about your availability.",
      "Emphasize the contrast between available and unavailable times.",
      "The afternoon class limits availability despite the free morning."
    ),
    item(
      "apply-3",
      "result",
      "The meeting time changed to noon",
      "we updated the reminder on the board",
      "so",
      "Explain an updated announcement.",
      "Show that the time change caused the update.",
      "The new time explains why the reminder changed."
    ),
    item(
      "apply-4",
      "shared",
      "Our group checked the schedule",
      "set up the room",
      "and",
      "Report the preparations for an event.",
      "Add the second action to the first.",
      "The group completed both preparations.",
      "Our group"
    ),
  ],
};
export const allItems = Object.values(bank).flat();
export const initialEdit = () => ({ link: null, comma: null });
export const solution = (item) => ({ link: item.link, comma: item.comma });
export function editedText(item, edit, nameMarks = false) {
  const link = Object.hasOwn(linkNames, edit?.link) ? edit.link : "[choose a link]";
  if (nameMarks)
    return `${item.first}. Join: ${edit?.comma === true ? "comma before" : edit?.comma === false ? "no comma before" : "comma choice not selected for"} ${link}. Second part: ${item.second}. Final period.`;
  return `${item.first}${edit?.comma === true ? "," : ""} ${link} ${item.second}.`;
}
export function hint(item) {
  return `Think about the purpose: ${item.purpose} And adds; but contrasts; so shows a result. Then look at the parts separately. Does the second statement name its own subject, or share the subject of the first?`;
}
export function punctuationClue(item) {
  return item.comma
    ? `“${item.first}” and “${item.second}” each have a subject and a complete thought. Use a comma before the linking word to join them in this lesson.`
    : `The subject “${item.subject}” belongs to both actions. “${item.second}” has no subject of its own in this statement. Join the two actions without a comma here.`;
}
export function clue(item) {
  return `Choose ${item.link} to ${linkNames[item.link]}. ${item.meaning} ${punctuationClue(item)}`;
}
export function checkEdit(item, edit) {
  const connection = edit?.link === item.link;
  const punctuation = typeof edit?.comma === "boolean" && edit.comma === item.comma;
  const result = (message) => ({
    correct: connection && punctuation,
    connection,
    punctuation,
    kind: item.kind,
    message,
  });
  if (!Object.hasOwn(linkNames, edit?.link) || typeof edit?.comma !== "boolean")
    return result(
      "Make both choices: a linking word and either Comma before the link or No comma. Then read your message and check again."
    );
  if (!connection)
    return result(
      `${punctuation ? "Your comma choice fits the sentence structure. " : "Check both the linking word and the comma choice. "}The task asks you to ${linkNames[item.link]}. ${edit.link[0].toUpperCase() + edit.link.slice(1)} can connect ideas, but it does not express the requested connection as clearly here. ${item.meaning}${punctuation ? "" : " " + punctuationClue(item)}`
    );
  if (!punctuation)
    return result(`Your linking word expresses the requested meaning. ${punctuationClue(item)}`);
  return result(
    `${item.link[0].toUpperCase() + item.link.slice(1)} fits the purpose. ${item.meaning} ${punctuationClue(item)}`
  );
}
