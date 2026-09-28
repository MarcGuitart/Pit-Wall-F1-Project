/**
 * The one place the product's name lives, for every user-facing string in the
 * frontend. Before this, "Pit Wall IQ" and "Pit Wall Engineer" were both
 * hand-typed literals scattered across tab titles, the generated .ics file
 * and the docs page — free to drift, and they had (Block 22). Mirrors
 * backend/app/core/branding.py; keep the two in sync by hand, since a
 * frontend/backend TypeScript-Python shared-constants build step would be
 * disproportionate for one string.
 */
export const PRODUCT_NAME = 'Pit Wall Engineer'
