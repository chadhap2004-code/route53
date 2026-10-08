"use client";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Input from "@cloudscape-design/components/input";
import type { Tag } from "@/lib/types";

const MAX_TAGS = 50;

export default function TagsEditor({ tags, onChange }: { tags: Tag[]; onChange: (t: Tag[]) => void }) {
  return (
    <AttributeEditor
      items={tags}
      addButtonText="Add tag"
      removeButtonText="Remove"
      disableAddButton={tags.length >= MAX_TAGS}
      onAddButtonClick={() => onChange([...tags, { key: "", value: "" }])}
      onRemoveButtonClick={(e) => onChange(tags.filter((_, i) => i !== e.detail.itemIndex))}
      empty="No tags associated with the resource."
      additionalInfo={`You can add up to ${MAX_TAGS - tags.length} more tags.`}
      definition={[
        {
          label: "Key",
          control: (t, i) => (
            <Input
              value={t.key}
              placeholder="Enter key"
              onChange={(e) => onChange(tags.map((x, j) => (j === i ? { ...x, key: e.detail.value } : x)))}
            />
          ),
          errorText: (t) =>
            !t.key.trim()
              ? "Key is required"
              : tags.filter((x) => x.key === t.key).length > 1
                ? "Keys must be unique"
                : undefined,
        },
        {
          label: "Value - optional",
          control: (t, i) => (
            <Input
              value={t.value}
              placeholder="Enter value"
              onChange={(e) => onChange(tags.map((x, j) => (j === i ? { ...x, value: e.detail.value } : x)))}
            />
          ),
        },
      ]}
    />
  );
}

export function tagsValid(tags: Tag[]): boolean {
  const keys = tags.map((t) => t.key.trim());
  return keys.every(Boolean) && new Set(keys).size === keys.length;
}
