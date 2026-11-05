export const CONTACT_NAME_MAX_LENGTH = 200;
export const CONTACT_EMAIL_MAX_LENGTH = 254;
export const OFFICE_HOURS_MAX_LENGTH = 2000;

export interface InstructorContactInput {
  id?: string;
  name: string;
  email: string;
  officeHours: string | null;
}

export function parseInstructorContacts(
  value: unknown
): { contacts: InstructorContactInput[]; error?: never } | { error: string; contacts?: never } {
  if (!Array.isArray(value)) return { error: 'Instructor contacts must be an array.' };
  const contacts: InstructorContactInput[] = [];
  const seenIds = new Set<string>();
  for (const [index, row] of value.entries()) {
    const prefix = `Instructor ${index + 1}: `;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { error: `${prefix}invalid contact.` };
    }
    const { id, name, email, officeHours } = row;
    if (id !== undefined && (typeof id !== 'string' || !id.trim() || seenIds.has(id))) {
      return { error: `${prefix}invalid or duplicate contact ID.` };
    }
    if (typeof name !== 'string' || !name.trim() || name.trim().length > CONTACT_NAME_MAX_LENGTH) {
      return { error: `${prefix}name is required and must be at most ${CONTACT_NAME_MAX_LENGTH} characters.` };
    }
    if (
      typeof email !== 'string' ||
      email.trim().length > CONTACT_EMAIL_MAX_LENGTH ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return { error: `${prefix}enter a valid email address.` };
    }
    if (
      officeHours != null &&
      (typeof officeHours !== 'string' || officeHours.trim().length > OFFICE_HOURS_MAX_LENGTH)
    ) {
      return { error: `${prefix}office hours must be at most ${OFFICE_HOURS_MAX_LENGTH} characters.` };
    }
    if (id !== undefined) seenIds.add(id);
    contacts.push({
      ...(id !== undefined && { id }),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      officeHours: typeof officeHours === 'string' ? officeHours.trim() || null : null,
    });
  }
  return { contacts };
}
