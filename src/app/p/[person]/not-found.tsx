import Link from "next/link";

export default function PersonNotFound() {
  // <article>, not <main>: the untouched root layout owns the page's one <main>.
  return (
    <article className="wrap">
      <p className="eyebrow">Mandate · person brief</p>
      <p className="verdict">No person in the registry has that identifier.</p>
      <p className="caveat">
        A brief URL is the registry&rsquo;s own person id, for example{" "}
        <code>/p/pulak-roy-0d657a</code> — a name slug plus six hex characters. Ids change when
        entity resolution merges two rows, and the absorbed id stops resolving.{" "}
        <Link className="body-link" href="/">
          Back to the site
        </Link>
      </p>
    </article>
  );
}
