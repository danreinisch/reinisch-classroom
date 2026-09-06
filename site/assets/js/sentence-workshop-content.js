// Original, reviewed practice. The separator marks an authored sentence boundary.
// Tasks explicitly require two sentences with a period; other rewrites are out of scope.
function item(id, pair, context = "") {
  const [first, second] = pair.split(" | ");
  const words = `${first} ${second}`.split(" ");
  return Object.freeze({
    id,
    words: Object.freeze(words),
    boundary: first.split(" ").length,
    context,
  });
}

export const models = Object.freeze([
  "Bring your notebook. Class starts at nine.",
  "The gym is open. Practice starts soon.",
]);

export const bank = Object.freeze({
  practice: Object.freeze([
    item("practice-1", "Pack your lunch | the bus arrives soon"),
    item("practice-2", "The library is open | you can return your books"),
    item("practice-3", "Charge your phone | the trip begins tomorrow"),
    item("practice-4", "The oven is hot | use an oven mitt"),
    item("practice-5", "Save your document | the computer needs an update"),
    item("practice-6", "The game is over | the team is packing up"),
    item("practice-7", "Read the directions | the first step is important"),
    item("practice-8", "The rain has stopped | we can walk outside"),
  ]),
  check: Object.freeze([
    item("check-1", "The shop closes at six | we have time to stop there"),
    item("check-2", "Put on your gloves | the garden tools are ready"),
    item("check-3", "The concert starts tonight | our tickets are on the table"),
    item("check-4", "Keep your receipt | the store may need it"),
    item("check-5", "The dog needs water | its bowl is empty"),
    item("check-6", "Our shift ends soon | we need to clean the counter"),
  ]),
  simpler: Object.freeze([
    item("simpler-1", "The bell rang | class ended"),
    item("simpler-2", "The rain stopped | we left"),
    item("simpler-3", "The door opened | everyone entered"),
    item("simpler-4", "The light changed | cars moved"),
  ]),
  apply: Object.freeze([
    item(
      "apply-1",
      "Art club meets today | bring your sketchbook",
      "Repair this school announcement so readers can see both sentences."
    ),
    item(
      "apply-2",
      "Your order is ready | collect it at the counter",
      "Repair this pickup message for a customer."
    ),
    item(
      "apply-3",
      "The meeting starts at four | please arrive on time",
      "Repair this reminder for your group."
    ),
    item(
      "apply-4",
      "The trail is muddy | wear sturdy shoes",
      "Repair this notice for a walking group."
    ),
  ]),
});

export const allItems = Object.freeze(Object.values(bank).flat());

export function initialEdit(_item) {
  return { period: null, capitals: [0] };
}

export function solution(item) {
  return { period: item.boundary, capitals: [0, item.boundary] };
}

export function editedText(item, edit, nameMarks = false) {
  return item.words
    .map((word, index) => {
      const first = edit.capitals.includes(index) ? word[0].toUpperCase() : word[0].toLowerCase();
      const ending = index + 1 === edit.period || index === item.words.length - 1;
      return first + word.slice(1) + (ending ? (nameMarks ? ", period," : ".") : "");
    })
    .join(" ");
}

export function checkEdit(item, edit) {
  const boundary = edit.period === item.boundary;
  const capitals =
    Array.isArray(edit.capitals) &&
    edit.capitals.length === 2 &&
    new Set(edit.capitals).size === 2 &&
    edit.capitals.includes(0) &&
    edit.capitals.includes(item.boundary);
  let message;
  if (!boundary) {
    message =
      edit.period === null
        ? "Choose a gap for the period. Find where the first complete message ends."
        : "That period splits a message in the wrong place. Read the words on each side. Each sentence needs to make sense on its own.";
  } else if (!capitals) {
    message =
      "The period is in the right place. Use a capital at the beginning of each sentence. The other words in this task use lowercase letters.";
  } else {
    message =
      "Both sentences have a complete message. Each begins with a capital and ends with a period.";
  }
  return { boundary, capitals, correct: boundary && capitals, message };
}
