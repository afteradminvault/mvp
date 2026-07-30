import type { VaultItemType } from "@/domain/vault-items/ports";

/**
 * 🔒 Security-sensitive (US-3.6). Plain HTML/text, same reasoning as the
 * email templates for skipping a PDF-generation dependency — "printable"
 * is satisfied by the browser's own print-to-PDF on a print-styled page,
 * not a server-rendered binary. The one rule that actually matters here:
 * this function's input (itemTypeSummary) is a plain count map with no
 * path to a label, account identifier, or value — there is structurally
 * nothing in its type signature this function *could* leak beyond counts,
 * which is the property src/domain/vault-preview-letters's own test
 * suite exists to keep true.
 */

const ITEM_TYPE_LABELS: Record<VaultItemType, string> = {
  password: "password",
  crypto_seed_phrase: "crypto seed phrase",
  bank_detail: "bank detail",
  domain_login: "domain login",
  subscription: "subscription",
  brokerage_account: "brokerage account",
  custom: "custom item",
};

function pluralize(count: number, label: string): string {
  return count === 1 ? label : `${label}s`;
}

export function renderVaultPreviewLetter(input: {
  caseDisplayName: string;
  itemTypeSummary: Partial<Record<VaultItemType, number>>;
  generatedAt: string;
}): { html: string; text: string } {
  const generatedDate = new Date(input.generatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const lines = (Object.entries(input.itemTypeSummary) as [VaultItemType, number][])
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemType, count]) => `${count} ${pluralize(count, ITEM_TYPE_LABELS[itemType] ?? itemType)}`);

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 640px; margin: 0 auto;">
      <h1 style="font-size: 20px;">Vault Preview Letter</h1>
      <p>${escapeHtml(input.caseDisplayName)} &mdash; generated ${escapeHtml(generatedDate)}</p>
      <p>
        This letter lists the <em>types</em> of items held in the encrypted vault for this Case, by
        count only. It contains no account labels, usernames, or values &mdash; the vault is
        end-to-end encrypted, and its contents cannot be disclosed by AfterVault at all, to anyone,
        under any circumstance.
      </p>
      ${
        lines.length === 0
          ? "<p>No vault items are on file for this Case.</p>"
          : `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
      }
    </div>
  `.trim();

  const text = [
    "Vault Preview Letter",
    `${input.caseDisplayName} — generated ${generatedDate}`,
    "This letter lists the types of items held in the encrypted vault for this Case, by count only. It contains no account labels, usernames, or values — the vault is end-to-end encrypted, and its contents cannot be disclosed by AfterVault at all, to anyone, under any circumstance.",
    lines.length === 0 ? "No vault items are on file for this Case." : lines.map((line) => `- ${line}`).join("\n"),
  ].join("\n\n");

  return { html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
