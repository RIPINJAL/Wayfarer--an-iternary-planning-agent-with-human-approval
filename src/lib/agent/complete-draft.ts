function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function completeDraft(input: unknown, currency: string): { draft: unknown; fields: string[] } {
  if (!isRecord(input) || !Array.isArray(input.days)) return { draft: input, fields: [] };

  const fields: string[] = [];
  const days = input.days.map((value, index) => {
    if (!isRecord(value)) return value;
    const items = (Array.isArray(value.items) ? value.items : []).map((itemValue, itemIndex) => {
      if (!isRecord(itemValue)) return itemValue;
      const item = { ...itemValue };
      const place = isRecord(item.place) ? { ...item.place } : null;

      if (item.title === undefined) {
        const title = place && isText(place.name)
          ? place.name
          : isText(item.description)
            ? item.description.split(/[.!?]/, 1)[0].trim()
            : '';
        if (title) {
          item.title = title.slice(0, 140);
          fields.push(`days.${index + 1}.items.${itemIndex + 1}.title`);
        }
      }
      if (place && place.name === undefined && isText(item.title)) {
        place.name = item.title;
        item.place = place;
        fields.push(`days.${index + 1}.items.${itemIndex + 1}.place.name`);
      }
      return item;
    });
    const titles = items
      .filter(isRecord)
      .map((item) => item.title)
      .filter(isText);
    const day: Record<string, unknown> = { ...value, items };

    if (day.theme === undefined && titles.length) {
      day.theme = titles.slice(0, 2).join(' & ').slice(0, 100);
      fields.push(`days.${index + 1}.theme`);
    }
    if (day.summary === undefined && titles.length) {
      day.summary = `Plan to ${titles.slice(0, 3).join(', ')}.`.slice(0, 400);
      fields.push(`days.${index + 1}.summary`);
    }
    return day;
  });

  const draft: Record<string, unknown> = { ...input, days };
  if (draft.currency === undefined) {
    draft.currency = currency;
    fields.push('currency');
  }
  if (draft.summary === undefined) {
    const summaries = days
      .filter(isRecord)
      .map((day) => day.summary)
      .filter(isText);
    if (summaries.length) {
      draft.summary = summaries.join(' ').slice(0, 700);
      fields.push('summary');
    }
  }

  return { draft, fields };
}
