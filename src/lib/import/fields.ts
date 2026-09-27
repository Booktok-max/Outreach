/**
 * Canonical field dictionary.
 *
 * Every column of an uploaded file is matched against this dictionary. Aliases
 * are stored in *normalized* form (see `normalizeKey` in src/lib/text.ts):
 * lowercase, no punctuation, single spaces, no accents. Add new aliases here -
 * never in the matching code - so the dictionary stays the single source of truth.
 */

export type CanonicalField =
  | "email"
  | "firstName"
  | "lastName"
  | "fullName"
  | "authorName"
  | "organization"
  | "role"
  | "phone"
  | "websiteUrl"
  | "twitterUrl"
  | "instagramUrl"
  | "facebookUrl"
  | "linkedinUrl"
  | "tiktokUrl"
  | "goodreadsUrl"
  | "bookTitle"
  | "subtitle"
  | "seriesName"
  | "seriesPosition"
  | "genre"
  | "description"
  | "bookUrl"
  | "amazonUrl"
  | "isbn"
  | "publisher"
  | "publicationDate"
  | "bookFormat"
  | "language"
  | "notes";

export type FieldGroup = "contact" | "person" | "book" | "meta";

export type FieldKind = "email" | "url" | "text" | "multiline" | "integer" | "date";

export interface CanonicalFieldDefinition {
  field: CanonicalField;
  /** Label shown in the mapping UI. */
  label: string;
  group: FieldGroup;
  kind: FieldKind;
  /** Required for a useful import (the operator is warned when missing). */
  required: boolean;
  /** Low number = more specific; used to break exact-alias ties. */
  priority: number;
  description: string;
  /** Exact match aliases (normalized form). */
  aliases: string[];
  /** Partial-match keywords used for lower confidence suggestions. */
  keywords: string[];
}

