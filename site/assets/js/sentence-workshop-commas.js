// Reviewed item boundaries for supplied lists, not a general punctuation parser.
export const kindNames = {
  single: "separating single-word items",
  grouped: "keeping multiword items together",
  pair: "recognizing two-item lists",
};

export const directions =
  "Read the message and find the separate items. Choose a blank space to add a comma; choose a comma to remove it. Keep the words of each item together. For these clear lists of three or more items, the comma before the final “and” or “or” is optional. Two-item lists need no comma. Check the message when you are ready, even if it needs no changes.";

export const models = [
  {
    title: "Separate the items",
    text: "Pack socks, shirts, and shoes.",
    why: "The three items are socks, shirts, and shoes. Commas show where one item ends. Pack socks, shirts and shoes is also accepted here: the final comma before and is an optional style choice in this clear list.",
  },
  {
    title: "Keep each item together",
    text: "Bring a water bottle, a warm jacket, and a snack.",
    why: "A water bottle is one item, even though it has three words. Put a comma after the whole item, not between water and bottle.",
  },
  {
    title: "Two items work without a comma",
    text: "Bring a pencil and a notebook.",
    why: "There are two items. And joins them without a comma. A list joined with or follows the same idea: Choose soup or salad.",
  },
];

function item(id, kind, prefix, items, context, initial = [], conjunction = "and") {
  const words = prefix.split(" ");
  const ranges = [];
  for (const [index, value] of items.entries()) {
    if (index === items.length - 1) words.push(conjunction);
    const start = words.length;
    words.push(...value.split(" "));
    ranges.push({ start, end: words.length, text: value });
  }
  const ends = ranges.map((range) => range.end);
  const required = items.length > 2 ? ends.slice(0, -2) : [];
  const optional = items.length > 2 ? ends.at(-2) : null;
  return {
    id: `commas-${id}`,
    kind,
    words,
    ranges,
    items,
    context,
    initial,
    conjunction,
    required,
    optional,
  };
}

export const bank = {
  practice: [
    item(
      "practice-1",
      "single",
      "Pack",
      ["socks", "shirts", "shoes"],
      "Make this packing reminder easy to read."
    ),
    item(
      "practice-2",
      "grouped",
      "Bring",
      ["blue folders", "spare pencils", "blank paper"],
      "Edit the list of classroom supplies. Keep each item's describing word with it."
    ),
    item(
      "practice-3",
      "pair",
      "Take",
      ["your notebook", "your charger"],
      "Check the commas in this reminder. Some commas may need to come out.",
      [3]
    ),
    item(
      "practice-4",
      "single",
      "We need",
      ["tape", "glue", "paper", "scissors"],
      "Finish editing this supply list. Keep commas that belong and add any missing ones.",
      [3]
    ),
    item(
      "practice-5",
      "grouped",
      "The helpers",
      ["wipe the tables", "stack the chairs", "sweep the floor"],
      "Make the list of cleanup jobs clear. Each action and its details belong together.",
      [3]
    ),
  ],
  check: [
    item(
      "check-1",
      "single",
      "Buy",
      ["carrots", "potatoes", "onions"],
      "Edit this shopping reminder."
    ),
    item(
      "check-2",
      "grouped",
      "Please bring",
      ["a library card", "a photo ID", "a signed form"],
      "Make the list of required documents clear."
    ),
    item(
      "check-3",
      "pair",
      "We need",
      ["paper clips", "sticky notes"],
      "Review this supply reminder. Check it as written if no commas are needed."
    ),
    item(
      "check-4",
      "single",
      "The kit contains",
      ["string", "tape", "scissors", "glue"],
      "Repair the commas in the kit description.",
      [2]
    ),
    item(
      "check-5",
      "grouped",
      "The crew",
      ["checked the doors", "tested the lights", "locked the gate"],
      "Review this report of the crew's jobs. Change the commas only if needed.",
      [5]
    ),
    item(
      "check-6",
      "pair",
      "Pack",
      ["your lunch", "your keys"],
      "Check this reminder for unnecessary commas.",
      [3]
    ),
    item(
      "check-7",
      "single",
      "Choose",
      ["basketball", "soccer", "volleyball"],
      "Make these activity choices easy to read.",
      [],
      "or"
    ),
    item(
      "check-8",
      "grouped",
      "We ordered",
      ["vegetable soup", "baked potatoes", "fresh fruit"],
      "Repair the commas without splitting up the food names.",
      [3]
    ),
    item(
      "check-9",
      "pair",
      "The helper",
      ["counted the boxes", "closed the van"],
      "Review this report. Keep both complete actions together with their shared subject."
    ),
  ],
  simpler: [
    item("simpler-1", "single", "Get", ["pens", "paper", "tape"], "Try this shorter supply list."),
    item(
      "simpler-2",
      "grouped",
      "Bring",
      ["red cups", "blue plates", "green napkins"],
      "Keep each color with the object it describes."
    ),
    item(
      "simpler-3",
      "pair",
      "Take",
      ["gloves", "boots"],
      "Check this short reminder for an unnecessary comma.",
      [2]
    ),
    item(
      "simpler-4",
      "single",
      "Pack",
      ["hats", "socks", "coats"],
      "Separate the items in this short list."
    ),
    item(
      "simpler-5",
      "grouped",
      "We need",
      ["clean plates", "large bowls", "dry towels"],
      "Keep the words of each item together."
    ),
    item(
      "simpler-6",
      "pair",
      "Choose",
      ["rice", "pasta"],
      "Check this short choice. It may already work.",
      [],
      "or"
    ),
  ],
  apply: [
    item(
      "apply-1",
      "single",
      "Please order",
      ["envelopes", "stamps", "labels"],
      "Send a clear supply request to the school office."
    ),
    item(
      "apply-2",
      "grouped",
      "We will",
      ["set the tables", "fill the pitchers", "greet the guests"],
      "Edit the work plan for a community dinner. Keep each job together.",
      [4]
    ),
    item(
      "apply-3",
      "pair",
      "Please bring",
      ["your identification", "your appointment letter"],
      "Review this appointment reminder before it is sent.",
      [4]
    ),
  ],
};

