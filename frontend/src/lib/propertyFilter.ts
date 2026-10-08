// Helpers for the "Filter by property or value" bars on the hosted zones and records tables.
// The API takes one value per filter (q, type, ...), so a query keeps at most one token per property:
// adding a second "Type = ..." token replaces the first, and a new free-text token replaces the old one.
import type { PropertyFilterProps } from "@cloudscape-design/components/property-filter";

export const EMPTY_QUERY: PropertyFilterProps.Query = { tokens: [], operation: "and" };

/**
 * Keep only the newest token for each property (free text counts as one property). Property tokens
 * must use one of the listed options (matched ignoring case), so a typo can't reach the API.
 */
export function cleanQuery(
  query: PropertyFilterProps.Query,
  options: ReadonlyArray<PropertyFilterProps.FilteringOption>,
): PropertyFilterProps.Query {
  const seen = new Set<string>();
  const tokens: PropertyFilterProps.Token[] = [];
  for (const t of [...query.tokens].reverse()) {
    const key = t.propertyKey ?? "";
    if (seen.has(key)) continue;
    if (t.propertyKey) {
      const option = options.find(
        (o) => o.propertyKey === t.propertyKey && o.value.toLowerCase() === String(t.value ?? "").trim().toLowerCase(),
      );
      if (!option) continue;
      tokens.unshift({ ...t, value: option.value });
    } else {
      tokens.unshift(t);
    }
    seen.add(key);
  }
  return { tokens, operation: "and" };
}

/** Value of the token for a property, or of the free-text token when `propertyKey` is undefined. */
export function tokenValue(query: PropertyFilterProps.Query, propertyKey?: string): string {
  const token = query.tokens.find((t) => t.propertyKey === propertyKey);
  return token ? String(token.value ?? "").trim() : "";
}

export function queryWithText(text: string): PropertyFilterProps.Query {
  return text ? { tokens: [{ operator: ":", value: text }], operation: "and" } : EMPTY_QUERY;
}

export const PROPERTY_FILTER_I18N: PropertyFilterProps.I18nStrings = {
  dismissAriaLabel: "Dismiss",
  clearAriaLabel: "Clear",
  groupValuesText: "Values",
  groupPropertiesText: "Properties",
  operatorsText: "Operators",
  operationAndText: "and",
  operationOrText: "or",
  operatorEqualsText: "Equals",
  operatorDoesNotEqualText: "Does not equal",
  operatorContainsText: "Contains",
  operatorDoesNotContainText: "Does not contain",
  editTokenHeader: "Edit filter",
  propertyText: "Property",
  operatorText: "Operator",
  valueText: "Value",
  cancelActionText: "Cancel",
  applyActionText: "Apply",
  allPropertiesLabel: "All properties",
  tokenLimitShowMore: "Show more",
  tokenLimitShowFewer: "Show fewer",
  clearFiltersText: "Clear filters",
  removeTokenButtonAriaLabel: (t) => `Remove filter ${t.propertyLabel} ${t.operator} ${t.value}`,
  enteredTextLabel: (text) => `Use: "${text}"`,
};
