// Local rule set for the user's diet: milk may only be paired with "safe" fruits.
// Pure functions so the Meals page can warn while typing, without an AI call.

export type DietWarning = { level: "danger" | "caution"; message: string };

const MILK = [
  /\bmilk(?:shake)?s?\b/i,
  /\blatte\b/i,
  /\bcappuccino\b/i,
  /\blassi\b/i,
  /\bteh tarik\b/i,
  /\b(?:kopi|teh)\b(?!\s*-?\s*o\b)/i, // kopi/teh come with milk; kopi-o / teh-o don't
];

export const MILK_SAFE_FRUITS = ["mango", "avocado", "dates", "figs", "papaya"];

const SAFE = /\b(mangoe?s?|avocados?|dates?|figs?|papayas?)\b/i;

const AVOID: { group: string; pattern: RegExp }[] = [
  { group: "Citrus", pattern: /\b(oranges?|lemons?|limes?|grapefruits?|mandarins?|tangerines?|pomelos?|calamansi|yuzu|citrus)\b/i },
  { group: "Berries", pattern: /\b(\w*berr(?:y|ies)|goji)\b/i },
  { group: "Melons", pattern: /\b(\w*melons?|cantaloupes?|honeydews?)\b/i },
];

const OTHER_FRUIT =
  /\b(bananas?|apples?|pears?|grapes?|pineapples?|kiwis?|guavas?|durians?|lychees?|longans?|rambutans?|mangosteens?|jackfruits?|dragon ?fruits?|peach(?:es)?|plums?|cherr(?:y|ies)|pomegranates?|starfruits?)\b/i;

const SUGARY =
  /\b(sugar|syrup|soft drinks?|soda|coke|bubble tea|boba|kaya|condensed milk|desserts?|cakes?|ice cream|candy|sweets|chendol|ice kachang|honey|jam|donuts?|doughnuts?|kuehs?)\b/i;

export function hasMilk(text: string) {
  return MILK.some((re) => re.test(text));
}

/** Check one meal slot. `texts` are the slot's food descriptions; `withMilk` if any was marked as taken with milk. */
export function checkMeal(texts: string[], withMilk: boolean): DietWarning[] {
  const text = texts.join(" \n ");
  const warnings: DietWarning[] = [];
  const milk = withMilk || hasMilk(text);

  if (milk) {
    for (const { group, pattern } of AVOID) {
      const m = text.match(pattern);
      if (m) {
        warnings.push({
          level: "danger",
          message: `Milk + ${m[0].toLowerCase()}: ${group.toLowerCase()} shouldn't be taken with milk. Have it separately, or as juice without milk.`,
        });
      }
    }
    const other = text.match(OTHER_FRUIT);
    if (other) {
      warnings.push({
        level: "caution",
        message: `${capitalize(other[0])} isn't on your milk-safe list (${MILK_SAFE_FRUITS.join(", ")}). Better to have it separately.`,
      });
    }
  }

  const sugar = text.match(SUGARY);
  if (sugar) {
    warnings.push({
      level: "caution",
      message: `${capitalize(sugar[0])} is high in sugar. Keep the portion small and watch your blood sugar.`,
    });
  }
  return warnings;
}

export function isMilkSafePairing(texts: string[], withMilk: boolean) {
  const text = texts.join(" ");
  return (withMilk || hasMilk(text)) && SAFE.test(text) && !checkMeal(texts, withMilk).some((w) => w.level === "danger");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
