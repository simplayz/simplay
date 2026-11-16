// Leaflet treats tooltip/divIcon strings as HTML; imported save names are untrusted.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
}
