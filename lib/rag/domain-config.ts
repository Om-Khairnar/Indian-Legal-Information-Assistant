export const SUPPORTED_DOMAINS = [
  {
    id: "property-law",
    label: "Property law",
    matchers: ["property"],
    queryMatchers: [
      "property",
      "ownership",
      "owner",
      "sale deed",
      "gift deed",
      "registration",
      "tenant",
      "landlord",
      "rent",
      "possession",
      "title",
      "mortgage",
    ],
  },
  {
    id: "consumer-law",
    label: "Consumer law",
    matchers: ["consumer"],
    queryMatchers: [
      "consumer",
      "complaint",
      "refund",
      "replacement",
      "defective",
      "warranty",
      "product",
      "service",
      "consumer protection",
    ],
  },
  {
    id: "employment-law",
    label: "Employment law",
    matchers: ["employment", "labour", "labor"],
    queryMatchers: [
      "employment",
      "employee",
      "employer",
      "wages",
      "salary",
      "overtime",
      "dismissal",
      "termination",
      "labour",
      "labor",
      "working hours",
      "pay",
    ],
  },
] as const;

export type SupportedDomain = (typeof SUPPORTED_DOMAINS)[number]["id"];

export function detectSupportedDomain(fileName: string): SupportedDomain | null {
  const normalized = fileName.toLowerCase();

  for (const domain of SUPPORTED_DOMAINS) {
    if (domain.matchers.some((matcher) => normalized.includes(matcher))) {
      return domain.id;
    }
  }

  return null;
}

export function getSupportedDomainLabels(): string[] {
  return SUPPORTED_DOMAINS.map((domain) => domain.label);
}

export function inferSupportedDomain(query: string): SupportedDomain | null {
  const normalized = query.toLowerCase();

  for (const domain of SUPPORTED_DOMAINS) {
    if (domain.queryMatchers?.some((matcher) => normalized.includes(matcher))) {
      return domain.id;
    }
  }

  return null;
}