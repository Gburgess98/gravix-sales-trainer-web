import { redirect } from "next/navigation";

// The real importer lives at /crm/import; this path used to be an unfinished placeholder.
export default function ContactsImportRedirect() {
  redirect("/crm/import");
}
