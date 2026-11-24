import "server-only";

/** Contractor letterhead used on PDFs and the Excel export. Configure via env. */
export const COMPANY = {
  name: process.env.COMPANY_NAME ?? "Dananjaya Construction",
  address: process.env.COMPANY_ADDRESS ?? "Colombo, Sri Lanka",
  phone: process.env.COMPANY_PHONE ?? "",
  email: process.env.COMPANY_EMAIL ?? "",
};