export const CANONICAL_FIELD_DEFINITIONS: CanonicalFieldDefinition[] = [
  {
    field: "email",
    label: "Email",
    group: "contact",
    kind: "email",
    required: true,
    priority: 1,
    description: "Primary contact email address. Required for outreach.",
    aliases: [
      "email",
      "email address",
      "e mail",
      "e mail address",
      "emailaddress",
      "mail",
      "mail address",
      "email id",
      "email 1",
      "email address 1",
      "primary email",
      "primary email address",
      "author email",
      "author email address",
      "author mail",
      "writer email",
      "contact email",
      "contact email address",
      "contact mail",
      "business email",
      "work email",
      "publisher email",
      "publicist email",
      "agent email",
      "submission email",
    ],
    keywords: ["email", "mail", "e mail", "inbox"],
  },
  {
    field: "fullName",
    label: "Full name",
    group: "person",
    kind: "text",
    required: false,
    priority: 6,
    description: "Full name of the contact/author.",
    aliases: [
      "name",
      "full name",
      "fullname",
      "contact name",
      "person",
      "person name",
      "contact",
      "contact person",
      "contact full name",
      "contributor",
      "contributor name",
    ],
    keywords: ["name", "person", "contact"],
  },
  {
    field: "authorName",
    label: "Author name",
    group: "person",
    kind: "text",
    required: false,
    priority: 2,
    description: "Author / pen name as it should appear in outreach.",
    aliases: [
      "author name",
      "author",
      "writer name",
      "pen name",
      "penname",
      "pseudonym",
      "byline",
      "author display name",
      "book author",
      "series author",
    ],
    keywords: ["author", "writer", "pen", "byline"],
  },
  {
    field: "firstName",
    label: "First name",
    group: "person",
    kind: "text",
    required: false,
    priority: 3,
    description: "First name (used for personalised merge fields).",
    aliases: [
      "first name",
      "firstname",
      "given name",
      "given names",
      "author first name",
      "fname",
      "forename",
    ],
    keywords: ["first", "given", "fname"],
  },
  {
    field: "lastName",
    label: "Last name",
    group: "person",
    kind: "text",
    required: false,
    priority: 4,
    description: "Last name / surname.",
    aliases: [
      "last name",
      "lastname",
      "surname",
      "family name",
      "family names",
      "author last name",
      "lname",
    ],
    keywords: ["last", "surname", "family", "lname"],
  },
  {
    field: "organization",
    label: "Organization",
    group: "person",
    kind: "text",
    required: false,
    priority: 8,
    description: "Company, imprint, agency or press the contact belongs to.",
    aliases: [
      "organization",
      "organisation",
      "org",
      "company",
      "company name",
      "business",
      "business name",
      "agency",
      "literary agency",
      "imprint",
      "small press",
      "press name",
      "publishing company",
      "employer",
    ],
    keywords: ["organization", "organisation", "org", "company", "business"],
  },
  {
    field: "role",
    label: "Role / title",
    group: "person",
    kind: "text",
    required: false,
    priority: 9,
    description: "Job title or role (e.g. Author, Publicist, Publisher).",
    aliases: [
      "title",
      "role",
      "job title",
      "position",
      "contact role",
      "author role",
      "contributor role",
      "contributor type",
      "occupation",
    ],
    keywords: ["role", "position", "job", "occupation"],
  },
  {
    field: "phone",
    label: "Phone",
    group: "contact",
    kind: "text",
    required: false,
    priority: 20,
    description: "Phone number (stored, not used by V1 exports).",
    aliases: [
      "phone",
      "phone number",
      "telephone",
      "tel",
      "mobile",
      "mobile number",
      "cell",
      "contact number",
    ],
    keywords: ["phone", "telephone", "mobile", "cell"],
  },
  {
    field: "websiteUrl",
    label: "Website",
    group: "contact",
    kind: "url",
    required: false,
    priority: 10,
    description: "Author / contact website.",
    aliases: [
      "website",
      "website url",
      "web site",
      "author website",
      "author site",
      "personal website",
      "homepage",
      "author url",
    ],
    keywords: ["website", "homepage", "site"],
  },
  {
    field: "twitterUrl",
    label: "X / Twitter",
    group: "contact",
    kind: "url",
    required: false,
    priority: 11,
    description: "X (Twitter) profile or handle.",
    aliases: [
      "twitter",
      "twitter url",
      "twitter handle",
      "x twitter",
      "x handle",
      "x url",
      "x profile",
    ],
    keywords: ["twitter", "xcom"],
  },
  {
    field: "instagramUrl",
    label: "Instagram",
    group: "contact",
    kind: "url",
    required: false,
    priority: 12,
    description: "Instagram profile or handle.",
    aliases: ["instagram", "instagram url", "instagram handle", "ig", "insta"],
    keywords: ["instagram", "insta"],
  },
  {
    field: "facebookUrl",
    label: "Facebook",
    group: "contact",
    kind: "url",
    required: false,
    priority: 13,
    description: "Facebook page or profile.",
    aliases: ["facebook", "facebook url", "facebook page", "fb"],
    keywords: ["facebook"],
  },
  {
    field: "linkedinUrl",
    label: "LinkedIn",
    group: "contact",
    kind: "url",
    required: false,
    priority: 14,
    description: "LinkedIn profile.",
    aliases: ["linkedin", "linkedin url", "linkedin profile"],
    keywords: ["linkedin"],
  },
  {
    field: "tiktokUrl",
    label: "TikTok",
    group: "contact",
    kind: "url",
    required: false,
    priority: 15,
    description: "TikTok profile or handle.",
    aliases: ["tiktok", "tiktok url", "tiktok handle", "booktok", "booktok url"],
    keywords: ["tiktok", "booktok"],
  },
  {
    field: "goodreadsUrl",
    label: "Goodreads",
    group: "contact",
    kind: "url",
    required: false,
    priority: 16,
    description: "Goodreads author profile.",
    aliases: ["goodreads", "goodreads url", "goodreads profile", "goodreads author"],
    keywords: ["goodreads"],
  },
  {
    field: "bookTitle",
    label: "Book title",
    group: "book",
    kind: "text",
    required: false,
    priority: 5,
    description: "Title of the book the contact is associated with.",
    aliases: [
      "title",
      "book",
      "book title",
      "book name",
      "title of book",
      "novel",
      "novel title",
      "work title",
      "story title",
      "product title",
    ],
    keywords: ["book", "title", "novel", "work"],
  },
  {
    field: "subtitle",
    label: "Subtitle",
    group: "book",
    kind: "text",
    required: false,
    priority: 21,
    description: "Book subtitle, if the source data separates it.",
    aliases: ["subtitle", "book subtitle", "sub title"],
    keywords: ["subtitle"],
  },
  {
    field: "seriesName",
    label: "Series",
    group: "book",
    kind: "text",
    required: false,
    priority: 17,
    description: "Series the book belongs to.",
    aliases: [
      "series",
      "series name",
      "series title",
      "book series",
      "collection",
      "saga",
      "trilogy",
    ],
    keywords: ["series", "collection", "saga", "trilogy"],
  },
  {
    field: "seriesPosition",
    label: "Series number",
    group: "book",
    kind: "integer",
    required: false,
    priority: 22,
    description: "Position of the book inside its series (e.g. 2 of 5).",
    aliases: [
      "series number",
      "series position",
      "book number",
      "book number in series",
      "volume",
      "volume number",
      "installment",
      "part",
    ],
    keywords: ["series number", "volume", "installment"],
  },
  {
    field: "genre",
    label: "Genre",
    group: "book",
    kind: "text",
    required: false,
    priority: 18,
    description: "Genre or category of the book.",
    aliases: [
      "genre",
      "genres",
      "book genre",
      "category",
      "categories",
      "book category",
      "subject",
      "subjects",
      "bissac",
      "bisac code",
    ],
    keywords: ["genre", "category", "categor", "genre", "subject"],
  },
  {
    field: "description",
    label: "Description",
    group: "book",
    kind: "multiline",
    required: false,
    priority: 23,
    description: "Book blurb / synopsis. May contain commas, quotes and newlines.",
    aliases: [
      "description",
      "book description",
      "synopsis",
      "blurb",
      "summary",
      "book summary",
      "about the book",
      "plot",
      "annotation",
      "book blurb",
    ],
    keywords: ["description", "synopsis", "blurb", "summary", "plot"],
  },
  {
    field: "bookUrl",
    label: "Book URL",
    group: "book",
    kind: "url",
    required: false,
    priority: 19,
    description: "Canonical link to the book page.",
    aliases: [
      "book url",
      "book link",
      "link",
      "url",
      "book page",
      "product url",
      "product link",
      "listing url",
      "website link",
    ],
    keywords: ["book link", "book url", "product link", "listing"],
  },
  {
    field: "amazonUrl",
    label: "Amazon URL",
    group: "book",
    kind: "url",
    required: false,
    priority: 7,
    description: "Amazon product link.",
    aliases: [
      "amazon",
      "amazon url",
      "amazon link",
      "amazon page",
      "amazon product url",
      "amazon product link",
      "amazon asin",
      "kindle url",
      "kindle link",
    ],
    keywords: ["amazon", "kindle", "asin"],
  },
  {
    field: "isbn",
    label: "ISBN",
    group: "book",
    kind: "text",
    required: false,
    priority: 24,
    description: "ISBN-10 / ISBN-13.",
    aliases: ["isbn", "isbn 10", "isbn 13", "isbn10", "isbn13", "isbn number", "ebook isbn"],
    keywords: ["isbn"],
  },
  {
    field: "publisher",
    label: "Publisher",
    group: "book",
    kind: "text",
    required: false,
    priority: 25,
    description: "Publisher / imprint of the book.",
    aliases: [
      "publisher",
      "publisher name",
      "publishing house",
      "press",
      "book publisher",
      "imprint name",
    ],
    keywords: ["publisher", "publishing", "press"],
  },
  {
    field: "publicationDate",
    label: "Publication date",
    group: "book",
    kind: "date",
    required: false,
    priority: 26,
    description: "Publication / release date.",
    aliases: [
      "publication date",
      "pub date",
      "published",
      "published date",
      "publish date",
      "release date",
      "publication year",
      "date published",
    ],
    keywords: ["pub", "publication", "release date", "published"],
  },
  {
    field: "bookFormat",
    label: "Format",
    group: "book",
    kind: "text",
    required: false,
    priority: 27,
    description: "Format / edition (eBook, Paperback, Hardcover, Audiobook).",
    aliases: ["format", "book format", "edition", "binding", "media format", "book type"],
    keywords: ["format", "edition", "binding"],
  },
  {
    field: "language",
    label: "Language",
    group: "book",
    kind: "text",
    required: false,
    priority: 28,
    description: "Language of the book.",
    aliases: ["language", "book language", "lang"],
    keywords: ["language"],
  },
  {
    field: "notes",
    label: "Notes",
    group: "meta",
    kind: "multiline",
    required: false,
    priority: 29,
    description: "Free-form notes carried over to the person record (internal only).",
    aliases: ["notes", "note", "comments", "comment", "remarks", "internal notes", "memo"],
    keywords: ["notes", "comments", "remarks"],
  },
];