export const allItems = Object.values(bank).flat();
export const initialEdit = (item) => ({ commas: [...item.initial] });
export const solution = (item) => ({
  commas: [...item.required, ...(item.optional === null ? [] : [item.optional])],
});

export function editedText(item, edit, nameMarks = false) {
  const commas = Array.isArray(edit?.commas) ? edit.commas : [];
  return (
    item.words
      .map(
        (word, index) => word + (commas.includes(index + 1) ? (nameMarks ? ", comma," : ",") : "")
      )
      .join(" ") + (nameMarks ? ", period." : ".")
  );
}

export function clue(item) {
  const named = item.items.map((value) => `“${value}”`).join("; ");
  if (item.items.length === 2)
    return `The two items are ${named}. ${item.conjunction === "and" ? "And" : "Or"} joins these two items without a comma. Remove any commas in this message.`;
  const needed = item.required.map((gap) => `“${item.words[gap - 1]}”`).join(" and ");
  return `The items are ${named}. Add a comma after ${needed}. You may also use a comma before the final ${item.conjunction}. Keep the words inside each item together.`;
}

export function checkEdit(item, edit) {
  const result = (correct, message) => ({ correct, kind: item.kind, message });
  const commas = edit?.commas;
  if (
    !Array.isArray(commas) ||
    new Set(commas).size !== commas.length ||
    commas.some((gap) => !Number.isInteger(gap) || gap < 1 || gap >= item.words.length)
  ) {
    return result(
      false,
      "Use the spaces in the message to add or remove commas, then check again."
    );
  }
  if (item.items.length === 2) {
    return commas.length
      ? result(
          false,
          `This list has two items: “${item.items[0]}” and “${item.items[1]}”. ${item.conjunction === "and" ? "And" : "Or"} joins them without a comma. Remove the extra commas.`
        )
      : result(
          true,
          `These two items work without a comma. ${item.conjunction === "and" ? "And" : "Or"} joins them clearly.`
        );
  }
  const extra = commas.find((gap) => !item.required.includes(gap) && gap !== item.optional);
  if (extra !== undefined) {
    const group = item.ranges.find((range) => extra > range.start && extra < range.end);
    if (group)
      return result(
        false,
        `“${group.text}” is one item. Remove the comma inside it and keep those words together.`
      );
    if (item.words[extra - 1] === item.conjunction)
      return result(
        false,
        `Put a list comma before ${item.conjunction}, not after it. Keep ${item.conjunction} with the last item.`
      );
    return result(
      false,
      `The comma after “${item.words[extra - 1]}” does not separate list items. Remove it; keep the sentence opening attached to the list.`
    );
  }
  const missing = item.required.find((gap) => !commas.includes(gap));
  if (missing !== undefined) {
    const index = item.ranges.findIndex((range) => range.end === missing);
    return result(
      false,
      `A comma is still needed between “${item.items[index]}” and “${item.items[index + 1]}”. Separate the whole items.`
    );
  }
  return result(
    true,
    commas.includes(item.optional)
      ? `The items are separated and their words stay together. You used the Oxford comma before ${item.conjunction}; leaving that final comma out also works in this clear list.`
      : `The items are separated and their words stay together. This clear list works without the final Oxford comma. Adding it before ${item.conjunction} also works.`
  );
}