/** Fields that describe the same concept; ties between them are not ambiguous. */
export const FIELD_SIBLINGS: Partial<Record<CanonicalField, CanonicalField[]>> = {
  fullName: ["authorName"],
  authorName: ["fullName"],
};

export const FIELD_BY_KEY: Record<CanonicalField, CanonicalFieldDefinition> =
  CANONICAL_FIELD_DEFINITIONS.reduce(
    (acc, definition) => {
      acc[definition.field] = definition;
      return acc;
    },
    {} as Record<CanonicalField, CanonicalFieldDefinition>,
  );

export const ALL_CANONICAL_FIELDS: CanonicalField[] = CANONICAL_FIELD_DEFINITIONS.map(
  (definition) => definition.field,
);

export const REQUIRED_CANONICAL_FIELDS: CanonicalField[] = CANONICAL_FIELD_DEFINITIONS.filter(
  (definition) => definition.required,
).map((definition) => definition.field);

/** At least one of these must be present for a row to be actionable. */
export const IDENTIFYING_FIELDS: CanonicalField[] = [
  "email",
  "fullName",
  "authorName",
  "firstName",
  "lastName",
  "bookTitle",
];

export function isCanonicalField(value: unknown): value is CanonicalField {
  return typeof value === "string" && value in FIELD_BY_KEY;
}

export function getFieldDefinition(field: CanonicalField): CanonicalFieldDefinition {
  return FIELD_BY_KEY[field];
}

export function getFieldLabel(field: CanonicalField): string {
  return FIELD_BY_KEY[field].label;
}

export function areSiblingFields(a: CanonicalField, b: CanonicalField): boolean {
  return (FIELD_SIBLINGS[a] ?? []).includes(b);
}

/** Fields written to the person record rather than the book record. */
export const PERSON_FIELDS: CanonicalField[] = CANONICAL_FIELD_DEFINITIONS.filter(
  (definition) => definition.group === "person" || definition.group === "contact",
).map((definition) => definition.field);

export const BOOK_FIELDS: CanonicalField[] = CANONICAL_FIELD_DEFINITIONS.filter(
  (definition) => definition.group === "book",
).map((definition) => definition.field);

export const URL_FIELDS: CanonicalField[] = CANONICAL_FIELD_DEFINITIONS.filter(
  (definition) => definition.kind === "url",
).map((definition) => definition.field);
